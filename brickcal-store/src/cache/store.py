import json
from pathlib import Path


class CacheStore:
    def __init__(self, cache_dir):
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    def payload_path(self, year):
        return self.cache_dir / ("holidays-%s.json" % year)

    def write_payload(self, payload):
        year = payload["year"]
        self._atomic_write(self.payload_path(year), payload)
        self._atomic_write(self.cache_dir / "holidays.json", payload)
        meta = {
            "year": year,
            "updatedAt": payload.get("updatedAt"),
            "source": payload.get("source"),
            "license": payload.get("license"),
            "attribution": payload.get("attribution"),
            "stats": payload.get("stats"),
        }
        self._atomic_write(self.cache_dir / "meta.json", meta)

    def read_payload(self, year=None):
        if year is None:
            meta = self.read_meta()
            if not meta:
                return None
            year = meta.get("year")
        if year is None:
            return None
        path = self.payload_path(year)
        if not path.is_file():
            return None
        return json.loads(path.read_text(encoding="utf-8"))

    def read_meta(self):
        path = self.cache_dir / "meta.json"
        if not path.is_file():
            return None
        return json.loads(path.read_text(encoding="utf-8"))

    def _atomic_write(self, path, data):
        tmp = path.with_suffix(path.suffix + ".tmp")
        tmp.write_text(
            json.dumps(data, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        tmp.replace(path)
