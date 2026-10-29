# Task 2 Report: 抽出共用假期逻辑并接到预览站

## Status

**DONE** — holiday helpers moved into `web/holiday.js`, preview loads `holiday.js` before `app.js`, `worldHolidayList` implemented and covered by tests. No git commit (per brief).

## TDD Evidence

### Step 1 — Failing test written

In `tests/test_web_today.js`:

- Added `worldHolidayList` to the `require(.../web/app.js)` destructure.
- Added assertions:

```javascript
const listed = worldHolidayList(payload, {
  homeCountry: "CN",
  useLocalToday: false,
  dateStr: "2026-10-01",
});
assert.strictEqual(listed.some(function (row) { return row.code === "CN"; }), false);
assert.strictEqual(listed.some(function (row) { return row.code === "US"; }), true);
const watched = worldHolidayList(payload, {
  homeCountry: "CN",
  watchCountries: ["US"],
  useLocalToday: false,
  dateStr: "2026-10-01",
});
assert.strictEqual(watched.length, 1);
assert.strictEqual(watched[0].code, "US");
```

### Step 2 — Red (expected failure)

Command:

```text
& "D:\node-v24.11.1-win-x64\node.exe" tests\test_web_today.js
```

Result (before implementation):

```text
TypeError: worldHolidayList is not a function
    at Object.<anonymous> (...\tests\test_web_today.js:163:16)
```

Exit code: **1**

### Step 3 — Minimal implementation

1. **Cut** remaining holiday pure functions from `web/app.js` into `web/holiday.js` (no algorithm changes). Kept Task 1 helpers as the single definitions (`localDate`, `parseDay`, `shiftDay`, `isWeekend`, `daysUntilWeekend`, `isPublicHoliday`, `isHomeRestDay`, `badgeText`).
2. Added `worldHolidayList(payload, options)` exactly as specified in the brief (exclude `homeCountry`, optional `watchCountries` allow-list).
3. Expanded `holiday.js` `module.exports` to include Task 1 + migrated + `worldHolidayList`.
4. `app.js` Node export:

```javascript
const holiday = require("./holiday.js");
module.exports = Object.assign({}, holiday, {
  localTime, formatDuration, middleGridSize, pickWorkQuote, WORK_QUOTES, WORK_SLOGANS,
});
```

5. Preview wiring: `web/index.html` loads `./holiday.js` before `./app.js`.

Left in `app.js`: preview/DOM/work-timer helpers (`localTime`, `tickLocalClocks`, `renderCalendar`, `renderPage`, `boot`, `WORK_*`, `layoutMiddleArea`, etc.).

Verified no leftover definitions in `app.js` for moved symbols (e.g. `function restSpanOnDate` absent).

### Step 4 — Green

Same command after implementation:

```text
& "D:\node-v24.11.1-win-x64\node.exe" tests\test_web_today.js
```

Output:

```text
ok
```

Exit code: **0**

Existing tests that require holiday APIs from `app.js` still pass via re-export. New `worldHolidayList` cases pass (home excluded; watch filter honors `watchCountries`).

### Step 5 — Commit

**Skipped** (brief: Do not git commit).

## Files changed

| File | Change |
|------|--------|
| `web/holiday.js` | Migrated holiday functions + `worldHolidayList` + full exports |
| `web/app.js` | Removed migrated defs; re-exports holiday via `Object.assign` |
| `web/index.html` | `<script src="./holiday.js"></script>` before `app.js` |
| `tests/test_web_today.js` | Destructure + assert `worldHolidayList` |

## Concerns

- Manual browser click-through of the preview calendar was not executed in this environment; Node suite covers logic. Recommend a quick visual check that 中国格 / 「今天谁在休假」 still look the same after loading `holiday.js`.
- In Node, `zh-names.js` is required from `holiday.js` (same as former `app.js` path). Browser continues to rely on global `COUNTRY_ZH` from `zh-names.js` script tag order.
