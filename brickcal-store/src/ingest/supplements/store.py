import json
from pathlib import Path

from src.ingest.supplements.sources import validate_entry

DEFAULT_REGISTRY = {
    "countries": [
        {"code": "CN", "source": "holiday-cn", "enabled": True},
    ]
}


class SupplementStore:
    def __init__(self, cache_dir):
        self.cache_dir = Path(cache_dir)
        self.root = self.cache_dir / "supplements"
        self.root.mkdir(parents=True, exist_ok=True)

    def registry_path(self):
        return self.root / "registry.json"

    def overlay_path(self, code, year=None):
        code = str(code).strip().upper()
        if year:
            return self.root / ("%s-%s.json" % (code, int(year)))
        return self.root / ("%s.json" % code)

    def read_registry(self):
        path = self.registry_path()
        if not path.is_file():
            self.write_registry(DEFAULT_REGISTRY)
            return json.loads(json.dumps(DEFAULT_REGISTRY))
        data = json.loads(path.read_text(encoding="utf-8"))
        countries = []
        for item in (data or {}).get("countries") or []:
            try:
                code, source = validate_entry(item.get("code"), item.get("source"))
            except ValueError:
                continue
            countries.append(
                {
                    "code": code,
                    "source": source,
                    "enabled": bool(item.get("enabled", True)),
                }
            )
        return {"countries": countries}

    def write_registry(self, data):
        countries = []
        seen = set()
        for item in (data or {}).get("countries") or []:
            code, source = validate_entry(item.get("code"), item.get("source"))
            if code in seen:
                raise ValueError("国家 %s 已在维护列表中" % code)
            seen.add(code)
            countries.append(
                {
                    "code": code,
                    "source": source,
                    "enabled": bool(item.get("enabled", True)),
                }
            )
        payload = {"countries": countries}
        self._atomic_write(self.registry_path(), payload)
        return payload

    def upsert_entry(self, code, source, enabled=True):
        code, source = validate_entry(code, source)
        registry = self.read_registry()
        found = False
        for item in registry["countries"]:
            if item["code"] == code:
                item["source"] = source
                item["enabled"] = bool(enabled)
                found = True
                break
        if not found:
            registry["countries"].append(
                {"code": code, "source": source, "enabled": bool(enabled)}
            )
        return self.write_registry(registry)

    def remove_entry(self, code):
        code = str(code or "").strip().upper()
        registry = self.read_registry()
        registry["countries"] = [
            item for item in registry["countries"] if item["code"] != code
        ]
        legacy = self.overlay_path(code)
        if legacy.is_file():
            legacy.unlink()
        for path in self.root.glob("%s-*.json" % code):
            path.unlink()
        return self.write_registry(registry)

    def write_overlay(self, overlay):
        code = str((overlay or {}).get("code") or "").strip().upper()
        if not code:
            raise ValueError("overlay missing code")
        year = (overlay or {}).get("year")
        path = self.overlay_path(code, year if year else None)
        self._atomic_write(path, overlay)
        if year:
            self._drop_legacy_if_same_year(code, year)
        return overlay

    def read_overlays(self, entries=None):
        if entries is None:
            entries = [
                item for item in self.read_registry()["countries"] if item.get("enabled")
            ]
        overlays = []
        for item in entries:
            overlays.extend(self._read_country_overlays(item.get("code")))
        return overlays

    def _read_country_overlays(self, code):
        code = str(code or "").strip().upper()
        if not code:
            return []
        loaded = []
        years = set()
        paths = sorted(self.root.glob("%s-*.json" % code))
        for path in paths:
            overlay = json.loads(path.read_text(encoding="utf-8"))
            year = overlay.get("year")
            if year is not None:
                years.add(int(year))
            loaded.append(overlay)
        legacy = self.overlay_path(code)
        if legacy.is_file():
            overlay = json.loads(legacy.read_text(encoding="utf-8"))
            year = overlay.get("year")
            if year is None or int(year) not in years:
                loaded.append(overlay)
        loaded.sort(key=lambda item: int(item.get("year") or 0))
        return loaded

    def _drop_legacy_if_same_year(self, code, year):
        legacy = self.overlay_path(code)
        if not legacy.is_file():
            return
        try:
            old = json.loads(legacy.read_text(encoding="utf-8"))
        except ValueError:
            return
        old_year = old.get("year")
        if old_year is None or int(old_year) == int(year):
            legacy.unlink()

    def _atomic_write(self, path, data):
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(path.suffix + ".tmp")
        tmp.write_text(
            json.dumps(data, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        tmp.replace(path)
