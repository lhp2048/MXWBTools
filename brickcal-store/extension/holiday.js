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
  const untilWeekend = daysUntilWeekend(day);
  if (untilWeekend === 0) {
    return "班";
  }
  return String(untilWeekend);
}

function holidayDatesFor(payload, code) {
  const byDate = (payload && payload.byDate) || {};
  const dates = [];
  Object.keys(byDate).forEach(function (day) {
    (byDate[day] || []).forEach(function (item) {
      if (item.code === code) {
        dates.push(day);
      }
    });
  });
  return dates.sort();
}

function restDays(holidayDates, workdays) {
  const holidaySet = {};
  holidayDates.forEach(function (d) {
    holidaySet[d] = true;
  });
  const workSet = {};
  (workdays || []).forEach(function (d) {
    workSet[d] = true;
  });
  if (!holidayDates.length) {
    return [];
  }
  const begin = shiftDay(holidayDates[0], -8);
  const finish = shiftDay(holidayDates[holidayDates.length - 1], 8);
  const rest = [];
  let cursor = begin;
  while (cursor <= finish) {
    if (!workSet[cursor] && (holidaySet[cursor] || isWeekend(cursor))) {
      rest.push(cursor);
    }
    cursor = shiftDay(cursor, 1);
  }
  return rest;
}

function restSpanOnDate(payload, code, dateStr) {
  if (!isHomeRestDay(payload, code, dateStr)) {
    return null;
  }
  let start = dateStr;
  let end = dateStr;
  let guard = 0;
  while (guard < 40) {
    const prev = shiftDay(start, -1);
    if (!isHomeRestDay(payload, code, prev)) {
      break;
    }
    start = prev;
    guard += 1;
  }
  guard = 0;
  while (guard < 40) {
    const next = shiftDay(end, 1);
    if (!isHomeRestDay(payload, code, next)) {
      break;
    }
    end = next;
    guard += 1;
  }
  let cursor = start;
  let days = 0;
  let hasHoliday = false;
  while (cursor <= end) {
    days += 1;
    if (isPublicHoliday(payload, code, cursor)) {
      hasHoliday = true;
    }
    cursor = shiftDay(cursor, 1);
  }
  if (!hasHoliday) {
    return null;
  }
  return { start: start, end: end, days: days };
}

function pushSpan(spans, days, holidaySet) {
  if (!days.length) {
    return;
  }
  const hasHoliday = days.some(function (d) {
    return holidaySet[d];
  });
  if (!hasHoliday) {
    return;
  }
  spans.push({ start: days[0], end: days[days.length - 1], days: days.length });
}

function remainingDays(dateStr, spanEnd) {
  return Math.max(
    0,
    Math.round((parseDay(spanEnd) - parseDay(dateStr)) / 86400000)
  );
}

var COUNTRY_ZH_MAP = {};
if (typeof COUNTRY_ZH !== "undefined") {
  COUNTRY_ZH_MAP = COUNTRY_ZH;
} else if (typeof require === "function") {
  COUNTRY_ZH_MAP = require("./zh-names.js");
}

function zhCountryName(code, fallback) {
  return COUNTRY_ZH_MAP[code] || fallback || code;
}

function flagEmoji(code) {
  return String(code || "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 2)
    .replace(/./g, function (ch) {
      return String.fromCodePoint(127397 + ch.charCodeAt(0));
    });
}

function formatZhDate(iso) {
  const week = ["日", "一", "二", "三", "四", "五", "六"];
  const d = parseDay(iso);
  return (
    d.getUTCFullYear() +
    "年" +
    (d.getUTCMonth() + 1) +
    "月" +
    d.getUTCDate() +
    "日 周" +
    week[d.getUTCDay()]
  );
}

function lunarDayName(n) {
  const digits = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
  if (n <= 10) {
    return "初" + digits[n];
  }
  if (n < 20) {
    return "十" + digits[n - 10];
  }
  if (n === 20) {
    return "二十";
  }
  if (n < 30) {
    return "廿" + digits[n - 20];
  }
  return "三十";
}

function lunarMonthName(iso) {
  const monthParts = new Intl.DateTimeFormat("zh-CN-u-ca-chinese", {
    month: "short",
  }).formatToParts(parseDay(iso));
  return (monthParts.filter(function (p) { return p.type === "month"; })[0] || {}).value || "";
}

function lunarLabel(iso) {
  try {
    const parts = new Intl.DateTimeFormat("zh-CN-u-ca-chinese", {
      day: "numeric",
    }).formatToParts(parseDay(iso));
    const day = (parts.filter(function (p) { return p.type === "day"; })[0] || {}).value;
    const n = parseInt(day, 10);
    if (!n) {
      return day || "";
    }
    if (n === 1) {
      return lunarMonthName(iso) + lunarDayName(1);
    }
    return lunarDayName(n);
  } catch (err) {
    return "";
  }
}

function lunarFullLabel(iso) {
  try {
    const parts = new Intl.DateTimeFormat("zh-CN-u-ca-chinese", {
      day: "numeric",
    }).formatToParts(parseDay(iso));
    const day = (parts.filter(function (p) { return p.type === "day"; })[0] || {}).value;
    const n = parseInt(day, 10);
    const month = lunarMonthName(iso);
    if (!n) {
      return month + (day || "");
    }
    return month + lunarDayName(n);
  } catch (err) {
    return lunarLabel(iso);
  }
}

function homeHolidayName(payload, code, iso) {
  const items = ((payload && payload.byDate) || {})[iso] || [];
  for (let i = 0; i < items.length; i++) {
    if (items[i].code === code && items[i].name) {
      return items[i].name;
    }
  }
  return "";
}

function cnHolidayName(payload, iso) {
  return homeHolidayName(payload, "CN", iso);
}

var CN_SOLAR_FEST = {
  "01-01": "元旦",
  "02-14": "情人节",
  "03-08": "妇女节",
  "03-12": "植树节",
  "04-01": "愚人节",
  "05-01": "劳动节",
  "05-04": "青年节",
  "06-01": "儿童节",
  "07-01": "建党节",
  "08-01": "建军节",
  "09-10": "教师节",
  "10-01": "国庆节",
  "10-31": "万圣节",
  "11-11": "光棍节",
  "12-25": "圣诞节",
};

var CN_LUNAR_FEST = {
  "1-1": "春节",
  "1-15": "元宵节",
  "2-2": "龙抬头",
  "5-5": "端午节",
  "7-7": "七夕",
  "7-15": "中元节",
  "8-15": "中秋节",
  "9-9": "重阳节",
  "12-8": "腊八节",
  "12-23": "小年",
};

var CN_JIEQI_NAMES = [
  "小寒",
  "大寒",
  "立春",
  "雨水",
  "惊蛰",
  "春分",
  "清明",
  "谷雨",
  "立夏",
  "小满",
  "芒种",
  "夏至",
  "小暑",
  "大暑",
  "立秋",
  "处暑",
  "白露",
  "秋分",
  "寒露",
  "霜降",
  "立冬",
  "小雪",
  "大雪",
  "冬至",
];

var CN_JIEQI_OFFSET = [
  0, 21208, 42467, 63836, 85337, 107014, 128867, 150921, 173149, 195551, 218072, 240693, 263343, 285989,
  308563, 331033, 353350, 375494, 397447, 419210, 440795, 462224, 483532, 504758,
];

var cnJieqiYearCache = {};

function lunarMonthDay(iso) {
  try {
    const parts = new Intl.DateTimeFormat("zh-CN-u-ca-chinese", {
      month: "numeric",
      day: "numeric",
    }).formatToParts(parseDay(iso));
    let month = 0;
    let day = 0;
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].type === "month") {
        month = parseInt(parts[i].value, 10) || 0;
      }
      if (parts[i].type === "day") {
        day = parseInt(parts[i].value, 10) || 0;
      }
    }
    if (!month || !day) {
      return null;
    }
    return { month: month, day: day };
  } catch (err) {
    return null;
  }
}

function cnTraditionalName(iso) {
  const d = parseDay(iso);
  const md =
    String(d.getUTCMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getUTCDate()).padStart(2, "0");
  if (CN_SOLAR_FEST[md]) {
    return CN_SOLAR_FEST[md];
  }
  const lunar = lunarMonthDay(iso);
  if (lunar) {
    const key = lunar.month + "-" + lunar.day;
    if (CN_LUNAR_FEST[key]) {
      return CN_LUNAR_FEST[key];
    }
  }
  const next = lunarMonthDay(shiftDay(iso, 1));
  if (next && next.month === 1 && next.day === 1) {
    return "除夕";
  }
  return "";
}

function cnJieqiMap(year) {
  if (cnJieqiYearCache[year]) {
    return cnJieqiYearCache[year];
  }
  const map = {};
  for (let i = 0; i < 24; i++) {
    const utc = new Date(31556925974.7 * (year - 1900) + CN_JIEQI_OFFSET[i] * 60000 + Date.UTC(1900, 0, 6, 2, 5));
    const bj = new Date(utc.getTime() + 8 * 3600 * 1000);
    const iso = bj.toISOString().slice(0, 10);
    map[iso] = CN_JIEQI_NAMES[i];
  }
  cnJieqiYearCache[year] = map;
  return map;
}

function cnSolarTermName(iso) {
  const y = parseDay(iso).getUTCFullYear();
  return cnJieqiMap(y)[iso] || cnJieqiMap(y - 1)[iso] || cnJieqiMap(y + 1)[iso] || "";
}

function cnDayMarks(payload, iso, isShift) {
  const out = [];
  function push(text, kind, label) {
    if (!text) {
      return;
    }
    for (let i = 0; i < out.length; i++) {
      if (out[i].text === text) {
        return;
      }
    }
    out.push({ text: text, kind: kind, label: label });
  }
  if (isShift) {
    push("班", "shift", "调休上班");
  }
  push(homeHolidayName(payload, "CN", iso), "fest", "节日");
  push(cnTraditionalName(iso), "fest", "节日");
  push(cnSolarTermName(iso), "term", "节气");
  const lunar = lunarFullLabel(iso);
  if (lunar) {
    push("农历" + lunar, "lunar", "农历");
  }
  return out;
}

function cnDayMark(payload, iso, isShift) {
  if (isShift) {
    return { text: "班", kind: "shift" };
  }
  const publicName = homeHolidayName(payload, "CN", iso);
  if (publicName) {
    return { text: publicName, kind: "fest" };
  }
  const trad = cnTraditionalName(iso);
  if (trad) {
    return { text: trad, kind: "fest" };
  }
  const term = cnSolarTermName(iso);
  if (term) {
    return { text: term, kind: "term" };
  }
  const lunar = lunarLabel(iso);
  if (lunar) {
    return { text: lunar, kind: "lunar" };
  }
  return { text: "", kind: "" };
}

function normalizeWeekStart(value) {
  if (value === 1 || value === "1" || value === "mon") {
    return 1;
  }
  return 0;
}

function normalizeMonthSwitch(value) {
  if (value === "click" || value === "single" || value === 1 || value === "1") {
    return "click";
  }
  return "dblclick";
}

function weekLabels(weekStart) {
  if (normalizeWeekStart(weekStart) === 1) {
    return ["一", "二", "三", "四", "五", "六", "日"];
  }
  return ["日", "一", "二", "三", "四", "五", "六"];
}

function isWeekHeaderWeekend(index, weekStart) {
  if (normalizeWeekStart(weekStart) === 1) {
    return index >= 5;
  }
  return index === 0 || index === 6;
}

function monthCells(year, month, weekStart) {
  weekStart = normalizeWeekStart(weekStart);
  const first = year + "-" + String(month).padStart(2, "0") + "-01";
  const weekday = parseDay(first).getUTCDay();
  const startWeek = weekStart === 1 ? (weekday + 6) % 7 : weekday;
  const start = shiftDay(first, -startWeek);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const iso = shiftDay(start, i);
    const d = parseDay(iso);
    cells.push({
      iso: iso,
      day: d.getUTCDate(),
      inMonth: d.getUTCMonth() + 1 === month,
      weekend: d.getUTCDay() === 0 || d.getUTCDay() === 6,
    });
  }
  return cells;
}

function holidayRangeLabel(start, end) {
  const a = parseDay(start);
  const b = parseDay(end || start);
  const aM = a.getUTCMonth() + 1;
  const aD = a.getUTCDate();
  const bM = b.getUTCMonth() + 1;
  const bD = b.getUTCDate();
  if (!end || start === end) {
    return aM + "月" + aD + "日";
  }
  if (aM === bM) {
    return aM + "月" + aD + "日–" + bD + "日";
  }
  return aM + "月" + aD + "日–" + bM + "月" + bD + "日";
}

function yearHolidayList(payload, code, year) {
  code = code || "CN";
  if (year == null && payload && payload.year) {
    year = payload.year;
  }
  const dates = Object.keys((payload && payload.byDate) || {}).sort();
  const seen = {};
  const out = [];
  for (let i = 0; i < dates.length; i++) {
    const iso = dates[i];
    if (year && parseDay(iso).getUTCFullYear() !== year) {
      continue;
    }
    const items = payload.byDate[iso] || [];
    for (let j = 0; j < items.length; j++) {
      const item = items[j];
      if (item.code !== code || !item.name || seen[item.name]) {
        continue;
      }
      seen[item.name] = true;
      const span = restSpanOnDate(payload, code, iso);
      out.push({
        name: item.name,
        date: iso,
        start: span ? span.start : iso,
        end: span ? span.end : iso,
        days: span ? span.days : 1,
      });
    }
  }
  return out;
}

function nextHolidaysAfter(payload, iso, code, limit) {
  code = code || "CN";
  limit = limit || 3;
  const dates = Object.keys((payload && payload.byDate) || {}).sort();
  const seen = {};
  const out = [];
  for (let i = 0; i < dates.length; i++) {
    if (dates[i] <= iso) {
      continue;
    }
    const items = payload.byDate[dates[i]] || [];
    for (let j = 0; j < items.length; j++) {
      const item = items[j];
      if (item.code !== code || !item.name || seen[item.name]) {
        continue;
      }
      seen[item.name] = true;
      out.push({
        date: dates[i],
        name: item.name,
        days: Math.round((parseDay(dates[i]) - parseDay(iso)) / 86400000),
      });
      if (out.length >= limit) {
        return out;
      }
    }
  }
  return out;
}

function nextHolidayAfter(payload, iso, code) {
  return nextHolidaysAfter(payload, iso, code, 1)[0] || null;
}

function upcomingHolidaySentence(items) {
  if (!items || !items.length) {
    return "近期没有节日";
  }
  return items
    .map(function (item) {
      return "距" + item.name + item.days + "天";
    })
    .join("，");
}

function calendarFootText(payload, iso) {
  const weekend = daysUntilWeekend(iso);
  const weekendText =
    weekend === 0 ? "今天就是周末" : "距离周末还有" + weekend + "天";
  const next = nextHolidayAfter(payload, iso, "CN");
  if (!next) {
    return weekendText;
  }
  return weekendText + "，距离" + next.name + "还有" + next.days + "天";
}

function holidaysInSpan(payload, code, start, end) {
  const byDate = (payload && payload.byDate) || {};
  const items = [];
  let cursor = start;
  while (cursor <= end) {
    (byDate[cursor] || []).forEach(function (item) {
      if (item.code === code) {
        items.push({
          date: cursor,
          name: item.name,
          kind: item.kind || "public",
          reason: item.reason || "",
        });
      }
    });
    cursor = shiftDay(cursor, 1);
  }
  return items;
}

function holidayRow(payload, code, day) {
  const countries = (payload && payload.countries) || {};
  const byDate = (payload && payload.byDate) || {};
  const info = countries[code] || {};
  const span = restSpanOnDate(payload, code, day);
  if (!span) {
    return null;
  }
  const todayItems = (byDate[day] || []).filter(function (item) {
    return item.code === code;
  });
  const spanHolidays = holidaysInSpan(payload, code, span.start, span.end);
  const left = remainingDays(day, span.end);
  return {
    code: code,
    name: todayItems.length ? todayItems[0].name : "休假",
    countryName: info.name || code,
    zhName: zhCountryName(code, info.name || code),
    tz: info.tz || "UTC",
    localDate: day,
    localDateLabel: formatZhDate(day),
    spanStart: span.start,
    spanEnd: span.end,
    spanStartLabel: formatZhDate(span.start),
    spanEndLabel: formatZhDate(span.end),
    spanDays: span.days,
    remainingDays: left,
    elapsedDays: span.days - left,
    holidaysInSpan: spanHolidays,
  };
}

function holidaysToday(payload, at) {
  const countries = (payload && payload.countries) || {};
  const results = [];
  const tzDay = {};
  Object.keys(countries).forEach(function (code) {
    const info = countries[code] || {};
    const tz = info.tz || "UTC";
    if (!tzDay[tz]) {
      tzDay[tz] = localDate(at, tz);
    }
    const row = holidayRow(payload, code, tzDay[tz]);
    if (row) {
      results.push(row);
    }
  });
  results.sort(function (a, b) {
    return a.code.localeCompare(b.code);
  });
  return results;
}

function holidaysOnCalendarDate(payload, dateStr) {
  const countries = (payload && payload.countries) || {};
  const results = [];
  Object.keys(countries).forEach(function (code) {
    const row = holidayRow(payload, code, dateStr);
    if (row) {
      results.push(row);
    }
  });
  results.sort(function (a, b) {
    return a.code.localeCompare(b.code);
  });
  return results;
}

function todayIso() {
  const n = new Date();
  const month = String(n.getMonth() + 1).padStart(2, "0");
  const day = String(n.getDate()).padStart(2, "0");
  return n.getFullYear() + "-" + month + "-" + day;
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) {
    return false;
  }
  const parsed = new Date(value + "T12:00:00Z");
  return parsed.toISOString().slice(0, 10) === value;
}

function clampDateToYear(dateStr, year) {
  const y = String(year || new Date().getFullYear());
  if (isIsoDate(dateStr) && dateStr.slice(0, 4) === y) {
    return dateStr;
  }
  const today = todayIso();
  const mapped = y + "-" + today.slice(5);
  if (isIsoDate(mapped)) {
    return mapped;
  }
  return y + "-01-01";
}

function queryHolidayRows(payload, dateStr) {
  const queryDate = clampDateToYear(dateStr, payload && payload.year);
  const useLocalToday = queryDate === todayIso();
  return {
    queryDate: queryDate,
    useLocalToday: useLocalToday,
    items: holidaysOnCalendarDate(payload, queryDate),
  };
}

function worldHolidayList(payload, options) {
  options = options || {};
  const home = options.homeCountry || "CN";
  const watch = options.watchCountries || [];
  const at = options.at || new Date();
  let rows = options.useLocalToday
    ? holidaysToday(payload, at)
    : holidaysOnCalendarDate(payload, options.dateStr);
  rows = rows.filter(function (row) {
    return row.code !== home;
  });
  if (watch.length) {
    const allow = {};
    watch.forEach(function (code) {
      allow[code] = true;
    });
    rows = rows.filter(function (row) {
      return allow[row.code];
    });
  }
  return rows;
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
    holidayDatesFor: holidayDatesFor,
    restDays: restDays,
    restSpanOnDate: restSpanOnDate,
    pushSpan: pushSpan,
    remainingDays: remainingDays,
    zhCountryName: zhCountryName,
    flagEmoji: flagEmoji,
    formatZhDate: formatZhDate,
    lunarLabel: lunarLabel,
    lunarFullLabel: lunarFullLabel,
    homeHolidayName: homeHolidayName,
    cnHolidayName: cnHolidayName,
    cnTraditionalName: cnTraditionalName,
    cnSolarTermName: cnSolarTermName,
    cnDayMark: cnDayMark,
    cnDayMarks: cnDayMarks,
    monthCells: monthCells,
    normalizeWeekStart: normalizeWeekStart,
    normalizeMonthSwitch: normalizeMonthSwitch,
    weekLabels: weekLabels,
    isWeekHeaderWeekend: isWeekHeaderWeekend,
    holidayRangeLabel: holidayRangeLabel,
    yearHolidayList: yearHolidayList,
    nextHolidayAfter: nextHolidayAfter,
    nextHolidaysAfter: nextHolidaysAfter,
    upcomingHolidaySentence: upcomingHolidaySentence,
    calendarFootText: calendarFootText,
    holidaysInSpan: holidaysInSpan,
    holidayRow: holidayRow,
    holidaysToday: holidaysToday,
    holidaysOnCalendarDate: holidaysOnCalendarDate,
    todayIso: todayIso,
    isIsoDate: isIsoDate,
    clampDateToYear: clampDateToYear,
    queryHolidayRows: queryHolidayRows,
    worldHolidayList: worldHolidayList,
  };
}
