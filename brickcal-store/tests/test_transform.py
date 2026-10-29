import unittest

from tests._path import ROOT  # noqa: F401
from src.ingest.transform import build_payload


class TransformTests(unittest.TestCase):
    def test_indexes_holidays_by_date_and_uppercases_codes(self):
        countries = [
            {"code": "cn", "name": "China"},
            {"code": "us", "name": "United States"},
        ]
        holidays_by_code = {
            "cn": [
                {"date": "2026-10-01", "name": "国庆节"},
                {"date": "2026-01-01", "name": "元旦"},
            ],
            "us": [
                {"date": "2026-01-01", "name": "New Year's Day"},
            ],
        }

        payload = build_payload(
            year=2026,
            countries=countries,
            holidays_by_code=holidays_by_code,
            failed=["zz"],
            tz_lookup=lambda code: "Asia/Shanghai" if code == "CN" else "America/New_York",
        )

        self.assertEqual(payload["year"], 2026)
        self.assertEqual(payload["source"], "caldays")
        self.assertEqual(payload["license"], "CC BY 4.0")
        self.assertEqual(payload["countries"]["CN"]["name"], "China")
        self.assertEqual(payload["countries"]["CN"]["tz"], "Asia/Shanghai")
        self.assertEqual(
            payload["byDate"]["2026-01-01"],
            [
                {"code": "CN", "name": "元旦"},
                {"code": "US", "name": "New Year's Day"},
            ],
        )
        self.assertEqual(
            payload["byDate"]["2026-10-01"],
            [{"code": "CN", "name": "国庆节"}],
        )
        self.assertEqual(payload["stats"]["countryCount"], 2)
        self.assertEqual(payload["stats"]["holidayCount"], 3)
        self.assertEqual(payload["stats"]["failed"], ["ZZ"])

    def test_skips_entries_without_date_or_name(self):
        payload = build_payload(
            year=2026,
            countries=[{"code": "jp", "name": "Japan"}],
            holidays_by_code={
                "jp": [
                    {"date": "", "name": "bad"},
                    {"name": "no date"},
                    {"date": "2026-02-11", "name": ""},
                    {"date": "2026-02-11", "name": "National Foundation Day"},
                ]
            },
            failed=[],
            tz_lookup=lambda _code: "UTC",
        )
        self.assertEqual(payload["stats"]["holidayCount"], 1)
        self.assertEqual(
            payload["byDate"]["2026-02-11"],
            [{"code": "JP", "name": "National Foundation Day"}],
        )


if __name__ == "__main__":
    unittest.main()
