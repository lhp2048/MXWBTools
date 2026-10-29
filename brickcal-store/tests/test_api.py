import json
import threading
import unittest
from datetime import datetime, timezone
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.request import urlopen
import tempfile

from tests._path import ROOT  # noqa: F401
from src.cache.server import build_handler
from src.cache.store import CacheStore
from src.ingest.transform import build_payload


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = CacheStore(Path(self.tmp.name))
        payload = build_payload(
            year=2026,
            countries=[{"code": "CN", "name": "China"}],
            holidays_by_code={
                "CN": [{"date": "2026-10-01", "name": "国庆节"}]
            },
            failed=[],
            tz_lookup=lambda _code: "Asia/Shanghai",
            updated_at="2026-08-18T01:00:00Z",
        )
        self.store.write_payload(payload)
        handler = build_handler(self.store)
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        host, port = self.server.server_address
        self.base = "http://%s:%s" % (host, port)

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.tmp.cleanup()

    def _get(self, path):
        with urlopen(self.base + path, timeout=5) as resp:
            body = resp.read().decode("utf-8")
            return resp.status, json.loads(body)

    def test_meta_and_date_and_country(self):
        status, meta = self._get("/v1/meta")
        self.assertEqual(status, 200)
        self.assertEqual(meta["year"], 2026)
        self.assertEqual(meta["attribution"], "Holiday data: caldays.com")

        status, day = self._get(" /v1/date/2026-10-01".strip())
        self.assertEqual(status, 200)
        self.assertEqual(day["date"], "2026-10-01")
        self.assertEqual(day["items"][0]["code"], "CN")

        status, country = self._get("/v1/country/cn")
        self.assertEqual(status, 200)
        self.assertEqual(country["code"], "CN")
        self.assertEqual(country["holidays"][0]["date"], "2026-10-01")

    def test_today_respects_at_query(self):
        at = datetime(2026, 9, 30, 16, 30, tzinfo=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        status, body = self._get("/v1/today?at=" + at)
        self.assertEqual(status, 200)
        self.assertEqual(body["items"][0]["code"], "CN")


class StaticSiteTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.web_root = root / "web"
        data_dir = self.web_root / "data"
        self.web_root.mkdir()
        (self.web_root / "index.html").write_text(
            "<!doctype html><title>all-word-happy</title><p>ok</p>\n",
            encoding="utf-8",
        )
        store = CacheStore(data_dir)
        store.write_payload(
            build_payload(
                year=2026,
                countries=[{"code": "CN", "name": "China"}],
                holidays_by_code={"CN": [{"date": "2026-10-01", "name": "国庆节"}]},
                failed=[],
                tz_lookup=lambda _code: "Asia/Shanghai",
            )
        )
        handler = build_handler(store, static_root=self.web_root)
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        host, port = self.server.server_address
        self.base = "http://%s:%s" % (host, port)

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.tmp.cleanup()

    def _get_raw(self, path):
        with urlopen(self.base + path, timeout=5) as resp:
            return resp.status, resp.headers.get("Content-Type"), resp.read().decode("utf-8")

    def test_serves_index_and_static_json(self):
        status, content_type, body = self._get_raw("/")
        self.assertEqual(status, 200)
        self.assertIn("text/html", content_type)
        self.assertIn("all-word-happy", body)

        status, content_type, body = self._get_raw("/data/holidays.json")
        self.assertEqual(status, 200)
        self.assertIn("json", content_type)
        payload = json.loads(body)
        self.assertEqual(payload["year"], 2026)
        self.assertIn("CN", payload["countries"])


if __name__ == "__main__":
    unittest.main()
