# Chrome / Edge 商店上架清单

仓库：https://github.com/lhp2048/brickcal  
隐私政策（提交时填这个 URL，仓库需保持公开）：  
https://github.com/lhp2048/brickcal/blob/main/privacy.md

## 已在仓库里准备好的

- 图标：`extension/icons/icon16.png` 等（重新生成：`python scripts/gen_icons.py`，需本机 Pillow + 微软雅黑）
- `manifest.json` 已声明 `icons` / `default_icon`
- 商店用 zip：运行 `scripts\pack_store.bat`，输出到 `release/`

## 你还需要手动做的

1. 注册 [Chrome 开发者](https://chrome.google.com/webstore/devconsole)（一次性约 5 美元）。Edge 另开 [Partner Center](https://partner.microsoft.com/dashboard)。
2. 截图（至少 1 张，推荐 1280×800）：弹窗主界面、月历节日、设置页。不要带个人隐私。
3. 上传 `release/brickcal-store-*.zip`（zip **根目录**必须是 `manifest.json`）。
4. 填写下面文案，并贴上隐私政策 URL。
5. 权限说明里写清 `storage`、`alarms`（见下）。

## 商店短介绍（≤132 字）

砖历：看中国调休与多国公共假，月历标民俗节日和节气。右侧工时圆环扣午休，角标提醒今天休不休。假期数据仅供参考。

## 详细介绍（可粘贴）

砖历是给「今天还要不要搬砖」准备的日历扩展。

功能：
- 主日历默认中国：法定放假、调休补班、常见民俗节日、二十四节气
- 工具栏角标：休假显示「休」，否则显示距周末天数
- 弹窗月历：点选日期、休假列表跳月、悬停查看同一天的多条节日信息
- 右侧工时：按上班/下班/午休计算已搬砖时长
- 可设置每周起始日、单击或双击切月、面板颜色

数据：
- 公共假来自 caldays.com（CC BY 4.0）
- 中国调休补充自 holiday-cn
- 仅供浏览参考，以官方通知为准

设置只保存在浏览器本地或你的浏览器账号同步中，不会上传到砖历服务器。

反馈：https://github.com/lhp2048/brickcal/issues

## 权限理由（审核表）

- storage：保存用户的主日历国家、工时与显示偏好，不用于广告或追踪。
- alarms：大约每小时刷新工具栏角标，无远程请求。

## 分类建议

- 主类：效率 / Productivity
- 语言：中文（简体）
