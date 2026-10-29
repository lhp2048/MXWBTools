from datetime import date, timedelta


def rest_span_on_date(payload, code, date_str):
    code = str(code or "").strip().upper()
    info = (payload.get("countries") or {}).get(code) or {}
    holiday_dates, _names_by_date = _holiday_dates(payload, code)
    try:
        target = date.fromisoformat(date_str)
    except ValueError:
        return None
    rest = _rest_days(holiday_dates, info.get("workdays") or [])
    if target not in rest:
        return None
    spans = _holiday_rest_spans(holiday_dates, info.get("workdays") or [])
    for span in spans:
        start = date.fromisoformat(span["start"])
        end = date.fromisoformat(span["end"])
        if start <= target <= end:
            return span
    return None


def _holiday_dates(payload, code):
    dates = []
    names_by_date = {}
    for day, items in (payload.get("byDate") or {}).items():
        for item in items:
            if item.get("code") != code:
                continue
            dates.append(day)
            names_by_date.setdefault(day, [])
            name = (item.get("name") or "").strip()
            if name and name not in names_by_date[day]:
                names_by_date[day].append(name)
    return sorted(set(dates)), names_by_date


def _holiday_rest_spans(holiday_dates, workdays):
    rest = _rest_days(holiday_dates, workdays)
    holiday_set = set(holiday_dates)
    names_lookup = {}
    spans = []
    current = []
    for day in sorted(rest):
        if not current or day == current[-1] + timedelta(days=1):
            current.append(day)
            continue
        _append_span(spans, current, holiday_set)
        current = [day]
    _append_span(spans, current, holiday_set)
    return spans


def _append_span(spans, days, holiday_set):
    if not days:
        return
    iso_days = [day.isoformat() for day in days]
    holidays_in_span = [d for d in iso_days if d in holiday_set]
    if not holidays_in_span:
        return
    spans.append(
        {
            "start": iso_days[0],
            "end": iso_days[-1],
            "days": len(iso_days),
        }
    )


def _rest_days(holiday_dates, workdays):
    holiday_set = set(holiday_dates or [])
    work_set = set(workdays or [])
    if not holiday_set:
        return set()
    parsed = [date.fromisoformat(d) for d in holiday_set]
    begin = min(parsed) - timedelta(days=8)
    finish = max(parsed) + timedelta(days=8)
    rest = set()
    cursor = begin
    while cursor <= finish:
        iso = cursor.isoformat()
        if iso in work_set:
            cursor += timedelta(days=1)
            continue
        if iso in holiday_set or cursor.weekday() >= 5:
            rest.add(cursor)
        cursor += timedelta(days=1)
    return rest
