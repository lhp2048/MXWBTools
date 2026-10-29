# 牛马日历浏览器扩展（工具栏弹窗）

日期：2026-08-18  
状态：已定稿，待实现  
原型：`web/ext-popup-prototype.html` 方案 A

## 目标

在 Chrome / Edge 工具栏提供一个 360px 弹窗：一眼看到**主日历国家今天上不上班**、距周末/下一假、当月日历，以及**当天还有哪些国家在休假**。数据沿用本仓库已 ingest 的 `web/data/holidays.json`，离线可用。

非目标（本轮不做）：新标签页、侧边栏、网页注入、系统通知、上架商店、预览站里的搬砖计时/段子。

## 产品

### 入口

- Manifest V3 扩展，工具栏图标打开 `popup`。
- 图标角标：
  - 主日历国家**今天是休息日** → `休`
  - 否则 → 距下一个周六的天数（1–5；周五为 `1`）
  - Chrome 角标最多约 4 个字符，不用长文案。
- 权限：`storage`（设置）、`alarms`（跨日刷新角标）。不要 `host_permissions`、不要内容脚本。

### 弹窗（方案 A，单屏）

宽度 360px，视觉跟随预览站：米色底、白卡片、周末红字、公共假橙色小字。

1. **顶栏**：标题「牛马日历」+ 主日历国家芯片（默认「主日历 · 中国」）。
2. **今日条**：主日历国家当地日期；大字「今天上班」或「今天休假」（休假时用绿色）。
3. **两枚计数**：距周末（自然周六，与预览站 `daysUntilWeekend` 相同）；距主日历国家下一公共假（名称 + 天数）。没有下一假则只保留距周末。
4. **月历**：周一至周日；周末红字；主日历国家公共假显示节日名（过长截断）；`workdays` 调休上班日用浅橙底 +「班」。点选日期后，今日条和别国列表改为该公历日（不再用「各国当地今天」）。点「今」或再次打开弹窗时回到今天。
5. **别国休假列表**：
   - 打开弹窗且未点选其他日期：与预览站「今天」相同，按**各国当地日期**判断是否在休（`holidaysToday`）。
   - 点选月历某日：按该 ISO 日期查所有国家（`holidaysOnCalendarDate`），不含主日历国家自己。
   - 若设置了关注列表：只显示关注国家（仍排除主日历国家）。
   - 最多先画 4 行；更多则一行「还有 N 个国家」点开展开。0 条则文案「这一天没有关注国家在休假」或「这一天没有其他国家在休假」。
6. **底栏**：`数据 caldays · 仅供参考` +「设置」。免责声明与预览站一致：公开源，以官方为准。

### 设置（弹窗内展开，不另开选项页）

- `homeCountry`：ISO 国家码，默认 `CN`。决定今日上班/休假、月历标注、距下一假、角标。
- `watchCountries`：国家码数组，默认 `[]` 表示不过滤（显示当天全部别国）。
- 存在 `chrome.storage.sync`；同步不可用则退到 `local`。

## 休息日怎么算

与预览站休假区间同一套规则，主日历「今天是否休息」定义为：

- 当天是**公共假**或**周六/周日**，且不在该国 `countries[code].workdays` 里 → 休息。
- 在 `workdays` 里 → 上班（调休上班），即使那天是周末或节日。

不要用「是否落在带公共假的连休区间」作为角标/今日条的唯一依据：普通周末即使不连着节日，也算休息。

别国列表仍用现有 `holidayRow` / `holidaysToday`：只列出**当天处于公共假连休（含周末、扣调休）**的国家，不把「仅仅是普通周末、没有公共假」的国家算进去。这样弹窗不会出现近百个「周六也在休」的国家。

## 数据

- 打包 `web/data/holidays.json`（`schemaVersion`、`year`、`countries`、`byDate`、中国 `workdays` 已含 holiday-cn 补充）。
- 同时打包 `web/zh-names.js` 做中文国名。
- 不在扩展里再请求 caldays；换年或更新数据：本仓库 ingest 后重新打包扩展。
- 若用户系统年份与 `payload.year` 不同：月历与查询仍用数据包年份，顶栏旁注「数据为 {year} 年」。

## 结构

```
extension/
  manifest.json          # MV3，action.default_popup
  popup.html / popup.css / popup.js
  background.js          # 角标 + 每日 alarm
  data/holidays.json     # 构建时从 web/data 复制
  zh-names.js            # 构建时复制
  lib/holiday.js         # 从 web/app.js 抽出可在 popup 与 SW 共用的纯函数
```

预览站继续用 `web/app.js`。共用逻辑（当地日、休息日、`holidaysToday`、`monthCells`、`daysUntilWeekend`、`nextHolidayAfter`）放到 `extension/lib/holiday.js`（或构建时从 `web/app.js` 生成同一文件），预览站改为引用这份纯函数，避免两套规则。搬砖文案、布局、DOM 仍留在 `web/app.js`。

构建：`scripts` 下增加把 `web/data/holidays.json` 与 `zh-names.js` 拷进 `extension/` 的步骤；开发可 load unpacked `extension/`。

## 数据流

1. 安装/启动/每天 00:05（主日历时区不好在 alarm 里精确到当地午夜时：每小时检查一次即可）→ background 读 JSON + `homeCountry` → 算当地今天 → 设 badge。
2. 打开 popup → 读 JSON + 设置 → 渲染 A 布局。
3. 改设置 → `storage.onChanged` → background 立即重算角标。

## 错误处理

- JSON 缺失或损坏：弹窗「还没有假期数据」；角标清空。
- 未知 `homeCountry`：回退 `CN`。
- 关注列表含无效码：静默丢掉。

## 测试

沿用现有 `tests/test_web_today.js`、`tests/test_spans.py`。新增：

- 主日历休息判定：普通周末 = 休；`workdays` 当天 = 上班；公共假 = 休。
- 角标文案：休息 → `休`；周三 → `3`（距周六）。
- 别国列表：今天模式用当地日期；点选日期用日历日；过滤 `watchCountries`；不含主日历国家。

## 验收

- 本机 load unpacked，点图标出现方案 A 弹窗，无需开预览站。
- 中国调休上班日显示上班，黄金周连休在月历上可见。
- 角标在跨日或改主日历后会变。
- 无网络也能打开弹窗。
