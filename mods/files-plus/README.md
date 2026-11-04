# files-plus

Herdr 的文件树面板：文件夹树 / 平铺列表、多根工作区、右键菜单、
拖拽打开文件、内置文本预览。克隆自 Herdr 自带的 `files` 面板（0.1.9）。

## 本地修改

- **汉化**：界面文字、菜单、错误提示。
- **Windows 中文文件名修复**：`roots.js` 里的路径归一化处理。
- **目录读取重构**（`workspace.js`）：
  - 本地 Windows 用 `node -e` 一次读取目标目录和最多 8 个子目录，
    约 70ms（原 PowerShell 实现每次约 350ms）。
  - 结果缓存 10 秒；展开命中缓存时直接渲染，不再起进程。
  - 展开后后台预取下一层；同一目录的并发请求共用一次读取。
  - node 不可用或读取失败时回退 PowerShell 单目录读取；远端机器仍用
    `sh` 并轮询，不走缓存。
  - 路径始终作为 `node` 的独立参数传入，不拼进命令字符串。

## 上游与补丁

上游是 `linziyanleo/herdr-mods` 的 `files-plus`。
本地修改记录在 `patches/files-plus-local.patch`，按工作区的补丁流程重新生成。

## 注意

- `herdr-app check` 只验证首屏，展开、右键菜单、预览要手动点一遍。
- 目录读取依赖 PATH 里的 `node`；没有时会自动回退，速度变慢。
