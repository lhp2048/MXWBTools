import argparse
import os
import sys
import time
from pathlib import Path

from src.cache.store import CacheStore
from src.ingest.fetch import CaldaysClient
from src.ingest.supplements.job import apply_saved_supplements
from src.ingest.timezones import tz_for_country
from src.ingest.transform import build_payload


def _project_root():
    env = os.environ.get("ALLWORDHAPPY_ROOT")
    if env:
        return Path(env)
    return Path(__file__).resolve().parents[2]


def _default_cache_dir():
    return _project_root() / "web" / "data"


def run_ingest(
    client,
    cache_dir,
    delay_s=0.4,
    sleep=time.sleep,
    tz_lookup=tz_for_country,
    limit=None,
    log=None,
):
    log = print if log is None else log
    listing = client.list_countries()
    countries = list(listing.get("countries") or [])
    if limit is not None:
        countries = countries[: int(limit)]

    year = listing.get("year")
    holidays_by_code = {}
    failed = []
    ok_countries = []

    for index, country in enumerate(countries):
        code = str(country.get("code") or "").strip()
        if not code:
            continue
        log("[INFO] %s/%s %s" % (index + 1, len(countries), code.upper()))
        try:
            body = client.holidays_for(code)
        except Exception as exc:
            log("[WARN] failed %s: %s" % (code.upper(), exc))
            failed.append(code)
        else:
            if year is None:
                year = body.get("year")
            holidays_by_code[code] = body.get("holidays") or []
            ok_countries.append(country)
        if index < len(countries) - 1 and delay_s:
            sleep(delay_s)

    if year is None:
        raise RuntimeError("upstream did not return a year")

    payload = build_payload(
        year=year,
        countries=ok_countries,
        holidays_by_code=holidays_by_code,
        failed=failed,
        tz_lookup=tz_lookup,
    )
    payload = apply_saved_supplements(payload, cache_dir)
    store = CacheStore(cache_dir)
    store.write_payload(payload)
    return payload


def main(argv=None):
    parser = argparse.ArgumentParser(description="Fetch worldwide public holidays into local cache.")
    parser.add_argument("--cache-dir", default=str(_default_cache_dir()))
    parser.add_argument("--delay-ms", type=int, default=400)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--timeout", type=int, default=30)
    args = parser.parse_args(argv)

    cache_dir = Path(args.cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)
    client = CaldaysClient(timeout=args.timeout)
    print("[INFO] fetching country list from caldays...")
    payload = run_ingest(
        client=client,
        cache_dir=cache_dir,
        delay_s=max(args.delay_ms, 0) / 1000.0,
        limit=args.limit,
    )
    stats = payload["stats"]
    print(
        "[OK] year=%s countries=%s holidays=%s failed=%s file=%s"
        % (
            payload["year"],
            stats["countryCount"],
            stats["holidayCount"],
            ",".join(stats["failed"]) or "-",
            cache_dir / ("holidays-%s.json" % payload["year"]),
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
