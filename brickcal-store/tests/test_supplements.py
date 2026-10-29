import json
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.request import Request, urlopen

from tests._path import ROOT  # noqa: F401
from src.cache.server import build_handler
from src.cache.spans import rest_span_on_date
from src.cache.store import CacheStore
from src.ingest.job import run_ingest
from src.ingest.supplements.holiday_cn import parse_holiday_cn
from src.ingest.supplements.job import run_supplement_update
from src.ingest.supplements.merge import apply_supplements
from src.ingest.supplements.sources import validate_entry
from src.ingest.supplements.store import SupplementStore
from src.ingest.transform import build_payload


HOLIDAY_CN_SAMPLE = {
    "year": 2026,
    "papers": ["https://www.gov.cn/example"],
    "days": [
        {"name": "国庆节", "date": "2026-10-01", "isOffDay": True},
        {"name": "国庆节", "date": "2026-10-02", "isOffDay": True},
        {"name": "国庆节", "date": "2026-10-03", "isOffDay": True},
        {"name": "国庆节", "date": "2026-10-04", "isOffDay": True},
        {"name": "国庆节", "date": "2026-10-05", "isOffDay": True},
        {"name": "国庆节", "date": "2026-10-06", "isOffDay": True},
        {"name": "国庆节", "date": "2026-10-07", "isOffDay": True},
        {"name": "国庆节", "date": "2026-09-20", "isOffDay": False},
        {"name": "国庆节", "date": "2026-10-10", "isOffDay": False},
    ],
}


def _caldays_cn():
    return build_payload(
        year=2026,
        countries=[{"code": "CN", "name": "China"}],
        holidays_by_code={
            "CN": [
                {"date": "2026-10-01", "name": "国庆节"},
                {"date": "2026-10-02", "name": "国庆节"},
                {"date": "2026-10-03", "name": "国庆节"},
            ]
        },
        failed=[],
        tz_lookup=lambda _code: "Asia/Shanghai",
    )


class SupplementParseTests(unittest.TestCase):
    def test_holiday_cn_splits_rest_and_workdays(self):
        overlay = parse_holiday_cn(
            HOLIDAY_CN_SAMPLE, "https://example.test/2026.json"
        )
        self.assertEqual(overlay["code"], "CN")
        rest = [item["date"] for item in overlay["restDays"]]
        work = [item["date"] for item in overlay["workdays"]]
        self.assertEqual(rest[:3], ["2026-10-01", "2026-10-02", "2026-10-03"])
        self.assertIn("2026-10-07", rest)
        self.assertEqual(work, ["2026-09-20", "2026-10-10"])
        self.assertEqual(overlay["restDays"][-1]["reason"], "国庆节调休")
        self.assertEqual(overlay["workdays"][0]["reason"], "国庆节补班")

    def test_holiday_cn_source_rejects_other_countries(self):
        with self.assertRaises(ValueError):
            validate_entry("US", "holiday-cn")


class SupplementMergeTests(unittest.TestCase):
    def test_national_day_becomes_seven_days_with_adjusted_flags(self):
        overlay = parse_holiday_cn(HOLIDAY_CN_SAMPLE, "https://example.test/2026.json")
        merged = apply_supplements(_caldays_cn(), [overlay], updated_at="2026-08-18T02:00:00Z")
        span = rest_span_on_date(merged, "CN", "2026-10-01")
        self.assertEqual(span["start"], "2026-10-01")
        self.assertEqual(span["end"], "2026-10-07")
        self.assertEqual(span["days"], 7)
        self.assertEqual(merged["countries"]["CN"]["workdays"], ["2026-09-20", "2026-10-10"])
        by_date = merged["byDate"]
        public = [item for item in by_date["2026-10-01"] if item["code"] == "CN"][0]
        extra = [item for item in by_date["2026-10-05"] if item["code"] == "CN"][0]
        self.assertNotEqual(public.get("kind"), "adjusted")
        self.assertEqual(extra["kind"], "adjusted")
        self.assertEqual(extra["reason"], "国庆节调休")
        self.assertIsNone(rest_span_on_date(merged, "CN", "2026-10-10"))

    def test_reapply_does_not_duplicate_adjusted_days(self):
        overlay = parse_holiday_cn(HOLIDAY_CN_SAMPLE, "https://example.test/2026.json")
        once = apply_supplements(_caldays_cn(), [overlay])
        twice = apply_supplements(once, [overlay])
        count = sum(
            1
            for items in twice["byDate"].values()
            for item in items
            if item.get("code") == "CN" and item.get("kind") == "adjusted"
        )
        self.assertEqual(count, 4)


class SupplementJobTests(unittest.TestCase):
    def test_update_fetches_and_writes_overlay(self):
        with tempfile.TemporaryDirectory() as tmp:
            cache_dir = Path(tmp)
            store = CacheStore(cache_dir)
            store.write_payload(_caldays_cn())
            SupplementStore(cache_dir).write_registry(
                {"countries": [{"code": "CN", "source": "holiday-cn", "enabled": True}]}
            )

            def fake_fetch(source, code, year, http_get):
                self.assertEqual(source, "holiday-cn")
                self.assertEqual(code, "CN")
                overlay = parse_holiday_cn(HOLIDAY_CN_SAMPLE, "https://example.test/2026.json")
                overlay["year"] = year
                return overlay

            merged = run_supplement_update(
                cache_dir=cache_dir,
                http_get=lambda _url: None,
                log=lambda _msg: None,
                now="2026-08-18T03:00:00Z",
                fetch_overlay_fn=fake_fetch,
            )
            span = rest_span_on_date(merged, "CN", "2026-10-05")
            self.assertEqual(span["days"], 7)
            overlay_path = cache_dir / "supplements" / "CN.json"
            self.assertTrue(overlay_path.is_file())

    def test_caldays_ingest_reapplies_saved_overlay(self):
        class FakeClient:
            def list_countries(self):
                return {"year": 2026, "countries": [{"code": "cn", "name": "China"}]}

            def holidays_for(self, code):
                return {
                    "code": code,
                    "year": 2026,
                    "holidays": [
                        {"date": "2026-10-01", "name": "国庆节"},
                        {"date": "2026-10-02", "name": "国庆节"},
                        {"date": "2026-10-03", "name": "国庆节"},
                    ],
                }

        with tempfile.TemporaryDirectory() as tmp:
            cache_dir = Path(tmp)
            overlay = parse_holiday_cn(HOLIDAY_CN_SAMPLE, "https://example.test/2026.json")
            overlay["updatedAt"] = "2026-08-18T03:00:00Z"
            store = SupplementStore(cache_dir)
            store.write_registry(
                {"countries": [{"code": "CN", "source": "holiday-cn", "enabled": True}]}
            )
            store.write_overlay(overlay)
            payload = run_ingest(
                client=FakeClient(),
                cache_dir=cache_dir,
                delay_s=0,
                sleep=lambda _s: None,
                log=lambda _msg: None,
            )
            span = rest_span_on_date(payload, "CN", "2026-10-01")
            self.assertEqual(span["end"], "2026-10-07")


class SupplementAdminApiTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.store = CacheStore(root / "data")
        self.store.write_payload(_caldays_cn())
        handler = build_handler(self.store, ingest_runner=None)
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        host, port = self.server.server_address
        self.base = "http://%s:%s" % (host, port)

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.tmp.cleanup()

    def _post(self, path, body):
        req = Request(
            self.base + path,
            data=json.dumps(body).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urlopen(req, timeout=5) as resp:
                return resp.status, json.loads(resp.read().decode("utf-8"))
        except Exception as exc:
            if hasattr(exc, "code"):
                raw = exc.read().decode("utf-8")
                return exc.code, json.loads(raw)
            raise

    def test_add_rejects_unsupported_country_for_source(self):
        status, body = self._post(
            "/admin/api/supplements/entry",
            {"code": "US", "source": "holiday-cn"},
        )
        self.assertEqual(status, 400)
        self.assertIn("CN", body["error"])

    def test_add_cn_to_registry(self):
        status, body = self._post(
            "/admin/api/supplements/entry",
            {"code": "CN", "source": "holiday-cn", "enabled": True},
        )
        self.assertEqual(status, 200)
        codes = [item["code"] for item in body["registry"]["countries"]]
        self.assertEqual(codes, ["CN"])


if __name__ == "__main__":
    unittest.main()
