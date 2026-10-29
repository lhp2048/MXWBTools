from datetime import datetime, timezone

from src.cache.query import holidays_today
from src.ingest.zh_names import zh_name


def country_tiles(payload, at_utc=None):
    if not payload:
        return []
    if at_utc is None:
        at_utc = datetime.now(timezone.utc)
    resting = {item["code"]: item for item in holidays_today(payload, at_utc)}
    failed = set((payload.get("stats") or {}).get("failed") or [])
    counts = _holiday_counts(payload)
    tiles = []
    countries = payload.get("countries") or {}
    for code in sorted(countries.keys()):
        info = countries.get(code) or {}
        rest = resting.get(code)
        holiday_count = counts.get(code, 0)
        if rest:
            status = "resting"
        elif holiday_count:
            status = "ok"
        else:
            status = "empty"
        tiles.append(
            _tile(
                code,
                info.get("name"),
                info.get("tz"),
                holiday_count,
                status,
                rest,
            )
        )
    for code in sorted(failed):
        if code in countries:
            continue
        tiles.append(_tile(code, code, None, 0, "failed", None))
    return tiles


def _holiday_counts(payload):
    counts = {}
    for items in (payload.get("byDate") or {}).values():
        for item in items:
            code = item.get("code")
            if not code:
                continue
            counts[code] = counts.get(code, 0) + 1
    return counts


def _tile(code, en_name, tz_name, holiday_count, status, rest):
    row = {
        "code": code,
        "name": en_name or code,
        "zhName": zh_name(code, en_name or code),
        "tz": tz_name,
        "holidayCount": holiday_count,
        "status": status,
    }
    if rest:
        row["holidayName"] = rest.get("name")
        row["spanStart"] = rest.get("spanStart")
        row["spanEnd"] = rest.get("spanEnd")
        row["spanDays"] = rest.get("spanDays")
        row["remainingDays"] = rest.get("remainingDays")
    return row
