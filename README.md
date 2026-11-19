# sdadz-herdr-mod

个人使用的 [Herdr](https://herdr.dev) 第三方 mod 集合：以各上游项目为基础，
针对 Windows 中文环境和日常使用做了本地修改。代码与补丁都在本仓库，可直接
安装使用。

这是个人备份仓库，不是 Herdr 官方项目，也不保证与未来 Herdr 版本兼容。
需要未经修改的版本时，请优先使用各 mod 的上游仓库。

## 包含的 mod

| mod | 作用 | 来源 | 依赖 |
| --- | --- | --- | --- |
| [files-plus](mods/files-plus/) | 文件树面板：多根工作区、右键菜单、拖入复制、拖拽插入 `@`、VS Code 图标 | herdr-mods | 建议搭配 preview-plus |
| [preview-plus](mods/preview-plus/) | 文件预览与编辑：文本、Markdown、图片、PDF，支持 UTF-8/GBK | herdr-mods | 由 files-plus 传入文件 |
| [git-changes](mods/git-changes/) | Git 面板：暂存与提交、提交历史图、主区域 diff | herdr-git-changes | 无 |
| [tabs-graph](mods/tabs-graph/) | 标签栏：文件 / 更改面板开关，每个空间记住上次选择 | 无，克隆 Herdr 内置 tabs | 无 |

各 mod 的功能、本地修改和限制见其目录下的 `README.md`。

## 环境要求

- Herdr 0.1.16（本仓库当前验证的版本）。用 `herdr-app --version` 查看。
- app home：`~/.config/herdr-app`，可用 `HERDR_APP_HOME` 覆盖。
- 可选 `node`：files-plus 用它批量预读目录；没有时自动回退 PowerShell。
- 可选 Python 3：preview-plus 用它读 GBK/GB18030 和图片；只用标准库。
- `herdr-app` 在 PATH 中，用于安装后的检查。

## 安装

### 一键安装（推荐）

```bash
git clone https://github.com/sdadz-luo/sdadz-herdr-mod.git
cd sdadz-herdr-mod
bash scripts/install.sh
```

脚本会逐个**删除 app home 里的同名旧目录**再复制（避免上游已删除的文件
残留），并对每个 mod 运行 `herdr-app check`。只装其中几个：

```bash
bash scripts/install.sh files-plus preview-plus
```

Windows 可在 Git Bash 里运行；没有 `herdr-app` 时脚本会跳过检查并提示。

### 手动安装

```bash
mkdir -p ~/.config/herdr-app/mods/files-plus
cp -a mods/files-plus/. ~/.config/herdr-app/mods/files-plus/
herdr-app check ~/.config/herdr-app/mods/files-plus
```

- **目录名必须保持 `files-plus`、`preview-plus`、`git-changes`、`tabs-graph`**：
  mod 内部用 `mods/<名字>/...` 引用自己的资源。要改名请用
  `herdr-app do mod.clone --name files-plus --as my-files`，它会改写资源路径。
- Windows PowerShell 没有 `cp -a`，用 Git Bash，或改用
  `Copy-Item -Recurse -Force`。
- 直接覆盖不会删除旧文件；升级时先删目标目录，或直接用安装脚本。

## 接入布局（必读）

Herdr 只显示布局里引用的 mod。这些 mod 使用了自定义名字，**默认布局不会
自动出现**。仓库提供了一份可直接使用的示例布局：

```bash
cp examples/main-plus.json ~/.config/herdr-app/layouts/main-plus.json
herdr-app do layout.switch --name main-plus
```

示例布局假设四个 mod 都已安装，并使用了 Herdr 内置的 `workspace-chrome`、
`spaces`、`agents`、`pane`、`workspace-status`。如果只想改自己的布局，
在要显示面板的位置把 `content.mod` 指向对应 mod：

| 位置 | `content.mod` |
| --- | --- |
| 标签栏 | `tabs-graph` |
| 右侧文件面板（stack） | `files-plus`，props 加 `"previewStack": "<stack id>"` |
| 同 stack 的预览页 | `preview-plus`，props 同上 |
| Changes 面板 | `git-changes` |

布局文件只存在于 app home 的 `layouts/`，不在本仓库；`examples/` 里只是
可复制的模板。布局按 mod 名字引用，覆盖 mod 文件后不需要改布局。

## 验证

```bash
herdr-app status   # errors 里不应有本仓库 mod 的错误
herdr-app check ~/.config/herdr-app/mods/files-plus
herdr-app shot out.png
```

`check` 只验证首次渲染和首屏元素，不覆盖展开、右键菜单、拖放和异步状态；
这些要在 app 里实际点一遍。`status` 可能同时报告无关错误（例如某台远程
机器连不上），按 layout 名判断。

## 更新

```bash
git pull
bash scripts/install.sh
```

`install.sh` 会删掉旧的 mod 目录再复制，因此上游删除的文件不会残留。
Herdr 会热重载 mod；个别情况下需要重启应用。

## 与上游的差异

四个 mod 都以上游为基准，本地修改集中在：

- 整体汉化：只改用户可见字符串，不改键名、参数和存储键。
- Windows 中文环境：中文路径归一化；`explorer.exe` 的退出码不可靠，
  「打开」不再误报失败；PowerShell 参数不再从命令行传入，含空格或引号的
  路径不会被截断。
- files-plus：`node` 批量读取目录并预取；修复打开文件时的查重与点击丢失；
  Material Icon Theme 图标；所有文件交给 preview-plus；从系统拖入即复制；
  watch 缺失时兜底刷新。
- preview-plus：删去与 files-plus 重复的文件树；GBK/GB18030 双向编辑；
  Markdown 默认源码；watch 事件去抖。
- git-changes：本地轮询改为 `watchFolder` 驱动，远程保留 10 秒轮询。
- tabs-graph：去掉已废弃的 Git 按钮，加入文件 / 更改面板开关。

本地修改通过 `patches/` 下的补丁记录，补丁只含代码差异，不含图标资产。
维护者更新上游、生成补丁的流程见 `CLAUDE.md`。

## 兼容性与已知限制

- 主要在 Windows 11 + Herdr 0.1.16 上验证；macOS/Linux 只保证代码层面
  可运行，未做完整回归。
- files-plus 的多根工作区（一个面板挂多个根目录）沿用上游的平台限制，
  Windows 上不启用：添加根目录按钮隐藏，面板始终显示单根。
- files-plus 从系统拖入文件只支持本机目录；拖到远程工作区会提示暂不支持。
- preview-plus 的 PDF 预览只在 macOS 可用；远程文件只能纯文本预览，
  不能保存。
- 这些 mod 会随 Herdr 更新而失效：Herdr 改动内置 mod 的接口后，需要按上游
  重新同步并修补丁。
- 仓库按某一时点的上游快照维护，不代表各上游的最新版本。

## 常见问题

**装完右侧没有文件面板。**

布局没有引用 mod。按上面的「接入布局」操作，或确认 `herdr-app status`
里的 layout 是 `main-plus`。

**`herdr-app check` 通过，但实际用起来报错。**

`check` 只跑首次渲染。展开目录、右键菜单、拖放、异步刷新需要在 app 里点；
具体错误看 `herdr-app status` 的 errors 或界面提示。

**面板里的文件不刷新。**

files-plus 可见时每 10 秒兜底刷新；Herdr 的 `watchFolder` 在 mod 热重载后
可能静默失效，仓库已按这种情况处理。仍不刷新时重启 Herdr。

**拖入文件没有反应。**

确认 Herdr 已重新加载 mod（必要时重启），并确认拖的是本机路径；远程根目录
暂不支持拖入。

**PowerShell 用户怎么装？**

用 Git Bash 运行安装脚本，或按「手动安装」改用 `Copy-Item -Recurse -Force`。

## 许可与来源

- 本仓库原创修改：MIT，见 [LICENSE](LICENSE)。
- Herdr 内置 mod 派生部分：Apache-2.0；git-changes 含 herdr-git-graph（MIT）
  与 Lucide（ISC，部分派生自 Feather、MIT）代码；文件图标为
  Material Icon Theme（MIT）。
- 完整的来源、许可与涉及范围见 [THIRD_PARTY.md](THIRD_PARTY.md)，许可正文
  在 `LICENSES/`。重新分发时请保留这些文件。
