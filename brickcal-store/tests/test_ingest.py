import unittest
from pathlib import Path
import tempfile

from tests._path import ROOT  # noqa: F401
from src.ingest.job import run_ingest


class FakeClient:
    def __init__(self, fail_codes=None):
        self.fail_codes = set(fail_codes or [])
        self.listed = 0
        self.calls = []

    def list_countries(self):
        self.listed += 1
        return {
            "year": 2026,
            "countries": [
                {"code": "cn", "name": "China"},
                {"code": "us", "name": "United States"},
            ],
        }

    def holidays_for(self, code):
        self.calls.append(code)
        if code.lower() in self.fail_codes:
            raise RuntimeError("boom")
        if code.lower() == "cn":
            return {
                "code": "cn",
                "country": "China",
                "year": 2026,
                "holidays": [{"date": "2026-10-01", "name": "国庆节"}],
            }
        return {
            "code": code,
            "country": "United States",
            "year": 2026,
            "holidays": [{"date": "2026-01-01", "name": "New Year's Day"}],
        }


class IngestJobTests(unittest.TestCase):
    def test_fetches_each_country_with_delay_and_writes_cache(self):
        sleeps = []
        client = FakeClient()
        with tempfile.TemporaryDirectory() as tmp:
            payload = run_ingest(
                client=client,
                cache_dir=Path(tmp),
                delay_s=0.4,
                sleep=sleeps.append,
                tz_lookup=lambda _code: "UTC",
            )
            self.assertEqual(client.listed, 1)
            self.assertEqual(client.calls, ["cn", "us"])
            self.assertEqual(sleeps, [0.4])
            self.assertEqual(payload["stats"]["holidayCount"], 2)
            written = Path(tmp) / "holidays-2026.json"
            self.assertTrue(written.is_file())

    def test_records_failed_country_and_continues(self):
        client = FakeClient(fail_codes={"us"})
        with tempfile.TemporaryDirectory() as tmp:
            payload = run_ingest(
                client=client,
                cache_dir=Path(tmp),
                delay_s=0,
                sleep=lambda _s: None,
                tz_lookup=lambda _code: "UTC",
            )
            self.assertEqual(payload["stats"]["failed"], ["US"])
            self.assertIn("CN", payload["countries"])
            self.assertNotIn("US", payload["countries"])

    def test_limit_stops_after_n_countries(self):
        client = FakeClient()
        with tempfile.TemporaryDirectory() as tmp:
            payload = run_ingest(
                client=client,
                cache_dir=Path(tmp),
                delay_s=0,
                sleep=lambda _s: None,
                limit=1,
                tz_lookup=lambda _code: "UTC",
            )
            self.assertEqual(client.calls, ["cn"])
            self.assertEqual(list(payload["countries"].keys()), ["CN"])


if __name__ == "__main__":
    unittest.main()
