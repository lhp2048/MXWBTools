import json
import tempfile
import unittest
from pathlib import Path

from tests._path import ROOT  # noqa: F401
from src.cache.store import CacheStore


class StoreTests(unittest.TestCase):
    def test_write_then_read_payload(self):
        payload = {"year": 2026, "byDate": {}, "countries": {}}
        with tempfile.TemporaryDirectory() as tmp:
            store = CacheStore(Path(tmp))
            store.write_payload(payload)
            loaded = store.read_payload(2026)
            self.assertEqual(loaded["year"], 2026)
            meta = json.loads((Path(tmp) / "meta.json").read_text(encoding="utf-8"))
            self.assertEqual(meta["year"], 2026)
            latest = json.loads((Path(tmp) / "holidays.json").read_text(encoding="utf-8"))
            self.assertEqual(latest["year"], 2026)

    def test_read_missing_returns_none(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = CacheStore(Path(tmp))
            self.assertIsNone(store.read_payload(2026))


if __name__ == "__main__":
    unittest.main()
