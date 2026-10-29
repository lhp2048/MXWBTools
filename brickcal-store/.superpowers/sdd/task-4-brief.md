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

