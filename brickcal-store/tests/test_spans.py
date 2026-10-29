import unittest
from datetime import datetime, timezone

from tests._path import ROOT  # noqa: F401
from src.cache.query import holidays_today
from src.cache.spans import rest_span_on_date
from src.ingest.transform import build_payload


def _payload(holidays, workdays=None):
    payload = build_payload(
        year=2026,
        countries=[{"code": "CN", "name": "China"}],
        holidays_by_code={"CN": holidays},
        failed=[],
        tz_lookup=lambda _code: "Asia/Shanghai",
    )
    if workdays:
        payload["countries"]["CN"]["workdays"] = list(workdays)
    return payload


class RestSpanTests(unittest.TestCase):
    def test_merges_adjacent_public_holidays_and_weekends(self):
        payload = _payload(
            [
                {"date": "2026-02-16", "name": "春节"},
                {"date": "2026-02-17", "name": "春节"},
                {"date": "2026-02-18", "name": "春节"},
            ]
        )
        # 2026-02-16 is Monday, so Sat 14 + Sun 15 join the stretch
        span = rest_span_on_date(payload, "CN", "2026-02-17")
        self.assertEqual(span["start"], "2026-02-14")
        self.assertEqual(span["end"], "2026-02-18")
        self.assertEqual(span["days"], 5)

    def test_makeup_workday_is_not_rest(self):
        payload = _payload(
            [
                {"date": "2026-02-16", "name": "春节"},
                {"date": "2026-02-17", "name": "春节"},
                {"date": "2026-02-18", "name": "春节"},
            ],
            workdays=["2026-02-14"],
        )
        span = rest_span_on_date(payload, "CN", "2026-02-17")
        self.assertEqual(span["start"], "2026-02-15")
        self.assertEqual(span["end"], "2026-02-18")
        self.assertEqual(span["days"], 4)

    def test_plain_weekend_without_holiday_is_not_a_vacation_span(self):
        payload = _payload([{"date": "2026-10-01", "name": "国庆节"}])
        self.assertIsNone(rest_span_on_date(payload, "CN", "2026-08-15"))

    def test_today_includes_weekend_inside_holiday_stretch(self):
        payload = _payload(
            [
                {"date": "2026-02-16", "name": "春节"},
                {"date": "2026-02-17", "name": "春节"},
                {"date": "2026-02-18", "name": "春节"},
            ]
        )
        # 2026-02-14 16:00 UTC -> 2026-02-15 00:00 Shanghai (Sunday)
        at = datetime(2026, 2, 14, 16, 0, tzinfo=timezone.utc)
        items = holidays_today(payload, at)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["spanDays"], 5)
        self.assertEqual(items[0]["spanStart"], "2026-02-14")
        self.assertEqual(items[0]["spanEnd"], "2026-02-18")
        self.assertEqual(items[0]["elapsedDays"], 2)
        self.assertEqual(items[0]["remainingDays"], 3)
        self.assertEqual(items[0]["elapsedDays"] + items[0]["remainingDays"], 5)


if __name__ == "__main__":
    unittest.main()
