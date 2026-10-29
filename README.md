# MXWBTools

Chrome / Edge 浏览器扩展。当前包含两个工具，各自一个目录，用「加载已解压的扩展程序」安装。

## 工具

### 砖历 `brickcal-store`

看节假日、调休、民俗节日和节气，并按上下班时间计算今天还要搬多久砖。

加载目录：`brickcal-store/extension/`。共用脚本在 `web/`，改过之后需要先同步再刷新扩展。详细说明见 [brickcal-store/README.md](brickcal-store/README.md)。

### 多关键字页面查找 `page-find`

在当前网页里同时查找多个关键字，按关键字分色高亮，并在命中之间跳转。搜索历史保存在本机扩展存储里。

加载目录：`page-find/`。这个目录本身就是扩展，不需要打包脚本。

| 操作 | 默认快捷键 |
|------|------------|
| 打开或关闭查找面板 | `Ctrl+Shift+F` |
| 下一处匹配 | `Ctrl+Shift+Down` |
| 上一处匹配 | `Ctrl+Shift+Up` |

多个关键字用空格、`|` 或逗号分隔。可以切换「匹配任一关键字」或「同一段包含全部」，也可以区分大小写、整词匹配。

## 安装

1. 打开 `chrome://extensions` 或 `edge://extensions`
2. 打开「开发者模式」
3. 「加载已解压的扩展程序」，选上表对应目录

## 打包

只有砖历需要打包。在 `brickcal-store` 目录下：

```bat
scripts\pack_extension.bat
scripts\pack_store.bat
```

- `pack_extension.bat`：把 `web` 里的共用文件复制进 `extension/`
- `pack_store.bat`：打商店 zip，输出 `brickcal-store/release/brickcal-store-日期.zip`（zip 根目录是 `manifest.json`）

预览站数据包用 `scripts\build_and_pack.bat`，输出 `release/holiday-cache.zip`。这不是扩展商店包。

## 目录

```
brickcal-store/   砖历：扩展、预览站、假期数据与打包脚本
page-find/        多关键字页面查找
```
