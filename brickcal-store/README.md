# 砖历

<p align="left">
  <img src="extension/icons/icon128.png" width="72" height="72" alt="砖历" />
</p>

浏览器日历扩展：看节假日、调休、民俗节日和节气，顺带算今天还要搬多久砖。

假期数据仅供浏览参考，以各国官方通知为准。

## 功能

- 主日历默认中国：法定放假、调休补班、常见民俗节日、二十四节气
- 工具栏角标：休假显示「休」，否则显示距周末天数
- 弹窗月历：点选日期、休假列表跳月；同一天多条信息可悬停查看
- 右侧工时：按上班 / 下班 / 午休计算已搬砖时长
- 可设置每周起始日、单击或双击切月、面板颜色

## 安装（开发者加载）

1. Chrome / Edge 打开扩展管理页，打开「开发者模式」
2. 「加载已解压的扩展程序」，选本仓库的 `extension/` 目录
3. 改完逻辑后若动过 `web/holiday.js` 等共用文件，先跑 `scripts\pack_extension.bat`，再刷新扩展

商店打包：`scripts\pack_store.bat`（输出 `release/brickcal-store-日期.zip`）。上架步骤见 [STORE.md](STORE.md)。

## 本地预览站

需要 Python 3.12+。Windows 下：

```bat
scripts\dev.bat
```

- 预览：http://127.0.0.1:18029/
- 维护台：http://127.0.0.1:18029/admin

无数据时先跑 `scripts\ingest.bat` 拉取假期。

## 数据

| 内容 | 来源 |
|------|------|
| 多国公共假 | [caldays.com](https://caldays.com)（CC BY 4.0） |
| 中国调休 | [holiday-cn](https://github.com/NateScarlet/holiday-cn) |
| 节气 / 民俗日 | 扩展内本地计算，不请求网络 |

设置只存在浏览器 `storage`（优先同步），**没有**砖历自己的账号或上报接口。隐私说明见 [privacy.md](privacy.md)。

## 目录

```
extension/   浏览器扩展（加载这个目录）
web/         预览站与共用脚本、假期 JSON
src/         拉取与缓存假期数据
admin/       维护台
scripts/     开发 / 打包 / 拉数
```

## 脚本

| 脚本 | 作用 |
|------|------|
| `scripts\dev.bat` | 安装依赖、同步扩展资源、启动预览服务 |
| `scripts\run.bat` | 不构建，只启动服务 |
| `scripts\ingest.bat` | 拉取假期数据 |
| `scripts\pack_extension.bat` | 把 `web` 共用文件复制进 `extension/` |
| `scripts\pack_store.bat` | 打商店用 zip |
| `scripts\gen_icons.py` | 重新生成扩展图标（需 Pillow + 微软雅黑） |

## 许可与反馈

假期数据版权归原作者/来源所有。Issue：[lhp2048/brickcal](https://github.com/lhp2048/brickcal/issues)
