# preview-plus

Herdr 的文件预览面板：文本、Markdown、图片等，支持编辑保存、缩放、
分页；与 files-plus 配对使用（`previewStack`）。

## 本地修改

- **汉化**：工具栏、状态提示、错误信息。
- **Windows 中文文件名修复**：`paths.js`、`tree.js`、`media.js`。

## 上游与补丁

上游是 `linziyanleo/herdr-mods` 的 `preview-plus`。
本地修改记录在 `patches/preview-plus-local.patch`，按工作区的补丁流程
重新生成。

## 注意

- 编辑保存只写本地文件；远程文件只读。
- `herdr-app check` 只验证首屏，Markdown 渲染、图片缩放要手动点。
