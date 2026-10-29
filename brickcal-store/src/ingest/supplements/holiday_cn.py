HOLIDAY_CN_URL = (
    "https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/%s.json"
)


def parse_holiday_cn(raw, source_url, code="CN"):
    rest_days = []
    workdays = []
    for item in (raw or {}).get("days") or []:
        date = str(item.get("date") or "").strip()
        name = str(item.get("name") or "").strip() or "调休"
        if not date:
            continue
        if item.get("isOffDay"):
            rest_days.append(
                {
                    "date": date,
                    "name": name,
                    "kind": "adjusted",
                    "reason": name + "调休",
                }
            )
        else:
            workdays.append(
                {
                    "date": date,
                    "name": name,
                    "kind": "workday",
                    "reason": name + "补班",
                }
            )
    return {
        "code": str(code or "CN").strip().upper(),
        "source": "holiday-cn",
        "sourceUrl": source_url,
        "year": (raw or {}).get("year"),
        "papers": list((raw or {}).get("papers") or []),
        "restDays": rest_days,
        "workdays": workdays,
    }


def fetch_holiday_cn(year, http_get, code="CN"):
    url = HOLIDAY_CN_URL % int(year)
    raw = http_get(url)
    return parse_holiday_cn(raw, url, code=code)
