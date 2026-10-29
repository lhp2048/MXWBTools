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

