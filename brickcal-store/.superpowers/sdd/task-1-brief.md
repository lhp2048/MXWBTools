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

