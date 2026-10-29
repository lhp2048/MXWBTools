import json
import tempfile
import threading
import time
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.request import Request, urlopen

from tests._path import ROOT  # noqa: F401
from src.cache.ops import IngestRunner, pack_static_site
from src.cache.server import build_handler
from src.cache.store import CacheStore
from src.ingest.job import run_ingest


class FakeClient:
    def list_countries(self):
        return {"year": 2026, "countries": [{"code": "cn", "name": "China"}]}

    def holidays_for(self, code):
        return {
            "code": code,
            "year": 2026,
            "holidays": [{"date": "2026-10-01", "name": "国庆节"}],
        }


class OpsTests(unittest.TestCase):
    def test_run_ingest_uses_log_callback(self):
        lines = []
        with tempfile.TemporaryDirectory() as tmp:
            payload = run_ingest(
                client=FakeClient(),
                cache_dir=Path(tmp),
                delay_s=0,
                sleep=lambda _s: None,
                log=lines.append,
            )
        self.assertTrue(any("CN" in line for line in lines))
        self.assertEqual(payload["stats"]["countryCount"], 1)

    def test_pack_static_site_zips_web_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            web = Path(tmp) / "web"
            web.mkdir()
            (web / "index.html").write_text("ok", encoding="utf-8")
            (web / "data").mkdir()
            (web / "data" / "holidays.json").write_text("{}", encoding="utf-8")
            zip_path = Path(tmp) / "out.zip"
            packed = pack_static_site(web, zip_path)
            self.assertTrue(packed.is_file())
            self.assertGreater(packed.stat().st_size, 0)


class AdminTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.admin_root = root / "admin"
        self.admin_root.mkdir()
        (self.admin_root / "index.html").write_text(
            "<!doctype html><title>维护</title>",
            encoding="utf-8",
        )
        self.web_root = root / "web"
        self.web_root.mkdir()
        (self.web_root / "index.html").write_text("public", encoding="utf-8")
        self.store = CacheStore(self.web_root / "data")
        self.runner = IngestRunner(
            cache_dir=self.web_root / "data",
            ingest_fn=self._fake_ingest,
        )
        handler = build_handler(
            self.store,
            static_root=self.web_root,
            admin_root=self.admin_root,
            ingest_runner=self.runner,
            pack_fn=lambda: pack_static_site(
                self.web_root, root / "release" / "holiday-cache.zip"
            ),
        )
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        host, port = self.server.server_address
        self.base = "http://%s:%s" % (host, port)

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.tmp.cleanup()

    def _fake_ingest(self, delay_ms, limit, log, cache_dir=None):
        log("[INFO] fake start limit=%s" % limit)
        time.sleep(0.05)
        payload = {
            "year": 2026,
            "stats": {"countryCount": 1, "holidayCount": 1, "failed": []},
        }
        self.store.write_payload(payload)
        log("[OK] fake done")
        return payload

    def _get_raw(self, path):
        with urlopen(self.base + path, timeout=5) as resp:
            return resp.status, resp.headers.get("Content-Type"), resp.read().decode("utf-8")

    def _get_json(self, path):
        status, _ctype, body = self._get_raw(path)
        return status, json.loads(body)

    def _post(self, path, body):
        req = Request(
            self.base + path,
            data=json.dumps(body).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urlopen(req, timeout=5) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))

    def test_admin_page_and_status(self):
        status, ctype, body = self._get_raw("/admin")
        self.assertEqual(status, 200)
        self.assertIn("text/html", ctype)
        self.assertIn("维护", body)

        status, data = self._get_json("/admin/api/status")
        self.assertEqual(status, 200)
        self.assertEqual(data["ingest"]["status"], "idle")
        self.assertIsNone(data["cache"])
        self.assertEqual(data["countries"], [])

    def test_admin_html_has_country_grid_and_manual_fetch(self):
        html = (ROOT / "admin" / "index.html").read_text(encoding="utf-8")
        self.assertIn('id="countriesGrid"', html)
        self.assertIn("手动获取一次", html)
        self.assertIn("更新补充", html)
        self.assertIn('id="supplementRows"', html)
        self.assertIn("调休补充列表", html)
        self.assertIn("总览", html)
        self.assertIn("数据更新", html)
        self.assertIn('data-tab="overview"', html)
        self.assertIn('data-tab="update"', html)
        self.assertIn("preview-fab", html)
        self.assertIn('id="statusDock"', html)
        self.assertNotIn("本地维护台", html)
        self.assertNotIn("本页只在本机服务可用", html)
        self.assertNotIn("打开公开预览", html)
        self.assertIn('id="filter-resting"', html)
        self.assertIn('id="filter-ok"', html)
        self.assertIn('id="filter-empty"', html)
        self.assertIn('id="filter-failed"', html)

    def test_admin_html_loads_admin_script_by_absolute_path(self):
        html = (ROOT / "admin" / "index.html").read_text(encoding="utf-8")
        self.assertIn('src="/admin/app.js"', html)

    def test_ingest_and_pack_from_admin_api(self):
        status, body = self._post("/admin/api/ingest", {"limit": 2, "delayMs": 400})
        self.assertEqual(status, 202)
        deadline = time.time() + 3
        snapshot = None
        while time.time() < deadline:
            _status, snapshot = self._get_json("/admin/api/status")
            if snapshot["ingest"]["status"] in ("ok", "error"):
                break
            time.sleep(0.05)
        self.assertEqual(snapshot["ingest"]["status"], "ok")
        self.assertEqual(snapshot["cache"]["year"], 2026)

        status, packed = self._post("/admin/api/pack", {})
        self.assertEqual(status, 200)
        self.assertTrue(Path(packed["path"]).is_file())


if __name__ == "__main__":
    unittest.main()
