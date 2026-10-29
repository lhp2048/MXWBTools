# Task 1 Report: 主日历休息日与角标文案

## Status: DONE

## Summary

Created `web/holiday.js` with shared pure functions for rest-day detection and badge text. Added TDD tests to `tests/test_web_today.js`. Existing `web/app.js` tests remain unchanged and passing.

## Files Changed

| File | Action |
|------|--------|
| `web/holiday.js` | Created |
| `tests/test_web_today.js` | Modified (added `isHomeRestDay` / `badgeText` tests) |
| `web/app.js` | Not modified (per brief) |

## TDD Evidence

### Step 1 — Write failing test

Added require and assertions before `console.log("ok")` in `tests/test_web_today.js`:

```javascript
const { isHomeRestDay, badgeText } = require(path.join(__dirname, "..", "web", "holiday.js"));

const restPayload = {
  countries: {
    CN: { name: "China", tz: "Asia/Shanghai", workdays: ["2026-10-10"] },
  },
  byDate: {
    "2026-10-01": [{ code: "CN", name: "国庆节" }],
  },
};
assert.strictEqual(isHomeRestDay(restPayload, "CN", "2026-08-22"), true);
assert.strictEqual(isHomeRestDay(restPayload, "CN", "2026-08-18"), false);
assert.strictEqual(isHomeRestDay(restPayload, "CN", "2026-10-01"), true);
assert.strictEqual(isHomeRestDay(restPayload, "CN", "2026-10-10"), false);
assert.strictEqual(badgeText(restPayload, "CN", new Date("2026-08-18T04:00:00Z")), "4");
assert.strictEqual(badgeText(restPayload, "CN", new Date("2026-08-22T04:00:00Z")), "休");
assert.strictEqual(badgeText(restPayload, "CN", new Date("2026-10-01T04:00:00Z")), "休");
```

### Step 2 — RED (expected failure)

```
& "D:\node-v24.11.1-win-x64\node.exe" tests\test_web_today.js

Error: Cannot find module 'C:\KSVDUsers\Users\kylin\Desktop\demos\all-word-happy\web\holiday.js'
Require stack:
- C:\KSVDUsers\Users\kylin\Desktop\demos\all-word-happy\tests\test_web_today.js
Exit code: 1
```

### Step 3 — Minimal implementation

Created `web/holiday.js` with:

- Helper functions copied from `web/app.js` conventions: `localDate` (en-CA), `parseDay` (`iso + "T12:00:00Z"`), `shiftDay`, `isWeekend`, `daysUntilWeekend` (Mon–Fri → `6 - getUTCDay()`, Sat/Sun → `0`)
- New functions: `isPublicHoliday`, `isHomeRestDay`, `badgeText`
- CommonJS exports for Node tests and future extension use

**`isHomeRestDay` logic:** Returns `false` if date is in `countries[code].workdays`; otherwise `true` when weekend or public holiday for that country.

**`badgeText` logic:** Resolves local calendar day via `localDate(at, tz)`; returns `"休"` on rest days, else `String(daysUntilWeekend(day))`.

### Step 4 — GREEN (all tests pass)

```
& "D:\node-v24.11.1-win-x64\node.exe" tests\test_web_today.js

ok
Exit code: 0
```

## Test Case Mapping

| Input | Expected | Rationale |
|-------|----------|-----------|
| `isHomeRestDay(..., "2026-08-22")` | `true` | Saturday |
| `isHomeRestDay(..., "2026-08-18")` | `false` | Tuesday, not holiday |
| `isHomeRestDay(..., "2026-10-01")` | `true` | 国庆节 |
| `isHomeRestDay(..., "2026-10-10")` | `false` | Listed in `workdays` (调休上班) |
| `badgeText(..., 2026-08-18T04:00:00Z)` | `"4"` | Shanghai Tue, 4 days to Saturday |
| `badgeText(..., 2026-08-22T04:00:00Z)` | `"休"` | Saturday rest |
| `badgeText(..., 2026-10-01T04:00:00Z)` | `"休"` | Public holiday rest |

## Self-Review

- TDD followed: failing test → RED → implement → GREEN.
- Existing `require("../web/app.js")` tests untouched; all prior assertions still pass.
- No changes to `web/app.js` (Task 2 scope).
- Helper duplication in `holiday.js` is intentional per brief; Task 2 will consolidate.
- No git commit (user did not request).

## Concerns

None.

## Commits

None (per plan).
