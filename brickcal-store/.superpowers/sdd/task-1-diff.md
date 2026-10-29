# Task 1 review package (no git repo; working tree files)

## Files
- created: web/holiday.js
- modified: tests/test_web_today.js

function localDate(at, tzName) {
  const date = at instanceof Date ? at : new Date(at);
  const options = {
    timeZone: tzName || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  };
  try {
    return new Intl.DateTimeFormat("en-CA", options).format(date);
  } catch (err) {
    options.timeZone = "UTC";
    return new Intl.DateTimeFormat("en-CA", options).format(date);
  }
}

function parseDay(iso) {
  return new Date(iso + "T12:00:00Z");
}

function shiftDay(iso, days) {
  const d = parseDay(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function isWeekend(iso) {
  const day = parseDay(iso).getUTCDay();
  return day === 0 || day === 6;
}

function daysUntilWeekend(iso) {
  const week = parseDay(iso).getUTCDay();
  if (week === 0 || week === 6) {
    return 0;
  }
  return 6 - week;
}

function isPublicHoliday(payload, code, dateStr) {
  const items = ((payload && payload.byDate) || {})[dateStr] || [];
  for (let i = 0; i < items.length; i++) {
    if (items[i].code === code) {
      return true;
    }
  }
  return false;
}

function isHomeRestDay(payload, code, dateStr) {
  const info = ((payload && payload.countries) || {})[code] || {};
  const workdays = info.workdays || [];
  for (let i = 0; i < workdays.length; i++) {
    if (workdays[i] === dateStr) {
      return false;
    }
  }
  return isWeekend(dateStr) || isPublicHoliday(payload, code, dateStr);
}

function badgeText(payload, code, at) {
  const info = ((payload && payload.countries) || {})[code] || {};
  const day = localDate(at, info.tz || "UTC");
  if (isHomeRestDay(payload, code, day)) {
    return "休";
  }
  return String(daysUntilWeekend(day));
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    localDate: localDate,
    parseDay: parseDay,
    shiftDay: shiftDay,
    isWeekend: isWeekend,
    daysUntilWeekend: daysUntilWeekend,
    isPublicHoliday: isPublicHoliday,
    isHomeRestDay: isHomeRestDay,
    badgeText: badgeText,
  };
}

----- tests/test_web_today.js (tail) -----

      "2026-09-25": [{ code: "CN", name: "中秋节" }],
    },
  },
  "2026-08-18",
  "CN"
);
assert.strictEqual(midAutumn.name, "中秋节");
assert.strictEqual(midAutumn.days, 38);
assert.ok(calendarFootText({ byDate: { "2026-09-25": [{ code: "CN", name: "中秋节" }] } }, "2026-08-18").indexOf("38") >= 0);
assert.deepStrictEqual(middleGridSize(924, 300, 12), { cols: 3, width: 924 });
assert.deepStrictEqual(middleGridSize(923, 300, 12), { cols: 2, width: 612 });
assert.strictEqual(middleGridSize(200, 300, 12).cols, 1);
assert.deepStrictEqual(middleGridSize(1180, 300, 12, 2), { cols: 2, width: 612 });
assert.ok(WORK_QUOTES.length >= 40);
assert.strictEqual(new Set(WORK_QUOTES).size, WORK_QUOTES.length);
assert.ok(WORK_SLOGANS.length >= 30);
assert.strictEqual(new Set(WORK_SLOGANS).size, WORK_SLOGANS.length);
assert.strictEqual(pickWorkQuote(["a"], "a", function () { return 0; }), "a");
assert.strictEqual(pickWorkQuote(["a", "b"], "a", function () { return 0; }), "b");
assert.strictEqual(pickWorkQuote(["a", "b"], "x", function () { return 0; }), "a");

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

console.log("ok");
