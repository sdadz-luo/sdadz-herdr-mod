# files-plus

Herdr 的文件树面板：文件夹树 / 平铺列表、多根工作区、右键菜单、
拖拽打开文件、内置文本预览。克隆自 Herdr 自带的 `files` 面板（0.1.9）。

## 本地修改

- **汉化**：界面文字、菜单、错误提示。
- **Windows 中文文件名修复**：`roots.js` 里的路径归一化处理。
- **目录读取重构**（`workspace.js`）：
  - 本地 Windows 用 `node -e` 一次读取目标目录和最多 8 个子目录，
    约 70ms（原 PowerShell 实现每次约 350ms）。
  - 子目录列表只作为**一次性预取**：只供下一次展开使用，用完即丢。
    已展开的目录每次刷新都重新读取，不会显示陈旧内容。
  - 展开后后台预取下一层。
  - node 不可用或读取失败时回退 PowerShell 单目录读取；远端机器仍用
    `sh` 并轮询，不走预取。
  - 路径始终作为 `node` 的独立参数传入，不拼进命令字符串。
- **打开文件前查重**（`open-files.js`）：Windows 上改由 `node` 转发
  `hc connect`，请求以十六进制传参并保持 stdin 到收到回复为止。原实现用
  PowerShell 管道，PowerShell 会把命令行上的 JSON 当脚本重新解析，且 `hc`
  在 stdin 提前关闭时会丢掉回复，于是每次点第二个文件都报“无法检查已打开的
  文件”。查重失败时按“没打开过”处理，直接开新标签，不再挡住打开动作。
- **点击不再被焦点变化吞掉**（`workspace.js` 的 `openFile`）：原来打开完会用
  面板的 location key 校验，而这个 key 随焦点变化——第一个文件打开后焦点移到
  新标签，第二次点击就被判为“上下文已变”而静默丢弃。现在只在新的一次点击或
  面板销毁时取消，打开动作只用点击当时记下的空间和目标。

## 预览与编辑范围

打开文件时按扩展名分流：

- `md`、`markdown`、`png`、`jpg`、`jpeg`、`webp`、`svg`、`pdf`（`workspace.js`
  的 `RICH`）→ 装了 preview-plus 就交给它，能编辑（详见 preview-plus 的说明）。
- 其余文件 → 本 mod 自带的内置预览（`role: "preview"` 标签），
  `EditorState` 固定 `readonly: true`，**只能看不能改**。这是上游设计，
  不是汉化造成的。

## 上游与补丁

上游是 `linziyanleo/herdr-mods` 的 `files-plus`。
本地修改记录在 `patches/files-plus-local.patch`，按工作区的补丁流程重新生成。

## 注意

- `herdr-app check` 只验证首屏，展开、右键菜单、预览要手动点一遍。
- 目录读取依赖 PATH 里的 `node`；没有时会自动回退，速度变慢。
