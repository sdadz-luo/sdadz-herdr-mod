# preview-plus

Herdr 的文件预览面板：文本、Markdown、图片、PDF，支持编辑保存、缩放、翻页。

文件树由 files-plus 负责，本 mod 只接收它交过来的文件：
tab/分屏模式下读 `props.file`，右侧配对模式下读 `shared("preview-plus.target")`。

## 本地修改

- **GBK/GB18030 双向兼容**（`encoding.js`）：Herdr 的读写接口只认 UTF-8，
  这里在原生读取失败或出现替换字符时改用 Python 3 读字节、探测编码
  （UTF-8 → GBK → GB18030），保存时按原编码写回并做字节级冲突检测。
  UTF-8 文件仍走原生接口，不额外起进程。
- **Markdown 默认源码编辑**：打开 `.md` 直接进编辑器，工具栏「预览」按钮
  切换渲染视图，不再需要先点「源码」。
- **语言映射扩充**：覆盖 Herdr 内嵌语法集支持的常见扩展名；`Makefile`
  按文件名识别。语法集里没有的语言（Kotlin、Swift、Dart、PowerShell、
  Dockerfile、CMake 等）显示为纯文本。
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

- 本地 UTF-8、GBK、GB18030 文本都能编辑，`Ctrl+S` 保存。保存带内容比对，
  磁盘被外部改动时提示冲突，不会静默覆盖；未保存草稿存 localStorage，
  重开可恢复。
- 非 UTF-8 文件在工具栏显示编码标签（如 `GBK`）；保存仍按原编码写回，
  不会把项目文件改成 UTF-8。GBK 无法表示的字符会在保存时报错。
- Markdown 默认打开为源码编辑器，点工具栏「预览」查看渲染结果。
- 以下情况只读：远程文件（`on` 不为空）、超过 40 万字符被截断的文件、
  图片与 PDF、UTF-16 文件。只读时工具栏显示锁形图标，悬停有原因。
- files-plus 现在把所有文件都交给本 mod，不再只限 Markdown 和媒体。

## 依赖

- Python 3：图片预览，以及 GBK/GB18030 转码。只用标准库，无第三方包。
  找不到 Python 时 GBK 文件退化为乱码显示，UTF-8 文件不受影响。
- PDF 预览只在 macOS 可用（PDFKit）。
- 远程文件只能纯文本预览，不能保存。

## 注意

- `herdr-app check` 只验证首屏，Markdown 渲染、图片缩放要手动点。
