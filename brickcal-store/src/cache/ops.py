import json
import threading
import zipfile
from datetime import datetime, timezone
from pathlib import Path


def pack_static_site(web_root, zip_path):
    web_root = Path(web_root)
    zip_path = Path(zip_path)
    zip_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(web_root.rglob("*")):
            if not path.is_file():
                continue
            if path.suffix == ".tmp":
                continue
            archive.write(path, path.relative_to(web_root).as_posix())
    return zip_path


class IngestRunner:
    def __init__(self, cache_dir, ingest_fn=None, supplement_fn=None):
        self.cache_dir = Path(cache_dir)
        self.ingest_fn = ingest_fn
        self.supplement_fn = supplement_fn
        self._lock = threading.Lock()
        self._state = _idle_state()

    def snapshot(self):
        with self._lock:
            return json.loads(json.dumps(self._state))

    def start(self, delay_ms=400, limit=None):
        with self._lock:
            if self._state.get("status") == "running":
                return False
            self._state = {
                "status": "running",
                "job": "ingest",
                "log": ["[INFO] ingest started"],
                "startedAt": _now(),
                "finishedAt": None,
                "error": None,
                "stats": None,
            }
        thread = threading.Thread(
            target=self._run,
            args=(delay_ms, limit),
            daemon=True,
        )
        thread.start()
        return True

    def start_supplements(self):
        with self._lock:
            if self._state.get("status") == "running":
                return False
            self._state = {
                "status": "running",
                "job": "supplements",
                "log": ["[INFO] supplement update started"],
                "startedAt": _now(),
                "finishedAt": None,
                "error": None,
                "stats": None,
            }
        thread = threading.Thread(target=self._run_supplements, daemon=True)
        thread.start()
        return True

    def _log(self, message):
        with self._lock:
            self._state["log"].append(str(message))

    def _run(self, delay_ms, limit):
        try:
            ingest_fn = self.ingest_fn or _default_ingest
            payload = ingest_fn(
                delay_ms=delay_ms,
                limit=limit,
                log=self._log,
                cache_dir=self.cache_dir,
            )
            stats = (payload or {}).get("stats")
            with self._lock:
                self._state["status"] = "ok"
                self._state["stats"] = stats
                self._state["finishedAt"] = _now()
                self._state["log"].append("[OK] ingest finished")
        except Exception as exc:
            with self._lock:
                self._state["status"] = "error"
                self._state["error"] = str(exc)
                self._state["finishedAt"] = _now()
                self._state["log"].append("[ERROR] %s" % exc)

    def _run_supplements(self):
        try:
            supplement_fn = self.supplement_fn or _default_supplements
            payload = supplement_fn(cache_dir=self.cache_dir, log=self._log)
            stats = (payload or {}).get("stats")
            with self._lock:
                self._state["status"] = "ok"
                self._state["stats"] = stats
                self._state["finishedAt"] = _now()
                self._state["log"].append("[OK] supplement update finished")
        except Exception as exc:
            with self._lock:
                self._state["status"] = "error"
                self._state["error"] = str(exc)
                self._state["finishedAt"] = _now()
                self._state["log"].append("[ERROR] %s" % exc)


def _idle_state():
    return {
        "status": "idle",
        "job": None,
        "log": [],
        "startedAt": None,
        "finishedAt": None,
        "error": None,
        "stats": None,
    }


def _now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _default_ingest(delay_ms, limit, log, cache_dir):
    from src.ingest.fetch import CaldaysClient
    from src.ingest.job import run_ingest

    log("[INFO] fetching country list from caldays...")
    client = CaldaysClient()
    return run_ingest(
        client=client,
        cache_dir=cache_dir,
        delay_s=max(int(delay_ms or 0), 0) / 1000.0,
        limit=limit,
        log=log,
    )


def _default_supplements(cache_dir, log):
    from src.ingest.fetch import get_json
    from src.ingest.supplements.job import run_supplement_update

    return run_supplement_update(cache_dir=cache_dir, http_get=get_json, log=log)
