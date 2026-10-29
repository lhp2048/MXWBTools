# 牛马日历浏览器扩展 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做一个 Chrome/Edge MV3 工具栏弹窗扩展：一屏显示主日历国家今天上不上班、距周末/下一假、月历，以及当天别国休假；数据打包现有 `holidays.json`，离线可用。

**Architecture:** 假期纯函数抽到 `web/holiday.js`，预览站与扩展共用同一套规则。扩展目录 `extension/` 通过打包脚本复制 JSON / `holiday.js` / `zh-names.js`。Service Worker 每小时刷新角标；popup 渲染方案 A。

**Tech Stack:** Manifest V3、原生 JS（C++11 无关；此处 JS 保持 ES5 风格与 `web/app.js` 一致）、现有 Node 测试、Windows `scripts/*.bat`。

## Global Constraints

- 交流与 UI 文案用中文；休假用「休假」不用「连休」。
- 主日历默认 `CN`；休息日 = 公共假或周六日，且不在 `workdays`。
- 别国列表只用现有 `holidayRow`（有公共假的连休），排除主日历国家；普通周末不进列表。
- 权限仅 `storage` + `alarms`；不注入网页、不请求 caldays。
- 预览站搬砖计时/段子不进扩展。
- Node：`D:\node-v24.11.1-win-x64\node.exe`；Chrome：`D:\app\Chrome\chrome.exe`。
- 未经用户明确要求不要 `git commit`；计划中的 Commit 步骤一律跳过。
- 每任务完成后跑：`& "D:\node-v24.11.1-win-x64\node.exe" tests\test_web_today.js`

---

## File map

| 文件 | 职责 |
| --- | --- |
| `web/holiday.js` | 当地日、休息日、月历格子、今日/点选别国列表、角标文案；Node `module.exports`，浏览器全局函数 |
| `web/app.js` | 预览站 DOM；Node 下 re-export `holiday.js` |
| `web/index.html` | 先加载 `holiday.js` |
| `tests/test_web_today.js` | 现有断言 + 休息日/角标/别国过滤 |
| `extension/manifest.json` | MV3 action popup |
| `extension/background.js` | 角标 |
| `extension/popup.html` `popup.css` `popup.js` | 方案 A |
| `scripts/pack_extension.bat` | 复制数据与 `holiday.js` |
| `docs/superpowers/specs/2026-08-18-holiday-popup-extension-design.md` | 规格，只读 |

---

### Task 1: 主日历休息日与角标文案

**Files:**
- Create: `web/holiday.js`（本任务先写新函数；Task 2 再迁入旧函数。若 Task 2 尚未做，本文件可暂时自包含 `parseDay` / `shiftDay` / `isWeekend` / `localDate` / `daysUntilWeekend`，Task 2 合并去重。）
- Modify: `tests/test_web_today.js`
- Modify: `web/app.js`（仅在 Task 2；本任务不要改预览逻辑）

**Interfaces:**
- Consumes: `payload.countries[code].tz`、`payload.countries[code].workdays`、`payload.byDate[iso][].code`
- Produces:
  - `isPublicHoliday(payload, code, dateStr) -> boolean`
  - `isHomeRestDay(payload, code, dateStr) -> boolean`
  - `badgeText(payload, code, at) -> string`（`"休"` 或 `"1"`–`"5"` 或周末休息时的 `"休"`；工作日周五距周六为 `"1"`）

- [ ] **Step 1: Write the failing test**

在 `tests/test_web_today.js` 的 require 中增加 `isHomeRestDay`、`badgeText`（先从 `../web/holiday.js` 取；若该文件还不存在，测试加载会失败，这是预期）。在文件末尾、`console.log("ok")` 之前追加：

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

说明：`2026-08-18` 周二 04:00Z = 上海 12:00；距周六 4 天。`2026-08-22` 周六。`2026-10-10` 在 `workdays`。

- [ ] **Step 2: Run test to verify it fails**

Run: `& "D:\node-v24.11.1-win-x64\node.exe" tests\test_web_today.js`

Expected: FAIL，`Cannot find module` 或 `isHomeRestDay is not a function`

- [ ] **Step 3: Write minimal implementation**

创建 `web/holiday.js`。时间函数与 `web/app.js` 现有实现保持一致（`localDate` 用 `en-CA`；`parseDay` 为 `iso + "T12:00:00Z"`）。新函数：

```javascript
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
```

`daysUntilWeekend`：周日/周六返回 `0`；周一到周五返回 `6 - getUTCDay()`（周三→3，周五→1）。与 `web/app.js` 现函数相同。

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `& "D:\node-v24.11.1-win-x64\node.exe" tests\test_web_today.js`

Expected: `ok`

- [ ] **Step 5: Commit**

跳过（用户未要求提交）。

---

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

### Task 3: 扩展骨架、打包脚本、角标

**Files:**
- Create: `extension/manifest.json`
- Create: `extension/background.js`
- Create: `extension/popup.html`（可先放一句「加载中…」，Task 4 换成完整 UI）
- Create: `scripts/pack_extension.bat`
- Modify: `scripts/build.bat`（ingest 成功后 `call pack_extension.bat`）
- Create: `tests/test_ext_pack.js`（可选：不强制；用 bat 复制后检查文件存在）

**Interfaces:**
- Consumes: `badgeText(payload, homeCountry, Date)`；`chrome.storage.sync.get({ homeCountry: "CN", watchCountries: [] })`
- Produces: load unpacked 目录 `extension/`（含 `data/holidays.json`、`holiday.js`、`zh-names.js`）

`extension/manifest.json`：

```json
{
  "manifest_version": 3,
  "name": "牛马日历",
  "version": "1.0.0",
  "description": "节假日 / 牛马日历，查看中国调休与其他国家公共假。",
  "permissions": ["storage", "alarms"],
  "action": {
    "default_title": "牛马日历",
    "default_popup": "popup.html"
  },
  "background": {
    "service_worker": "background.js"
  }
}
```

`scripts/pack_extension.bat`：

```bat
@echo off
setlocal EnableExtensions
for %%I in ("%~dp0..") do set "ROOT=%%~fI"
cd /d "%ROOT%"
if not exist "extension\data" mkdir "extension\data"
copy /Y "web\data\holidays.json" "extension\data\holidays.json" >nul
copy /Y "web\holiday.js" "extension\holiday.js" >nul
copy /Y "web\zh-names.js" "extension\zh-names.js" >nul
echo [OK] extension packed
exit /b 0
```

`extension/background.js`：

```javascript
importScripts("holiday.js");

function loadPayload() {
  return fetch(chrome.runtime.getURL("data/holidays.json")).then(function (resp) {
    if (!resp.ok) {
      throw new Error("HTTP " + resp.status);
    }
    return resp.json();
  });
}

function settings() {
  return chrome.storage.sync.get({ homeCountry: "CN", watchCountries: [] }).catch(function () {
    return chrome.storage.local.get({ homeCountry: "CN", watchCountries: [] });
  });
}

function refreshBadge() {
  return Promise.all([loadPayload(), settings()])
    .then(function (pair) {
      const payload = pair[0];
      const home = pair[1].homeCountry || "CN";
      const text = badgeText(payload, home, new Date());
      const color = text === "休" ? "#2f6f5e" : "#c45c26";
      chrome.action.setBadgeBackgroundColor({ color: color });
      chrome.action.setBadgeText({ text: text });
    })
    .catch(function () {
      chrome.action.setBadgeText({ text: "" });
    });
}

chrome.runtime.onInstalled.addListener(function () {
  chrome.alarms.create("badge", { periodInMinutes: 60 });
  refreshBadge();
});
chrome.runtime.onStartup.addListener(refreshBadge);
chrome.alarms.onAlarm.addListener(function (alarm) {
  if (alarm.name === "badge") {
    refreshBadge();
  }
});
chrome.storage.onChanged.addListener(function () {
  refreshBadge();
});
```

`web/data/holidays.json` 不会被 Chrome 自动包含，必须复制进 `extension/data/`。`holiday.js` 用 `importScripts` 时走全局函数分支（SW 里通常没有 `module.exports`）。

- [ ] **Step 1: Write the failing test**

不写 Node 单测打 Chrome API。验收命令：尚未复制时 `extension\data\holidays.json` 不存在。

- [ ] **Step 2: Run test to verify it fails**

Run: `if (Test-Path "extension\data\holidays.json") { throw "should not exist yet" }`

Expected: 文件尚不存在（若已存在先不要删用户数据以外的东西；本任务创建打包脚本即可）

- [ ] **Step 3: Write minimal implementation**

写入 manifest、background、占位 popup、`pack_extension.bat`；`build.bat` 在 ingest 成功后增加：

```bat
call "%~dp0pack_extension.bat"
if errorlevel 1 exit /b 1
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `.\scripts\pack_extension.bat`

Expected: `[OK] extension packed`；`extension\data\holidays.json`、`extension\holiday.js`、`extension\zh-names.js` 存在。

Run: `& "D:\node-v24.11.1-win-x64\node.exe" tests\test_web_today.js`

Expected: `ok`

- [ ] **Step 5: Commit**

跳过。

---

### Task 4: 弹窗方案 A（今日条 + 月历 + 别国）

**Files:**
- Modify: `extension/popup.html`
- Create: `extension/popup.css`
- Create: `extension/popup.js`

**Interfaces:**
- Consumes: `monthCells`、`cnHolidayName`、`isHomeRestDay`、`daysUntilWeekend`、`nextHolidayAfter`、`worldHolidayList`、`formatZhDate`、`zhCountryName`、`localDate`
- Produces: 360px 弹窗；点格切换 `selectedIso`；未点选或点今天时 `useLocalToday: true`

`popup.html` 结构：

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="popup.css" />
  </head>
  <body>
    <header class="popup-head">
      <b>牛马日历</b>
      <span class="home-chip" id="homeChip">主日历 · 中国</span>
    </header>
    <p id="yearNote" hidden></p>
    <section class="hero" id="hero">
      <div class="k" id="heroDate"></div>
      <div class="v" id="heroStatus"></div>
      <div class="chips">
        <div class="chip"><small>距周末</small><b id="chipWeekend"></b></div>
        <div class="chip"><small id="chipHolidayLabel">下一假</small><b id="chipHoliday"></b></div>
      </div>
    </section>
    <section class="cal">
      <div class="cal-nav">
        <button type="button" id="calPrev">‹</button>
        <div class="t" id="calTitle"></div>
        <button type="button" id="calNext">›</button>
        <button type="button" id="calToday">今</button>
      </div>
      <div class="grid" id="calGrid"></div>
    </section>
    <section class="world">
      <h2 id="worldTitle"></h2>
      <div id="worldList"></div>
      <button type="button" id="worldMore" hidden></button>
    </section>
    <div class="settings" id="settings" hidden></div>
    <footer class="foot">
      <span>数据 caldays · 仅供参考</span>
      <button type="button" id="setBtn">设置</button>
    </footer>
    <script src="zh-names.js"></script>
    <script src="holiday.js"></script>
    <script src="popup.js"></script>
  </body>
</html>
```

CSS 色板与原型一致：`--bg:#efe7d8`、`--paper:#fffaf1`、`--accent:#c45c26`、`--rest:#2f6f5e`、`--weekend:#d94b4b`；`body` 宽度 360px；月历 7 列；选中格 `inset 0 0 0 2px #4c8dff`；调休上班 `.shift` 浅橙底，副标题「班」。

`popup.js` 要点（ES5）：

```javascript
var state = {
  payload: null,
  homeCountry: "CN",
  watchCountries: [],
  selectedIso: null,
  viewYear: 0,
  viewMonth: 0,
  worldExpanded: false,
};

function homeDay(payload, home, at) {
  const info = (payload.countries || {})[home] || {};
  return localDate(at || new Date(), info.tz || "Asia/Shanghai");
}

function activeIso() {
  if (state.selectedIso) {
    return state.selectedIso;
  }
  return homeDay(state.payload, state.homeCountry);
}

function isTodayView() {
  return !state.selectedIso || state.selectedIso === homeDay(state.payload, state.homeCountry);
}

function renderHero() {
  const iso = activeIso();
  const rest = isHomeRestDay(state.payload, state.homeCountry, iso);
  document.getElementById("heroDate").textContent = formatZhDate(iso);
  const status = document.getElementById("heroStatus");
  status.textContent = rest ? "今天休假" : "今天上班";
  if (!isTodayView()) {
    status.textContent = rest ? "这天休假" : "这天上班";
  }
  document.getElementById("hero").className = "hero " + (rest ? "rest" : "work");
  const w = daysUntilWeekend(iso);
  document.getElementById("chipWeekend").textContent = w === 0 ? "就是周末" : w + " 天";
  const next = nextHolidayAfter(state.payload, iso, state.homeCountry);
  if (next) {
    document.getElementById("chipHolidayLabel").textContent = "距" + next.name;
    document.getElementById("chipHoliday").textContent = next.days + " 天";
  } else {
    document.getElementById("chipHolidayLabel").textContent = "下一假";
    document.getElementById("chipHoliday").textContent = "—";
  }
}
```

月历：`monthCells(state.viewYear, state.viewMonth)`；格上 `cnHolidayName` 仅当 `homeCountry === "CN"` 或对应当前主日历 `byDate` 中该 code 的 `name`（写一个 `homeHolidayName(payload, home, iso)`：扫 `byDate[iso]` 找 `code === home`）。`workdays` 含该 iso 则加 class `shift` 副标题「班」。点击：`state.selectedIso = iso` 后 `renderAll`。「今」：`selectedIso = null` 并把 view 调到当地今月。

别国：

```javascript
function renderWorld() {
  const rows = worldHolidayList(state.payload, {
    homeCountry: state.homeCountry,
    watchCountries: state.watchCountries,
    useLocalToday: isTodayView(),
    dateStr: activeIso(),
    at: new Date(),
  });
  const title = document.getElementById("worldTitle");
  const list = document.getElementById("worldList");
  const more = document.getElementById("worldMore");
  title.textContent = rows.length
    ? (isTodayView() ? "当天还有 " : "这天还有 ") + rows.length + " 个国家在休假"
    : (state.watchCountries.length ? "这一天没有关注国家在休假" : "这一天没有其他国家在休假");
  const limit = state.worldExpanded ? rows.length : 4;
  const shown = rows.slice(0, limit);
  list.innerHTML = shown
    .map(function (row) {
      return (
        '<div class="row"><span class="flag">' +
        row.code +
        '</span><span class="name">' +
        escapeHtml(row.zhName || row.countryName) +
        '</span><span class="meta">' +
        escapeHtml(row.name || "") +
        "</span></div>"
      );
    })
    .join("");
  if (rows.length > 4 && !state.worldExpanded) {
    more.hidden = false;
    more.textContent = "还有 " + (rows.length - 4) + " 个国家";
  } else {
    more.hidden = true;
  }
}
```

`escapeHtml` 与 `web/app.js` 相同。数据包年份与当地年不同时：`#yearNote` 显示「数据为 {year} 年」并 `hidden = false`。

加载：

```javascript
function loadSettings() {
  return chrome.storage.sync
    .get({ homeCountry: "CN", watchCountries: [] })
    .catch(function () {
      return chrome.storage.local.get({ homeCountry: "CN", watchCountries: [] });
    });
}

Promise.all([fetch("./data/holidays.json").then(function (r) { return r.json(); }), loadSettings()])
  .then(function (pair) {
    state.payload = pair[0];
    state.homeCountry = pair[1].homeCountry || "CN";
    state.watchCountries = pair[1].watchCountries || [];
    const today = homeDay(state.payload, state.homeCountry);
    const p = parseDay(today);
    state.viewYear = p.getUTCFullYear();
    state.viewMonth = p.getUTCMonth() + 1;
    document.getElementById("homeChip").textContent =
      "主日历 · " + zhCountryName(state.homeCountry, state.homeCountry);
    renderAll();
  })
  .catch(function () {
    document.body.textContent = "还没有假期数据";
  });
```

设置按钮本任务只 `toggle` `#settings` 的 `hidden`；面板内容 Task 5 再填。免责不单独弹窗，底栏「仅供参考」即可（规格：与预览站一致的声明可放在设置面板顶部一行）。

- [ ] **Step 1: Write the failing test**

无 DOM 测试框架。用 Node 覆盖 `worldHolidayList`（Task 2 已有）+ 手动打开 popup。若要自动化：在 `tests/test_web_today.js` 断言 `homeHolidayName` 若抽出；否则本步可写 `homeHolidayName` 到 `holiday.js` 并测国庆名。

```javascript
function homeHolidayName(payload, code, iso) {
  const items = ((payload && payload.byDate) || {})[iso] || [];
  for (let i = 0; i < items.length; i++) {
    if (items[i].code === code && items[i].name) {
      return items[i].name;
    }
  }
  return "";
}
```

`cnHolidayName` 可改为调用 `homeHolidayName(payload, "CN", iso)`。测试：`assert.strictEqual(homeHolidayName(restPayload, "CN", "2026-10-01"), "国庆节")`。

- [ ] **Step 2: Run test to verify it fails**

若函数未导出：FAIL。

- [ ] **Step 3: Write minimal implementation**

完成 popup 三文件；`pack_extension.bat` 不必复制 css/html（已在 `extension/`）。再跑 pack 以刷新 `holiday.js`。

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `& "D:\node-v24.11.1-win-x64\node.exe" tests\test_web_today.js`

Expected: `ok`

Run: `.\scripts\pack_extension.bat`

Chrome 加载：`chrome://extensions` → 开发者模式 → 加载已解压扩展 → 选 `all-word-happy\extension`。点图标应看到 360px 方案 A。

- [ ] **Step 5: Commit**

跳过。

---

### Task 5: 设置（主日历 + 关注国家）

**Files:**
- Modify: `extension/popup.js`（渲染设置、读写 storage）
- Modify: `extension/popup.css`（设置区 checkbox 列表，最大高度 180px，内部滚动）

**Interfaces:**
- Consumes: `chrome.storage.sync`（失败则 `local`）；`payload.countries`
- Produces: 保存 `{ homeCountry: string, watchCountries: string[] }`；保存后 `renderAll`；background 已监听 `storage.onChanged` 刷新角标

设置面板 HTML 由 JS 生成：

```javascript
function renderSettings() {
  const box = document.getElementById("settings");
  const countries = state.payload.countries || {};
  const codes = Object.keys(countries).sort();
  let html = "<p class=\"hint\">假期与调休来自公开源，仅供浏览参考，以各国官方通知为准。</p>";
  html += "<label>主日历国家</label><select id=\"homeSelect\">";
  codes.forEach(function (code) {
    const sel = code === state.homeCountry ? " selected" : "";
    html +=
      "<option value=\"" +
      code +
      "\"" +
      sel +
      ">" +
      escapeHtml(zhCountryName(code, countries[code].name || code)) +
      " " +
      code +
      "</option>";
  });
  html += "</select>";
  html += "<label>关注的别国（空 = 显示全部）</label><div class=\"watch\">";
  codes.forEach(function (code) {
    if (code === state.homeCountry) {
      return;
    }
    const on = state.watchCountries.indexOf(code) >= 0 ? " checked" : "";
    html +=
      "<label class=\"chk\"><input type=\"checkbox\" data-watch=\"" +
      code +
      "\"" +
      on +
      " /> " +
      escapeHtml(zhCountryName(code, countries[code].name || code)) +
      "</label>";
  });
  html += "</div>";
  box.innerHTML = html;
}

function saveSettings(next) {
  const data = {
    homeCountry: next.homeCountry || "CN",
    watchCountries: next.watchCountries || [],
  };
  return chrome.storage.sync.set(data).catch(function () {
    return chrome.storage.local.set(data);
  });
}
```

`homeSelect` change：更新 `homeCountry`，从 `watchCountries` 去掉新主日历码，`saveSettings` 后 `renderAll`（含设置）。checkbox：收集 `data-watch` 勾选列表后保存。未知码在读取时过滤：

```javascript
state.watchCountries = (pair[1].watchCountries || []).filter(function (code) {
  return state.payload.countries[code];
});
if (!state.payload.countries[state.homeCountry]) {
  state.homeCountry = "CN";
}
```

- [ ] **Step 1: Write the failing test**

在 `tests/test_web_today.js`：

```javascript
const cleaned = ["US", "XX"].filter(function (code) {
  return { US: true, CN: true }[code];
});
assert.deepStrictEqual(cleaned, ["US"]);
```

这只锁过滤规则；真正 storage 在扩展里手动测：改主日历为 US 后角标按美国当地周末计算。

- [ ] **Step 2: Run test to verify it fails**

不必强行让这步失败；直接实现设置 UI。

- [ ] **Step 3: Write minimal implementation**

完成 `renderSettings`、事件委托、`setBtn` 显示面板。

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `& "D:\node-v24.11.1-win-x64\node.exe" tests\test_web_today.js`

Expected: `ok`

手动：设置关注 `US`，点国庆 `2026-10-01`（若数据年是 2026），列表应只有美国（若那天美国有假）或为空；清空关注则恢复多国。无网络仍能打开弹窗。

- [ ] **Step 5: Commit**

跳过。

---

### Task 6: 打包接入与验收清单

**Files:**
- Modify: `scripts/dev.bat`（可选：dev 结束时也 `pack_extension.bat`，便于改完预览数据后刷新扩展）
- Modify: `scripts/pack_extension.bat`（复制后若缺 `popup.js` 则 `exit /b 1`）

**Interfaces:**
- Consumes: 前序全部文件
- Produces: 可 load unpacked 的完整扩展

`pack_extension.bat` 末尾增加存在性检查：

```bat
if not exist "extension\popup.js" (
  echo [ERR] extension\popup.js missing
  exit /b 1
)
if not exist "extension\data\holidays.json" (
  echo [ERR] holidays.json missing, run ingest first
  exit /b 1
)
```

- [ ] **Step 1: Write the failing test**

无。

- [ ] **Step 2: Run test to verify it fails**

无。

- [ ] **Step 3: Write minimal implementation**

补检查；`dev.bat` 在启动服务前或后调用 `pack_extension.bat`（失败不阻断预览站，`call` 后不 `exit`）。

- [ ] **Step 4: Run the tests and make sure they pass**

Run:

```
& "D:\node-v24.11.1-win-x64\node.exe" tests\test_web_today.js
.\scripts\pack_extension.bat
```

Expected: `ok` 与 `[OK] extension packed`。

验收（对照规格）：

1. load unpacked `extension\`，不需要预览站。
2. 弹窗是方案 A：今日条、两枚计数、月历、别国、底栏设置。
3. 中国 `workdays` 当天显示上班；公共假/周末显示休假。
4. 角标休息为「休」，工作日为距周六数字。
5. 点月历后别国改为该公历日；「今」回到当地今天（`holidaysToday`）。
6. 关注列表过滤生效；主日历国家不出现在别国列表。
7. 断网仍能打开。

- [ ] **Step 5: Commit**

跳过。

---

## Spec coverage

| 规格项 | 任务 |
| --- | --- |
| 工具栏 popup 360px 方案 A | 4 |
| 角标 休 / 距周六 | 1, 3 |
| storage + alarms，无 host | 3, 5 |
| 今日上班/休假含普通周末，扣 workdays | 1, 4 |
| 别国只用 holidayRow 连休 | 2, 4 |
| 排除主日历、关注过滤、最多 4 行 | 2, 4, 5 |
| 打包 holidays.json，离线 | 3, 6 |
| 数据年份旁注 | 4 |
| 共用 holiday.js，预览不双规则 | 2 |
| 设置主日历 + 关注 | 5 |
| 免责 / caldays 署名 | 4, 5 |
| 不做新标签/通知/商店/搬砖 | 全局约束 |

无 TBD。`homeHolidayName` / `worldHolidayList` / `badgeText` / `isHomeRestDay` 名称前后任务一致。
