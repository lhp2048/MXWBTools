const assert = require("assert");
const path = require("path");
const {
  holidaysToday,
  holidaysOnCalendarDate,
  clampDateToYear,
  localTime,
  holidaysInSpan,
  daysUntilWeekend,
  nextHolidayAfter,
  nextHolidaysAfter,
  upcomingHolidaySentence,
  calendarFootText,
  formatDuration,
  middleGridSize,
  pickWorkQuote,
  WORK_QUOTES,
  WORK_SLOGANS,
  worldHolidayList,
  workDayProgress,
  workOvertimeProgress,
  setArcProgress,
  parseClock,
  workDayLengthMs,
  workElapsedMs,
  workTimerDayKey,
  workTimerResetPayload,
  applyWorkTimerReset,
  isLunchNow,
  normalizeLunchMinutes,
  workPanelTone,
  colorLuma,
  monthCells,
  weekLabels,
  isWeekHeaderWeekend,
  normalizeWeekStart,
  normalizeMonthSwitch,
  yearHolidayList,
  holidayRangeLabel,
} = require(path.join(__dirname, "..", "web", "app.js"));

const payload = {
  countries: {
    CN: { name: "China", tz: "Asia/Shanghai" },
    US: { name: "United States", tz: "America/New_York" },
  },
  byDate: {
    "2026-10-01": [
      { code: "CN", name: "国庆节" },
      { code: "US", name: "dummy US same calendar day" },
    ],
  },
};

const at = new Date("2026-09-30T16:30:00Z");
const items = holidaysToday(payload, at);
assert.strictEqual(items.length, 1);
assert.strictEqual(items[0].code, "CN");
assert.strictEqual(items[0].localDate, "2026-10-01");
assert.strictEqual(items[0].countryName, "China");
assert.strictEqual(items[0].zhName, "中国");
assert.strictEqual(items[0].tz, "Asia/Shanghai");
assert.strictEqual(items[0].spanDays, 1);
assert.strictEqual(items[0].elapsedDays, 1);
assert.strictEqual(items[0].remainingDays, 0);
assert.strictEqual(items[0].spanStart, "2026-10-01");
assert.strictEqual(items[0].holidaysInSpan.length, 1);
assert.strictEqual(items[0].holidaysInSpan[0].name, "国庆节");

const spring = {
  countries: { CN: { name: "China", tz: "Asia/Shanghai" } },
  byDate: {
    "2026-02-16": [{ code: "CN", name: "春节" }],
    "2026-02-17": [{ code: "CN", name: "春节" }],
    "2026-02-18": [{ code: "CN", name: "春节" }],
  },
};
const sunday = holidaysToday(spring, new Date("2026-02-14T16:00:00Z"));
assert.strictEqual(sunday.length, 1);
assert.strictEqual(sunday[0].spanDays, 5);
assert.strictEqual(sunday[0].elapsedDays, 2);
assert.strictEqual(sunday[0].remainingDays, 3);
assert.strictEqual(sunday[0].elapsedDays + sunday[0].remainingDays, sunday[0].spanDays);

const lastDay = holidaysOnCalendarDate(
  {
    countries: { CA: { name: "Canada", tz: "America/Toronto" } },
    byDate: { "2026-08-17": [{ code: "CA", name: "Discovery Day" }] },
  },
  "2026-08-17"
);
assert.strictEqual(lastDay[0].spanDays, 3);
assert.strictEqual(lastDay[0].elapsedDays, 3);
assert.strictEqual(lastDay[0].remainingDays, 0);
assert.strictEqual(sunday[0].spanStart, "2026-02-14");
assert.strictEqual(sunday[0].spanEnd, "2026-02-18");
assert.strictEqual(sunday[0].zhName, "中国");
assert.strictEqual(sunday[0].holidaysInSpan.length, 3);

const onOct1 = holidaysOnCalendarDate(payload, "2026-10-01");
assert.strictEqual(onOct1.length, 2);
assert.deepStrictEqual(
  onOct1.map(function (row) { return row.code; }).sort(),
  ["CN", "US"]
);
const empty = holidaysOnCalendarDate(spring, "2026-08-18");
assert.strictEqual(empty.length, 0);

assert.strictEqual(clampDateToYear("2026-08-18", 2026), "2026-08-18");
assert.strictEqual(clampDateToYear("2025-08-18", 2026).slice(0, 4), "2026");
assert.strictEqual(clampDateToYear("", 2026).slice(0, 4), "2026");

const acrossMidnight = {
  countries: { US: { name: "United States", tz: "America/New_York" } },
  byDate: {
    "2026-08-17": [{ code: "US", name: "Independence-like" }],
  },
};
const chinaMorning = new Date("2026-08-17T18:00:00Z");
const todayRows = holidaysToday(acrossMidnight, chinaMorning);
assert.strictEqual(todayRows.length, 1);
assert.strictEqual(todayRows[0].localDate, "2026-08-17");
assert.strictEqual(holidaysOnCalendarDate(acrossMidnight, "2026-08-18").length, 0);
assert.strictEqual(localTime(chinaMorning, "America/New_York"), "14:00:00");
assert.strictEqual(localTime(chinaMorning, "Asia/Shanghai"), "02:00:00");

const adjustedPayload = {
  countries: { CN: { name: "China", tz: "Asia/Shanghai" } },
  byDate: {
    "2026-10-01": [{ code: "CN", name: "国庆节" }],
    "2026-10-05": [
      { code: "CN", name: "国庆节", kind: "adjusted", reason: "国庆节调休" },
    ],
  },
};
const chips = holidaysInSpan(adjustedPayload, "CN", "2026-10-01", "2026-10-05");
assert.strictEqual(chips[1].kind, "adjusted");
assert.strictEqual(chips[1].reason, "国庆节调休");
assert.strictEqual(daysUntilWeekend("2026-08-18"), 4);
assert.strictEqual(daysUntilWeekend("2026-08-22"), 0);
assert.strictEqual(formatDuration(2 * 3600 * 1000 + 18 * 60 * 1000 + 57 * 1000), "02:18:57");
const midAutumn = nextHolidayAfter(
  {
    byDate: {
      "2026-08-18": [{ code: "US", name: "nope" }],
      "2026-09-25": [{ code: "CN", name: "中秋节" }],
    },
  },
  "2026-08-18",
  "CN"
);
assert.strictEqual(midAutumn.name, "中秋节");
assert.strictEqual(midAutumn.days, 38);
const three = nextHolidaysAfter(
  {
    byDate: {
      "2026-09-25": [{ code: "CN", name: "中秋节" }],
      "2026-09-26": [{ code: "CN", name: "中秋节" }],
      "2026-10-01": [{ code: "CN", name: "国庆节" }],
      "2026-10-02": [{ code: "CN", name: "国庆节" }],
      "2027-01-01": [{ code: "CN", name: "元旦" }],
      "2026-09-07": [{ code: "US", name: "Labor Day" }],
    },
  },
  "2026-08-18",
  "CN",
  3
);
assert.deepStrictEqual(
  three.map(function (item) {
    return item.name + item.days;
  }),
  ["中秋节38", "国庆节44", "元旦136"]
);
assert.strictEqual(
  upcomingHolidaySentence(three),
  "距中秋节38天，距国庆节44天，距元旦136天"
);
assert.strictEqual(upcomingHolidaySentence([]), "近期没有节日");
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

const { isHomeRestDay, badgeText, homeHolidayName, cnDayMark, cnDayMarks, cnSolarTermName, cnTraditionalName } = require(path.join(__dirname, "..", "web", "holiday.js"));

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
assert.strictEqual(homeHolidayName(restPayload, "CN", "2026-10-01"), "国庆节");
assert.strictEqual(badgeText(restPayload, "CN", new Date("2026-08-18T04:00:00Z")), "4");
assert.strictEqual(badgeText(restPayload, "CN", new Date("2026-08-22T04:00:00Z")), "休");
assert.strictEqual(badgeText(restPayload, "CN", new Date("2026-10-01T04:00:00Z")), "休");
assert.strictEqual(badgeText(restPayload, "CN", new Date("2026-10-10T04:00:00Z")), "班");
assert.strictEqual(cnSolarTermName("2026-04-05"), "清明");
assert.strictEqual(cnSolarTermName("2026-02-04"), "立春");
assert.strictEqual(cnTraditionalName("2026-03-03"), "元宵节");
assert.strictEqual(cnTraditionalName("2026-08-19"), "七夕");
assert.strictEqual(cnTraditionalName("2026-09-10"), "教师节");
assert.strictEqual(cnDayMark(restPayload, "2026-10-01", false).text, "国庆节");
assert.strictEqual(cnDayMark(restPayload, "2026-10-01", true).text, "班");
assert.strictEqual(cnDayMark({}, "2026-04-05", false).kind, "term");
assert.strictEqual(cnDayMark({}, "2026-03-03", false).text, "元宵节");
const marksQingming = cnDayMarks({}, "2026-04-05", false);
assert.ok(marksQingming.length >= 2);
assert.ok(marksQingming.some(function (m) { return m.text === "清明"; }));
assert.ok(marksQingming.some(function (m) { return m.kind === "lunar"; }));

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

assert.strictEqual(workDayProgress(0), 0);
assert.strictEqual(workDayProgress(4.5 * 3600 * 1000), 0.5);
assert.strictEqual(workDayProgress(9 * 3600 * 1000), 1);
assert.strictEqual(workDayProgress(12 * 3600 * 1000), 1);
assert.strictEqual(workOvertimeProgress(0), 0);
assert.strictEqual(workOvertimeProgress(9 * 3600 * 1000), 0);
assert.strictEqual(workOvertimeProgress(13.5 * 3600 * 1000), 0.5);
assert.strictEqual(workOvertimeProgress(18 * 3600 * 1000), 1);
assert.strictEqual(workOvertimeProgress(20 * 3600 * 1000), 1);
assert.deepStrictEqual(parseClock("9:00").text, "09:00");
assert.strictEqual(workDayLengthMs("09:00", "18:00"), 9 * 3600 * 1000);
assert.strictEqual(workDayLengthMs("10:00", "19:00"), 9 * 3600 * 1000);
assert.strictEqual(workDayLengthMs("09:30", "18:00"), 8.5 * 3600 * 1000);
assert.strictEqual(workDayLengthMs("09:00", "18:00", "12:00", 90), 7.5 * 3600 * 1000);
assert.strictEqual(workDayLengthMs("09:00", "18:00", "12:00", 0), 9 * 3600 * 1000);
assert.strictEqual(normalizeLunchMinutes(), 90);
assert.strictEqual(normalizeLunchMinutes(0), 0);
assert.strictEqual(normalizeLunchMinutes(300), 240);
const lunchHours = { start: "09:00", end: "18:00", lunchStart: "12:00", lunchMinutes: 90 };
assert.strictEqual(workElapsedMs(new Date(2026, 7, 18, 11, 0, 0, 0), lunchHours), 2 * 3600 * 1000);
assert.strictEqual(workElapsedMs(new Date(2026, 7, 18, 12, 30, 0, 0), lunchHours), 3 * 3600 * 1000);
assert.strictEqual(workElapsedMs(new Date(2026, 7, 18, 13, 30, 0, 0), lunchHours), 3 * 3600 * 1000);
assert.strictEqual(workElapsedMs(new Date(2026, 7, 18, 15, 0, 0, 0), lunchHours), 4.5 * 3600 * 1000);
global.window = global.window || {};
window.__workTimerReset = {
  day: workTimerDayKey(new Date(2026, 7, 18, 11, 0, 0, 0)),
  at: new Date(2026, 7, 18, 10, 30, 0, 0).getTime(),
};
assert.strictEqual(workElapsedMs(new Date(2026, 7, 18, 11, 0, 0, 0), lunchHours), 0.5 * 3600 * 1000);
const resetPayload = workTimerResetPayload(new Date(2026, 7, 18, 14, 0, 0, 0));
assert.strictEqual(resetPayload.workTimerResetDay, "2026-8-18");
assert.ok(resetPayload.workTimerResetAt > 0);
window.__workTimerReset = { day: "", at: 0 };
assert.strictEqual(isLunchNow(new Date(2026, 7, 18, 12, 30, 0, 0), lunchHours), true);
assert.strictEqual(isLunchNow(new Date(2026, 7, 18, 13, 30, 0, 0), lunchHours), false);
assert.strictEqual(workDayProgress(4 * 3600 * 1000, 8 * 3600 * 1000), 0.5);
const arcEl = {
  r: "10",
  getAttribute: function (name) { return name === "r" ? this.r : ""; },
  setAttribute: function (name, value) { this[name] = value; },
};
setArcProgress(arcEl, 0.5);
assert.strictEqual(arcEl["stroke-dasharray"].split(" ")[0], (Math.PI * 10).toFixed(3));
assert.strictEqual(workPanelTone(0).mid, "#ff8a2b");
assert.strictEqual(workPanelTone(0, "#ff8a2b").top, "#ff8a2b");
assert.ok(colorLuma(workPanelTone(1, "#ffe8c8").mid) < colorLuma(workPanelTone(0, "#ffe8c8").mid));
assert.ok(colorLuma(workPanelTone(1, "#3a1208").mid) > colorLuma(workPanelTone(0, "#3a1208").mid));
assert.notStrictEqual(workPanelTone(0.5).mid, workPanelTone(0).mid);

assert.strictEqual(normalizeWeekStart(), 0);
assert.strictEqual(normalizeWeekStart("sun"), 0);
assert.strictEqual(normalizeWeekStart("mon"), 1);
assert.strictEqual(normalizeMonthSwitch(), "dblclick");
assert.strictEqual(normalizeMonthSwitch("dblclick"), "dblclick");
assert.strictEqual(normalizeMonthSwitch("click"), "click");
assert.strictEqual(normalizeMonthSwitch("single"), "click");
assert.deepStrictEqual(weekLabels("sun"), ["日", "一", "二", "三", "四", "五", "六"]);
assert.deepStrictEqual(weekLabels("mon"), ["一", "二", "三", "四", "五", "六", "日"]);
assert.strictEqual(isWeekHeaderWeekend(0, "sun"), true);
assert.strictEqual(isWeekHeaderWeekend(6, "sun"), true);
assert.strictEqual(isWeekHeaderWeekend(5, "sun"), false);
assert.strictEqual(isWeekHeaderWeekend(5, "mon"), true);
assert.strictEqual(isWeekHeaderWeekend(0, "mon"), false);
assert.strictEqual(monthCells(2026, 1, "sun")[0].iso, "2025-12-28");
assert.strictEqual(monthCells(2026, 1, "mon")[0].iso, "2025-12-29");
assert.strictEqual(monthCells(2026, 1)[0].iso, "2025-12-28");

assert.strictEqual(holidayRangeLabel("2026-02-16", "2026-02-16"), "2月16日");
assert.strictEqual(holidayRangeLabel("2026-02-15", "2026-02-23"), "2月15日–23日");
assert.strictEqual(holidayRangeLabel("2026-12-31", "2027-01-01"), "12月31日–1月1日");
const yearList = yearHolidayList(
  {
    year: 2026,
    countries: { CN: { name: "China", workdays: [] } },
    byDate: {
      "2026-01-01": [{ code: "CN", name: "元旦" }],
      "2026-02-16": [{ code: "CN", name: "春节" }],
      "2026-02-17": [{ code: "CN", name: "春节" }],
      "2026-10-01": [{ code: "CN", name: "国庆节" }, { code: "US", name: "dummy" }],
    },
  },
  "CN",
  2026
);
assert.strictEqual(yearList.length, 3);
assert.strictEqual(yearList[0].name, "元旦");
assert.strictEqual(yearList[0].date, "2026-01-01");
assert.strictEqual(yearList[1].name, "春节");
assert.strictEqual(yearList[1].date, "2026-02-16");
assert.strictEqual(yearList[2].name, "国庆节");

const brickFallLib = require(path.join(__dirname, "..", "web", "brick-fall.js"));
assert.strictEqual(brickFallLib.BRICK_CAP_RATIO, 0.8);
assert.ok(Math.abs(brickFallLib.brickWantPileRatio(0) - 0) < 0.0001);
assert.ok(Math.abs(brickFallLib.brickWantPileRatio(1) - 0.8) < 0.0001);
assert.ok(brickFallLib.brickWantPileRatio(0.5) > 0.3);
assert.ok(brickFallLib.brickWantPileRatio(0.5) < 0.8);
assert.strictEqual(brickFallLib.brickTargetCount(0, 40), 0);
assert.strictEqual(brickFallLib.brickTargetCount(1, 40), 40);
assert.ok(brickFallLib.brickTargetCount(0.5, 40) < 40);
assert.ok(brickFallLib.brickSpawnDelayMs(0.9, 0.7) > brickFallLib.brickSpawnDelayMs(0.1, 0.1));
assert.ok(brickFallLib.brickSpawnDelayMs(0.3, 0.7) > brickFallLib.brickSpawnDelayMs(0.3, 0.2));
assert.ok(brickFallLib.brickMaxCount(292, 480, 26) >= 10);
const clearAt = new Date(2026, 7, 19, 10, 0, 0, 0);
assert.deepStrictEqual(brickFallLib.brickClearStats({}, clearAt), { day: "2026-8-19", count: 0 });
assert.strictEqual(brickFallLib.brickClearStats({ brickClearDay: "2026-8-19", brickClearCount: 3 }, clearAt).count, 3);
assert.strictEqual(brickFallLib.brickClearStats({ brickClearDay: "2026-8-18", brickClearCount: 3 }, clearAt).count, 0);
assert.strictEqual(brickFallLib.brickClearPayload({ brickClearDay: "2026-8-19", brickClearCount: 2 }, clearAt).brickClearCount, 3);
assert.strictEqual(brickFallLib.brickClearPayload({}, clearAt).brickClearDay, "2026-8-19");
assert.strictEqual(brickFallLib.BRICK_DROP_CD_MS, 3000);
assert.strictEqual(brickFallLib.brickDropReady(3000, 0), true);
assert.strictEqual(brickFallLib.brickDropReady(2999, 0), false);
assert.strictEqual(brickFallLib.brickDropReady(6000, 3000), true);
assert.strictEqual(brickFallLib.brickDropReady(5999, 3000), false);
assert.strictEqual(brickFallLib.brickClampDropX(0, 292, 26), 8 + 13);
assert.strictEqual(brickFallLib.brickClampDropX(292, 292, 26), 292 - 8 - 13);
assert.strictEqual(brickFallLib.brickClampDropX(146, 292, 26), 146);
assert.strictEqual(brickFallLib.brickCanManualDrop({ running: false }, 20000, 0), false);
assert.strictEqual(brickFallLib.brickCanManualDrop({ running: true, rest: true, reduceMotion: true, progress: 0, manualDropAt: 0 }, 20000, 0), true);
assert.strictEqual(brickFallLib.brickCanManualDrop({ running: true, manualDropAt: 18000 }, 20000, 0), false);
assert.strictEqual(brickFallLib.brickCanManualDrop({ running: true, manualDropAt: 0 }, 20000, 0.8), false);
assert.strictEqual(brickFallLib.brickShouldClearOnTick(false, true, "2026-8-19", "2026-8-19"), true);
assert.strictEqual(brickFallLib.brickShouldClearOnTick(true, true, "2026-8-19", "2026-8-19"), false);
assert.strictEqual(brickFallLib.brickShouldClearOnTick(false, false, "2026-8-18", "2026-8-19"), true);
assert.strictEqual(brickFallLib.brickShouldClearOnTick(false, false, "2026-8-19", "2026-8-19"), false);
assert.strictEqual(brickFallLib.brickShouldClearOnTick(false, false, "", "2026-8-19"), false);
assert.strictEqual(brickFallLib.brickManualStats({}, clearAt).count, 0);
assert.strictEqual(brickFallLib.brickManualStats({ brickManualDay: "2026-8-19", brickManualCount: 4 }, clearAt).count, 4);
assert.strictEqual(brickFallLib.brickManualStats({ brickManualDay: "2026-8-18", brickManualCount: 4 }, clearAt).count, 0);
assert.strictEqual(brickFallLib.brickManualDropPayload({ brickManualDay: "2026-8-19", brickManualCount: 2 }, clearAt).brickManualCount, 3);
assert.strictEqual(brickFallLib.brickClearPayload({}, clearAt).brickManualCount, 0);
assert.strictEqual(brickFallLib.brickAutoSpawnAllowed({ frozen: true, rest: false, lunch: false, progress: 0.5 }), true);
assert.strictEqual(brickFallLib.brickAutoSpawnAllowed({ frozen: false, rest: false, lunch: false, progress: 0.5 }), true);
assert.strictEqual(brickFallLib.brickAutoSpawnAllowed({ rest: true, progress: 0.5 }), false);
const pileBox = { w: 200, h: 400 };
const piled = brickFallLib.brickSerializePile([{ x: 100, y: 380, s: 26, rot: 0.2 }], pileBox);
assert.strictEqual(piled.length, 1);
assert.ok(Math.abs(piled[0].x - 0.5) < 0.0001);
assert.ok(Math.abs(piled[0].yb - 0.05) < 0.0001);
const restored = brickFallLib.brickDeserializePile(piled, pileBox);
assert.ok(Math.abs(restored[0].x - 100) < 0.01);
assert.ok(Math.abs(restored[0].y - 380) < 0.01);
assert.ok(Math.abs(restored[0].rot - 0.2) < 0.0001);
const restoredLegacy = brickFallLib.brickDeserializePile([{ x: 0.5, y: 0.95, s: 0.13, rot: 0 }], pileBox);
assert.ok(Math.abs(restoredLegacy[0].y - 380) < 0.01);
assert.strictEqual(brickFallLib.brickPileFromSaved({ brickPileDay: "2026-8-18", brickPile: piled }, clearAt).length, 0);
assert.strictEqual(brickFallLib.brickPileFromSaved({ brickPileDay: "2026-8-19", brickPile: piled }, clearAt).length, 1);
assert.deepStrictEqual(brickFallLib.brickClearPayload({}, clearAt).brickPile, []);
assert.strictEqual(brickFallLib.normalizeBrickLabel(""), "砖");
assert.strictEqual(brickFallLib.normalizeBrickLabel("  搬  "), "搬");
assert.strictEqual(brickFallLib.normalizeBrickLabel("搬砖啊"), "搬砖");
assert.strictEqual(brickFallLib.DEFAULT_BRICK_LABEL, "砖");

console.log("ok");
