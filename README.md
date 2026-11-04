# herdr-mods 本地修改版

上游仓库：<https://github.com/linziyanleo/herdr-mods>
基准提交：`92cef9f`（2026-11-04 克隆）

这里保存 `files-plus` 和 `preview-plus` 的本地修改版，以及相对上游的补丁。
Herdr 实际运行的是 `C:\Users\25530\.config\herdr-app\mods\` 下的副本，
两边内容保持一致。

## 目录

```text
herdr-mods/
├── upstream/        上游完整克隆，含 .git 与 tests/RECIPE
├── files-plus/      本地修改版，直接可放进 mods/
├── preview-plus/    本地修改版
└── patches/         相对上游的补丁，用于更新后重放
```

`gpui-kit.d.ts` 与 `jsconfig.json` 由 Herdr 生成，不入库。

## 本地改动

1. **Windows 中文文件名乱码**
   - `files-plus/workspace.js` 与 `preview-plus/tree.js` 的 PowerShell 列目录命令
     加入 `[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false);`。
   - 原因：中文 Windows 下 PowerShell 默认用 GBK 输出，Herdr 按 UTF-8 解码。
2. **界面汉化**
   - 菜单、右键项、对话框、设置页、按钮、空状态与错误提示。
   - 两个 mod 没有 i18n 开关，只能直接改文案。

## 更新上游后重放补丁

```sh
git -C upstream pull

# 用上游新文件覆盖本地版
cp -a upstream/files-plus/mods/files-plus/. files-plus/
cp -a upstream/preview-plus/mods/preview-plus/. preview-plus/

# 重放本地改动
(cd files-plus && git apply ../patches/files-plus-local.patch)
(cd preview-plus && git apply ../patches/preview-plus-local.patch)
```

补丁冲突时按 `git apply` 的提示手动合并，再重新生成：

```sh
git diff --no-index upstream/files-plus/mods/files-plus files-plus > patches/files-plus-local.patch
```

## 装回 Herdr

```sh
cp -a files-plus/. "C:/Users/25530/.config/herdr-app/mods/files-plus/"
cp -a preview-plus/. "C:/Users/25530/.config/herdr-app/mods/preview-plus/"
herdr-app check "C:/Users/25530/.config/herdr-app/mods/files-plus"
herdr-app check "C:/Users/25530/.config/herdr-app/mods/preview-plus"
```

布局 `layouts/main-plus.json` 按名字引用 `files-plus` 与 `preview-plus`，
覆盖 mod 文件后无需改布局。
