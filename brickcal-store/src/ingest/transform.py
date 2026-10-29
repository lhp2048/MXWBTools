from datetime import datetime, timezone

from src.ingest.constants import ATTRIBUTION, LICENSE, SCHEMA_VERSION, SOURCE, SOURCE_URL


def _norm_code(code):
    return str(code or "").strip().upper()


def build_payload(
    year,
    countries,
    holidays_by_code,
    failed,
    tz_lookup,
    updated_at=None,
):
    country_index = {}
    by_date = {}
    holiday_count = 0

    holidays_norm = {}
    for raw_code, items in (holidays_by_code or {}).items():
        holidays_norm[_norm_code(raw_code)] = items or []

    for item in countries or []:
        code = _norm_code(item.get("code"))
        if not code:
            continue
        name = (item.get("name") or code).strip()
        country_index[code] = {
            "name": name,
            "tz": tz_lookup(code) or "UTC",
        }
        for holiday in holidays_norm.get(code, []):
            date = str(holiday.get("date") or "").strip()
            holiday_name = str(holiday.get("name") or "").strip()
            if not date or not holiday_name:
                continue
            by_date.setdefault(date, []).append({"code": code, "name": holiday_name})
            holiday_count += 1

    failed_codes = []
    for code in failed or []:
        norm = _norm_code(code)
        if norm and norm not in failed_codes:
            failed_codes.append(norm)

    if updated_at is None:
        updated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    return {
        "schemaVersion": SCHEMA_VERSION,
        "year": int(year),
        "source": SOURCE,
        "sourceUrl": SOURCE_URL,
        "license": LICENSE,
        "attribution": ATTRIBUTION,
        "updatedAt": updated_at,
        "countries": country_index,
        "byDate": dict(sorted(by_date.items())),
        "stats": {
            "countryCount": len(country_index),
            "holidayCount": holiday_count,
            "failed": failed_codes,
        },
    }
