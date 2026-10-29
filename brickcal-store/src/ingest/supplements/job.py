from datetime import datetime, timezone

from src.cache.store import CacheStore
from src.ingest.supplements.holiday_cn import fetch_holiday_cn
from src.ingest.supplements.merge import apply_supplements
from src.ingest.supplements.sources import SOURCE_HOLIDAY_CN
from src.ingest.supplements.store import SupplementStore


def fetch_overlay(source, code, year, http_get):
    if source == SOURCE_HOLIDAY_CN:
        return fetch_holiday_cn(year, http_get, code=code)
    raise ValueError("未知数据源：%s" % source)


def apply_saved_supplements(payload, cache_dir, updated_at=None):
    overlays = SupplementStore(cache_dir).read_overlays()
    if not overlays:
        return payload
    return apply_supplements(payload, overlays, updated_at=updated_at)


def run_supplement_update(
    cache_dir,
    http_get,
    log=None,
    now=None,
    fetch_overlay_fn=None,
):
    log = print if log is None else log
    if now is None:
        now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    fetch_overlay_fn = fetch_overlay_fn or fetch_overlay

    cache = CacheStore(cache_dir)
    payload = cache.read_payload()
    if payload is None:
        raise RuntimeError("还没有 caldays 数据，请先手动获取一次公共假")

    store = SupplementStore(cache_dir)
    overlays = []
    for entry in store.read_registry()["countries"]:
        if not entry.get("enabled"):
            log("[INFO] skip disabled %s" % entry.get("code"))
            continue
        code = entry["code"]
        source = entry["source"]
        log("[INFO] fetching %s from %s" % (code, source))
        overlay = fetch_overlay_fn(source, code, payload.get("year"), http_get)
        overlay["updatedAt"] = now
        store.write_overlay(overlay)
        overlays.append(overlay)
        log(
            "[OK] %s rest=%s workdays=%s"
            % (
                code,
                len(overlay.get("restDays") or []),
                len(overlay.get("workdays") or []),
            )
        )

    merged = apply_supplements(payload, overlays, updated_at=now)
    cache.write_payload(merged)
    stats = merged.get("stats") or {}
    log(
        "[OK] merged extraRest=%s countries=%s"
        % (stats.get("supplementRestDays", 0), stats.get("supplementCountries", 0))
    )
    return merged
