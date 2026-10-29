import json
import mimetypes
import os
import re
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from src.cache.ops import IngestRunner, pack_static_site
from src.cache.query import holidays_for_country, holidays_on_date, holidays_today
from src.cache.store import CacheStore
from src.cache.tiles import country_tiles
from src.ingest.supplements.sources import source_catalog
from src.ingest.supplements.store import SupplementStore

DATE_RE = re.compile(r"^/v1/date/(\d{4}-\d{2}-\d{2})$")
COUNTRY_RE = re.compile(r"^/v1/country/([A-Za-z]{2})$")
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 18029


def build_handler(
    store,
    static_root=None,
    admin_root=None,
    ingest_runner=None,
    pack_fn=None,
):
    static_root = Path(static_root).resolve() if static_root else None
    admin_root = Path(admin_root).resolve() if admin_root else None

    class HolidayCacheHandler(BaseHTTPRequestHandler):
        def do_GET(self):
            parsed = urlparse(self.path)
            path = _norm_path(parsed.path)
            query = parse_qs(parsed.query)

            if path == "/health" or path.startswith("/v1/"):
                self._handle_api(path, query)
                return
            if path == "/admin/api/status":
                self._json(200, _admin_status(store, ingest_runner))
                return
            if path == "/admin" or path.startswith("/admin/"):
                if admin_root is None:
                    self._json(404, {"error": "admin ui is not enabled"})
                    return
                rel = path[len("/admin") :].lstrip("/") or "index.html"
                file_path = _safe_static_file(admin_root, "/" + rel)
                if file_path is None:
                    self._json(404, {"error": "not found"})
                    return
                self._file(file_path)
                return
            if static_root is not None:
                file_path = _safe_static_file(static_root, path)
                if file_path is not None:
                    self._file(file_path)
                    return
            self._json(404, {"error": "not found"})

        def do_POST(self):
            parsed = urlparse(self.path)
            path = _norm_path(parsed.path)
            body = self._read_json_body()
            if path == "/admin/api/ingest":
                if ingest_runner is None:
                    self._json(501, {"error": "ingest runner is not enabled"})
                    return
                delay_ms = int(body.get("delayMs") or 400)
                limit = body.get("limit")
                if limit == "" or limit is None:
                    limit = None
                else:
                    limit = int(limit)
                started = ingest_runner.start(delay_ms=delay_ms, limit=limit)
                if not started:
                    self._json(409, {"error": "ingest already running"})
                    return
                self._json(202, {"ok": True, "status": "running"})
                return
            if path == "/admin/api/supplements/update":
                if ingest_runner is None:
                    self._json(501, {"error": "ingest runner is not enabled"})
                    return
                started = ingest_runner.start_supplements()
                if not started:
                    self._json(409, {"error": "a job is already running"})
                    return
                self._json(202, {"ok": True, "status": "running"})
                return
            if path == "/admin/api/supplements/entry":
                try:
                    registry = _supplement_store(store).upsert_entry(
                        body.get("code"),
                        body.get("source"),
                        enabled=body.get("enabled", True),
                    )
                except ValueError as exc:
                    self._json(400, {"error": str(exc)})
                    return
                self._json(200, {"ok": True, "registry": registry})
                return
            if path == "/admin/api/supplements/remove":
                registry = _supplement_store(store).remove_entry(body.get("code"))
                self._json(200, {"ok": True, "registry": registry})
                return
            if path == "/admin/api/pack":
                if pack_fn is None:
                    self._json(501, {"error": "pack is not enabled"})
                    return
                zip_path = Path(pack_fn())
                self._json(200, {"ok": True, "path": str(zip_path)})
                return
            self._json(404, {"error": "not found"})

        def do_OPTIONS(self):
            self.send_response(204)
            self._cors()
            self.end_headers()

        def _handle_api(self, path, query):
            payload = store.read_payload()
            if path == "/health":
                self._json(200, {"ok": True, "hasData": payload is not None})
                return
            if payload is None:
                self._json(503, {"error": "cache is empty; run ingest first"})
                return
            if path == "/v1/meta":
                self._json(200, store.read_meta() or {})
                return
            if path == "/v1/holidays":
                self._json(200, payload)
                return
            if path == "/v1/today":
                at = _parse_at(query.get("at", [None])[0])
                items = holidays_today(payload, at)
                self._json(
                    200,
                    {
                        "at": at.strftime("%Y-%m-%dT%H:%M:%SZ"),
                        "count": len(items),
                        "items": items,
                    },
                )
                return
            date_match = DATE_RE.match(path)
            if date_match:
                date = date_match.group(1)
                items = holidays_on_date(payload, date)
                self._json(200, {"date": date, "count": len(items), "items": items})
                return
            country_match = COUNTRY_RE.match(path)
            if country_match:
                body = holidays_for_country(payload, country_match.group(1))
                if body is None:
                    self._json(404, {"error": "unknown country"})
                    return
                self._json(200, body)
                return
            self._json(404, {"error": "not found"})

        def _read_json_body(self):
            length = int(self.headers.get("Content-Length") or 0)
            raw = self.rfile.read(length) if length else b"{}"
            if not raw:
                return {}
            try:
                data = json.loads(raw.decode("utf-8"))
            except ValueError:
                return {}
            return data if isinstance(data, dict) else {}

        def _file(self, file_path):
            raw = file_path.read_bytes()
            suffix = file_path.suffix.lower()
            content_type = {
                ".html": "text/html; charset=utf-8",
                ".js": "application/javascript; charset=utf-8",
                ".css": "text/css; charset=utf-8",
                ".json": "application/json; charset=utf-8",
            }.get(suffix)
            if content_type is None:
                guessed = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
                content_type = guessed
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(raw)))
            self._cors()
            self.end_headers()
            self.wfile.write(raw)

        def _json(self, status, body):
            raw = json.dumps(body, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(raw)))
            self._cors()
            self.end_headers()
            self.wfile.write(raw)

        def _cors(self):
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")

        def log_message(self, fmt, *args):
            return

    return HolidayCacheHandler


def _admin_status(store, ingest_runner):
    meta = store.read_meta()
    ingest = ingest_runner.snapshot() if ingest_runner is not None else {"status": "disabled"}
    payload = store.read_payload()
    supplements = _supplement_store(store)
    registry = supplements.read_registry()
    overlays = {}
    for item in registry.get("countries") or []:
        code = item.get("code")
        overlay = {}
        path = supplements.overlay_path(code)
        if path.is_file():
            overlay = json.loads(path.read_text(encoding="utf-8"))
        applied = ((payload or {}).get("supplements") or {}).get(code) or {}
        overlays[code] = {
            "source": item.get("source"),
            "enabled": item.get("enabled"),
            "fetchedAt": overlay.get("updatedAt"),
            "applied": applied,
            "restDays": len(overlay.get("restDays") or []),
            "workdays": len(overlay.get("workdays") or []),
        }
    return {
        "ingest": ingest,
        "cache": meta,
        "countries": country_tiles(payload) if payload else [],
        "supplements": {
            "sources": source_catalog(),
            "registry": registry,
            "overlays": overlays,
        },
    }


def _supplement_store(store):
    return SupplementStore(store.cache_dir)


def _norm_path(path):
    path = path or "/"
    if path != "/" and path.endswith("/"):
        path = path.rstrip("/")
    return path


def _safe_static_file(static_root, url_path):
    rel = unquote(url_path).lstrip("/")
    if not rel:
        rel = "index.html"
    candidate = (static_root / rel).resolve()
    try:
        candidate.relative_to(static_root)
    except ValueError:
        return None
    if candidate.is_file():
        return candidate
    return None


def _parse_at(value):
    if not value:
        return datetime.now(timezone.utc)
    text = value.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    at = datetime.fromisoformat(text)
    if at.tzinfo is None:
        at = at.replace(tzinfo=timezone.utc)
    return at.astimezone(timezone.utc)


def _project_root():
    env = os.environ.get("ALLWORDHAPPY_ROOT")
    if env:
        return Path(env)
    return Path(__file__).resolve().parents[2]


def serve(host=DEFAULT_HOST, port=DEFAULT_PORT, cache_dir=None, static_root=None):
    root = _project_root()
    if cache_dir is None:
        cache_dir = root / "web" / "data"
    if static_root is None:
        static_root = root / "web"
    admin_root = root / "admin"
    store = CacheStore(cache_dir)
    runner = IngestRunner(cache_dir=cache_dir)
    zip_path = root / "release" / "holiday-cache.zip"

    def pack_fn():
        return pack_static_site(static_root, zip_path)

    handler = build_handler(
        store,
        static_root=static_root,
        admin_root=admin_root,
        ingest_runner=runner,
        pack_fn=pack_fn,
    )
    server = ThreadingHTTPServer((host, port), handler)
    print("[INFO] public preview  http://%s:%s/" % (host, port))
    print("[INFO] admin console   http://%s:%s/admin" % (host, port))
    print("[INFO] static: %s" % static_root)
    print("[INFO] data: %s" % cache_dir)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[INFO] stopping")
    finally:
        server.server_close()
    return 0
