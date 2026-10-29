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

