# files-plus

Herdr 的文件树面板：文件夹树 / 平铺列表、多根工作区、右键菜单、
拖拽打开文件、内置文本预览、VS Code 风格文件图标。克隆自 Herdr 自带的
`files` 面板（0.1.9）。

## 本地修改

- **VS Code 风格图标**（`tree.js` 的 `iconFile()`、`icons.js`、`icons/`）：
  图标表取自 `amster93/herdr-file-icons` 的 Material Icon Theme 5.40.0
  （MIT，见 `LICENSE-material-icon-theme.txt`），按 VS Code 的规则匹配：
  路径规则 → 文件名 → 最长扩展名；文件夹按名称匹配，展开时用 open 变体，
  浅色主题优先用浅色变体。原来固定的 `file.svg` / `folder.svg` 不再使用。
- **HTML 用浏览器打开**：文件树右键菜单新增「用浏览器打开」，只对本地
  `.html` / `.htm` 文件显示，交给系统默认浏览器（Windows 用
  `explorer.exe`，走 `.html` 文件关联）。
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
- **所有文件交给 preview-plus**（`workspace.js` 的 `openFile`）：去掉原来的
  `RICH` 扩展名限制，`.c`、`.py`、`.json` 等也进 preview-plus 编辑，不再落
  只读的内置预览。
- **降低后台刷新**：本地目录树的兜底刷新改为 5 分钟，且只在某个根目录没有
  watch 时才执行；内置只读预览改由 `watchFolder` 驱动，不再每 10 秒重读。
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

装 preview-plus 时，所有文件都交给它打开，不再按扩展名分流；文本类文件
可以直接编辑保存（详见 preview-plus 的说明）。

内置预览（`role: "preview"` 标签，`EditorState` 固定 `readonly: true`）
只在两种情况下兜底：

- 没有安装 preview-plus；
- 打开位置设为「在右侧栏内打开」，但没有可用的配对布局。

## 上游与补丁

上游是 `linziyanleo/herdr-mods` 的 `files-plus`。
本地修改记录在 `patches/files-plus-local.patch`，按工作区的补丁流程重新生成。

## 注意

- `herdr-app check` 只验证首屏，展开、右键菜单、预览要手动点一遍。
- 目录读取依赖 PATH 里的 `node`；没有时会自动回退，速度变慢。
