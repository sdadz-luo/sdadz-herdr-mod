# preview-plus

Herdr 的文件预览面板：文本、Markdown、图片、PDF，支持编辑保存、缩放、翻页。

文件树由 files-plus 负责，本 mod 只接收它交过来的文件：
tab/分屏模式下读 `props.file`，右侧配对模式下读 `shared("preview-plus.target")`。

## 本地修改

- **汉化**：工具栏、状态提示、错误信息。
- **Windows 中文文件名修复**：`paths.js`、`media.js`、`markdown.js`。
- **去掉重复的文件树**：删除 `tree.js` 和 cwd 模式。上游在本 mod 里又实现了
  一套目录浏览（列举、git 标记、500/5000 上限、轮询刷新），与 files-plus
  完全重复，且没有预取、远程还要 10 秒轮询。现在没有 `file` 也没有
  `previewStack` 时只显示一句提示。
  注意：补丁只能表达新增和修改，不能表达删除——把补丁应用到上游副本后
  `tree.js` 会留在磁盘上，但已无任何引用。

## 上游与补丁

上游是 `linziyanleo/herdr-mods` 的 `preview-plus`。
本地修改记录在 `patches/preview-plus-local.patch`，按工作区的补丁流程重新生成。

## 编辑范围

- 本地文本文件可编辑，`Ctrl+S` 保存；保存带 `expected` 内容比对，磁盘被外部
  改动时提示冲突，不会静默覆盖。未保存草稿存 localStorage，重开可恢复。
- Markdown 默认是渲染后的「预览」，要编辑得先切到「源码」。
- 以下情况只读：远程文件（`on` 不为空）、超过 40 万字符被截断的文件、
  图片与 PDF。只读时工具栏显示锁形图标，悬停有原因。
- files-plus 只把 `md/markdown/png/jpg/jpeg/webp/svg/pdf` 交给本 mod，
  其余文本（`.js`、`.json`、`.txt` 等）走 files-plus 自己的只读预览，
  在这里没有编辑入口。

## 依赖

- 图片预览在 Windows/Linux 走 `python -c`，需要 PATH 里有 Python 3（无第三方包）。
- PDF 预览只在 macOS 可用（PDFKit）。
- 远程文件只能纯文本预览。

## 注意

- `herdr-app check` 只验证首屏，Markdown 渲染、图片缩放要手动点。
