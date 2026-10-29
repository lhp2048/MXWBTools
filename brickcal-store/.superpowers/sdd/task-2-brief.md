### Task 2: 抽出共用假期逻辑并接到预览站

**Files:**
- Modify: `web/holiday.js`（迁入 `app.js` 中下列函数，行为一字不改）
- Modify: `web/app.js`（删除已迁函数；Node `module.exports` 合并 holiday 导出）
- Modify: `web/index.html`（`app.js` 前增加 `<script src="./holiday.js"></script>`）
- Modify: `tests/test_web_today.js`（`worldHolidayList` 断言；require 仍可从 `app.js` 取旧名）

**Interfaces:**
- Consumes: Task 1 的 `web/holiday.js`
- Produces: `holiday.js` 另导出（名称与现 `app.js` 相同）：`holidayDatesFor`、`restDays`、`restSpanOnDate`、`pushSpan`、`remainingDays`、`zhCountryName`、`flagEmoji`、`formatZhDate`、`lunarLabel`、`cnHolidayName`、`monthCells`、`nextHolidayAfter`、`calendarFootText`、`holidaysInSpan`、`holidayRow`、`holidaysToday`、`holidaysOnCalendarDate`、`todayIso`、`isIsoDate`、`clampDateToYear`、`queryHolidayRows`、`worldHolidayList`

`worldHolidayList(payload, options)`：

```javascript
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
```

从 `web/app.js` **原样剪切**到 `holiday.js` 的函数（不要改算法）：`localDate`（若 Task 1 已有则保留一份）、`parseDay`、`shiftDay`、`isWeekend`、`holidayDatesFor`、`restDays`、`restSpanOnDate`、`pushSpan`、`remainingDays`、`zhCountryName` 及相关 `COUNTRY_ZH_MAP` 初始化、`flagEmoji`、`formatZhDate`、`lunarLabel`、`cnHolidayName`、`monthCells`、`daysUntilWeekend`、`nextHolidayAfter`、`calendarFootText`、`holidaysInSpan`、`holidayRow`、`holidaysToday`、`holidaysOnCalendarDate`、`todayIso`、`isIsoDate`、`clampDateToYear`、`queryHolidayRows`。

留在 `app.js`：`localTime`、`tickLocalClocks`、`renderCalendar`、`renderPage`、`boot`、`WORK_*`、`layoutMiddleArea`、预览专用 DOM。`app.js` 在浏览器里依赖全局的上述函数（由 `holiday.js` 脚本提供）。

Node 底部改为：

```javascript
if (typeof module !== "undefined" && module.exports) {
  const holiday = require("./holiday.js");
  module.exports = Object.assign({}, holiday, {
    localTime: localTime,
    formatDuration: formatDuration,
    middleGridSize: middleGridSize,
    pickWorkQuote: pickWorkQuote,
    WORK_QUOTES: WORK_QUOTES,
    WORK_SLOGANS: WORK_SLOGANS,
  });
} else if (typeof window !== "undefined") {
  window.AllWordHappy = { holidaysToday: holidaysToday, localDate: localDate };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
}
```

`holiday.js` 的 `module.exports` 列出全部纯函数（含 Task 1 与本任务）。浏览器不进 `module.exports` 分支，函数保持全局。

- [ ] **Step 1: Write the failing test**

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

`worldHolidayList` 先从 `app.js` 的 require 解构；尚未导出时失败。

- [ ] **Step 2: Run test to verify it fails**

Run: `& "D:\node-v24.11.1-win-x64\node.exe" tests\test_web_today.js`

Expected: FAIL `worldHolidayList is not a function` 或解构 undefined

- [ ] **Step 3: Write minimal implementation**

完成剪切、`index.html` 增加 script、实现 `worldHolidayList`、更新两个文件的 `module.exports`。确认 `app.js` 不再出现 `function restSpanOnDate` 等已迁定义（可用搜索）。

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `& "D:\node-v24.11.1-win-x64\node.exe" tests\test_web_today.js`

Expected: `ok`

再用预览页点日历，确认中国格与「今天谁在休假」仍正常（回归，不改视觉）。

- [ ] **Step 5: Commit**

跳过。

---

