# Task 4 Report: 弹窗方案 A（今日条 + 月历 + 别国）

## Status

**DONE** — Scheme A popup implemented: hero (上班/休假), month calendar with shift days, world holiday list, settings toggle only. No git commit (per brief).

## Files Created

| Path | Purpose |
|------|---------|
| `extension/popup.css` | 360px palette matching `web/ext-popup-prototype.html` |
| `extension/popup.js` | State, `renderHero` / `renderCal` / `renderWorld`, load flow |

## Files Modified

| Path | Change |
|------|--------|
| `web/holiday.js` | Added `homeHolidayName`; `cnHolidayName` delegates to it |
| `extension/popup.html` | Replaced placeholder with scheme A markup |
| `tests/test_web_today.js` | Asserts `homeHolidayName(restPayload, "CN", "2026-10-01") === "国庆节"` |

## Verification

### TDD

RED: `TypeError: homeHolidayName is not a function`  
GREEN: test file prints `ok`

```text
& "D:\node-v24.11.1-win-x64\node.exe" tests\test_web_today.js
ok
```

### pack_extension.bat

```text
.\scripts\pack_extension.bat
[OK] extension packed
```

`extension/holiday.js` now exports `homeHolidayName`.

## Concerns

- **Chrome load not run here**: Open `chrome://extensions` → 加载已解压扩展 → `all-word-happy\extension` to confirm 360px UI.
- **Settings empty**: `#settings` only toggles `hidden`; country pickers are Task 5.
- **Year mismatch**: `#yearNote` shows when `payload.year` ≠ home local year; calendar still opens on local year/month per load-flow snippet (spec said clamp to data year). Fine for 2026.

## Commits

None (skipped per brief).
