from datetime import date, datetime, timezone

from src.cache.spans import rest_span_on_date

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover
    ZoneInfo = None


def holidays_on_date(payload, date_str):
    countries = payload.get("countries") or {}
    items = []
    for item in (payload.get("byDate") or {}).get(date_str, []):
        info = countries.get(item["code"]) or {}
        row = {
            "code": item["code"],
            "name": item["name"],
            "countryName": info.get("name", item["code"]),
        }
        if item.get("kind"):
            row["kind"] = item.get("kind")
        if item.get("reason"):
            row["reason"] = item.get("reason")
        row.update(_span_fields(payload, item["code"], date_str))
        items.append(row)
    return items


def holidays_today(payload, at_utc):
    if at_utc.tzinfo is None:
        at_utc = at_utc.replace(tzinfo=timezone.utc)
    else:
        at_utc = at_utc.astimezone(timezone.utc)

    countries = payload.get("countries") or {}
    by_date = payload.get("byDate") or {}
    results = []
    for code, info in countries.items():
        local_date = _local_date(at_utc, (info or {}).get("tz"))
        span = rest_span_on_date(payload, code, local_date)
        if span is None:
            continue
        names = [
            item["name"]
            for item in by_date.get(local_date, [])
            if item.get("code") == code
        ]
        name = names[0] if names else "休假"
        row = {
            "code": code,
            "name": name,
            "countryName": (info or {}).get("name", code),
            "localDate": local_date,
        }
        row.update(_span_fields(payload, code, local_date, span))
        results.append(row)
    results.sort(key=lambda item: item["code"])
    return results


def holidays_for_country(payload, code):
    code = str(code or "").strip().upper()
    info = (payload.get("countries") or {}).get(code)
    if info is None:
        return None
    holidays = []
    for date, items in sorted((payload.get("byDate") or {}).items()):
        for item in items:
            if item["code"] == code:
                row = {"date": date, "name": item["name"]}
                if item.get("kind"):
                    row["kind"] = item.get("kind")
                if item.get("reason"):
                    row["reason"] = item.get("reason")
                holidays.append(row)
    return {
        "code": code,
        "name": info.get("name"),
        "tz": info.get("tz"),
        "holidays": holidays,
    }


def _span_fields(payload, code, date_str, span=None):
    if span is None:
        span = rest_span_on_date(payload, code, date_str)
    if not span:
        return {}
    remaining = None
    elapsed = None
    try:
        remaining = max(
            0, (date.fromisoformat(span["end"]) - date.fromisoformat(date_str)).days
        )
        elapsed = span["days"] - remaining
    except ValueError:
        remaining = span.get("days")
        elapsed = 0
    return {
        "spanStart": span["start"],
        "spanEnd": span["end"],
        "spanDays": span["days"],
        "remainingDays": remaining,
        "elapsedDays": elapsed,
    }


def _local_date(at_utc, tz_name):
    tz_name = tz_name or "UTC"
    tz = timezone.utc
    if ZoneInfo is not None:
        try:
            tz = ZoneInfo(tz_name)
        except Exception:
            tz = timezone.utc
    return at_utc.astimezone(tz).date().isoformat()
