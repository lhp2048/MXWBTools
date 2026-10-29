import unittest
from datetime import datetime, timezone

from tests._path import ROOT  # noqa: F401
from src.cache.query import holidays_on_date, holidays_today
from src.ingest.transform import build_payload


def _payload():
    return build_payload(
        year=2026,
        countries=[
            {"code": "CN", "name": "China"},
            {"code": "US", "name": "United States"},
        ],
        holidays_by_code={
            "CN": [{"date": "2026-10-01", "name": "国庆节"}],
            "US": [{"date": "2026-10-01", "name": "dummy US same calendar day"}],
        },
        failed=[],
        tz_lookup=lambda code: "Asia/Shanghai" if code == "CN" else "America/New_York",
    )


class TodayQueryTests(unittest.TestCase):
    def test_calendar_date_returns_all_countries_on_that_date(self):
        items = holidays_on_date(_payload(), "2026-10-01")
        codes = [item["code"] for item in items]
        self.assertEqual(codes, ["CN", "US"])

    def test_today_uses_each_country_local_date(self):
        # 2026-09-30 16:30 UTC -> 2026-10-01 00:30 in Shanghai, still 2026-09-30 in New York
        at = datetime(2026, 9, 30, 16, 30, tzinfo=timezone.utc)
        items = holidays_today(_payload(), at)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["code"], "CN")
        self.assertEqual(items[0]["localDate"], "2026-10-01")
        self.assertEqual(items[0]["countryName"], "China")
        self.assertEqual(items[0]["elapsedDays"], 1)
        self.assertEqual(items[0]["remainingDays"], 0)

    def test_unknown_date_is_empty(self):
        self.assertEqual(holidays_on_date(_payload(), "2026-08-18"), [])


if __name__ == "__main__":
    unittest.main()
