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
