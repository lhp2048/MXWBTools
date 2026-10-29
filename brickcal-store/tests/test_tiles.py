import unittest
from datetime import datetime, timezone

from tests._path import ROOT  # noqa: F401
from src.cache.tiles import country_tiles
from src.ingest.transform import build_payload


class CountryTilesTests(unittest.TestCase):
    def test_includes_chinese_name_and_resting_status(self):
        payload = build_payload(
            year=2026,
            countries=[{"code": "CN", "name": "China"}],
            holidays_by_code={"CN": [{"date": "2026-10-01", "name": "国庆节"}]},
            failed=["ZZ"],
            tz_lookup=lambda _code: "Asia/Shanghai",
        )
        at = datetime(2026, 9, 30, 16, 30, tzinfo=timezone.utc)
        tiles = country_tiles(payload, at)
        by_code = {row["code"]: row for row in tiles}
        self.assertEqual(by_code["CN"]["zhName"], "中国")
        self.assertEqual(by_code["CN"]["status"], "resting")
        self.assertEqual(by_code["CN"]["holidayCount"], 1)
        self.assertEqual(by_code["ZZ"]["status"], "failed")


if __name__ == "__main__":
    unittest.main()
