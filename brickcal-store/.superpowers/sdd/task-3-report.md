# Task 3 Report: 扩展骨架、打包脚本、角标

## Status

**DONE** — Chrome MV3 extension skeleton, pack script, and badge service worker created. `build.bat` chains `pack_extension.bat` after ingest. No git commit (per brief).

## Files Created

| Path | Purpose |
|------|---------|
| `extension/manifest.json` | MV3 manifest (storage, alarms, popup, service worker) |
| `extension/background.js` | Badge refresh via `badgeText` + hourly alarm |
| `extension/popup.html` | Placeholder「加载中…」(Task 4 replaces) |
| `scripts/pack_extension.bat` | Copies `holidays.json`, `holiday.js`, `zh-names.js` into `extension/` |

## Files Modified

| Path | Change |
|------|--------|
| `scripts/build.bat` | Calls `pack_extension.bat` after successful ingest |

## Verification

### pack_extension.bat

```text
.\scripts\pack_extension.bat
[OK] extension packed
```

Copied files confirmed:

- `extension/data/holidays.json`
- `extension/holiday.js`
- `extension/zh-names.js`

### Regression test

```text
& "D:\node-v24.11.1-win-x64\node.exe" tests\test_web_today.js
ok
```

## Concerns

- **Manual load test pending**: Badge colors/text not verified in Chrome (requires load unpacked + real `chrome.*` APIs).
- **Popup UI deferred**: Task 4 will replace placeholder popup.
- **Pack is copy-only**: Does not run ingest; relies on existing `web/data/holidays.json`.

## Commits

None (skipped per brief).
