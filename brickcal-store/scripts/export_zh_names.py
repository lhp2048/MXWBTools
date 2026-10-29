import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from src.ingest.zh_names import COUNTRY_ZH

out = ROOT / "web" / "zh-names.js"
body = (
    "var COUNTRY_ZH = "
    + json.dumps(COUNTRY_ZH, ensure_ascii=False, indent=2)
    + ";\n"
    + "if (typeof module !== \"undefined\" && module.exports) {\n"
    + "  module.exports = COUNTRY_ZH;\n"
    + "}\n"
)
out.write_text(body, encoding="utf-8")
print(out)
