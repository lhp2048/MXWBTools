def strip_supplements(payload):
    payload = _copy(payload)
    by_date = payload.get("byDate") or {}
    cleaned = {}
    for day, items in by_date.items():
        kept = [
            item
            for item in (items or [])
            if (item or {}).get("kind") != "adjusted"
        ]
        if kept:
            cleaned[day] = kept
    payload["byDate"] = cleaned
    for info in (payload.get("countries") or {}).values():
        if isinstance(info, dict):
            info.pop("workdays", None)
    payload.pop("supplements", None)
    stats = payload.get("stats")
    if isinstance(stats, dict):
        stats.pop("supplementCountries", None)
        stats.pop("supplementRestDays", None)
    return payload


def apply_supplements(payload, overlays, updated_at=None):
    payload = strip_supplements(payload)
    by_date = payload.setdefault("byDate", {})
    countries = payload.setdefault("countries", {})
    supplements = {}
    extra_count = 0

    for overlay in overlays or []:
        if not overlay:
            continue
        code = str(overlay.get("code") or "").strip().upper()
        if not code or code not in countries:
            continue
        existing = _dates_for(by_date, code)
        workdays = sorted(
            {
                str(item.get("date") or "").strip()
                for item in (overlay.get("workdays") or [])
                if item.get("date")
            }
        )
        countries[code]["workdays"] = workdays
        added = 0
        for item in overlay.get("restDays") or []:
            date = str(item.get("date") or "").strip()
            name = str(item.get("name") or "").strip() or "休假"
            if not date or date in existing:
                continue
            by_date.setdefault(date, []).append(
                {
                    "code": code,
                    "name": name,
                    "kind": "adjusted",
                    "reason": item.get("reason") or (name + "调休"),
                }
            )
            existing.add(date)
            added += 1
        extra_count += added
        supplements[code] = {
            "source": overlay.get("source"),
            "sourceUrl": overlay.get("sourceUrl"),
            "updatedAt": overlay.get("updatedAt") or updated_at,
            "papers": list(overlay.get("papers") or []),
            "extraRestDays": added,
            "workdays": len(workdays),
        }

    payload["byDate"] = dict(sorted(by_date.items()))
    if supplements:
        payload["supplements"] = supplements
    stats = payload.setdefault("stats", {})
    stats["holidayCount"] = sum(len(items) for items in payload["byDate"].values())
    stats["supplementCountries"] = len(supplements)
    stats["supplementRestDays"] = extra_count
    return payload


def _dates_for(by_date, code):
    dates = set()
    for day, items in (by_date or {}).items():
        for item in items or []:
            if item.get("code") == code:
                dates.add(day)
    return dates


def _copy(payload):
    import json

    return json.loads(json.dumps(payload))
