# herdr-mods 工作区

本仓库保存 Herdr 第三方 mod 的源码与本地修改。Herdr 只从 app home 加载
mod，所以这里的改动必须复制过去才会生效。面向使用者的安装、布局接线、
兼容性和许可见 `README.md`；本文件是改代码、验证和提交时的工作规范。

## 文档分工

- `README.md`：公开入口。安装、布局、更新、限制；用户可见行为变化后同步更新。
- `mods/<name>/README.md`：该 mod 的功能、本地修改、注意事项。
- `CLAUDE.md`：本文件。仓库流程、已知坑和提交约定，不重复使用说明。

## 两个位置

| 用途 | 路径 |
| --- | --- |
| 运行位置（Herdr 唯一加载处） | `~/.config/herdr-app/mods/<name>/` |
| 保存位置（唯一事实源） | 本仓库 `mods/<name>/` |

`HERDR_APP_HOME` 可覆盖 app home。**改 mod 先改本仓库，再复制到 app home**；
反方向只用于临时排障，解决后同步回仓库。

布局只存在于 app home 的 `layouts/`；本仓库 `examples/main-plus.json` 是
可复制的示例模板。布局按 mod 名字引用，覆盖 mod 文件后不需要改布局。

## 目录

```text
herdr-mods/
├── mods/<name>/         各 mod 源码，功能与本地修改见其中的 README.md
├── patches/             本地修改相对上游的补丁
├── scripts/mkpatch.py   从上游副本生成本地补丁
├── scripts/install.sh   安装到 app home 并逐个 check
├── examples/            示例布局模板
├── LICENSES/            第三方许可正文
├── LICENSE             本仓库原创修改的 MIT 许可
├── THIRD_PARTY.md       来源与第三方许可
├── README.md            公开使用说明
└── CLAUDE.md            本文件
```

`gpui-kit.d.ts`、`jsconfig.json` 由 Herdr 生成；`.tmp/` 放临时克隆和验证；
三者都不入库（见 `.gitignore`）。

## 已收录 mod

| mod | 上游 | 说明 |
| --- | --- | --- |
| files-plus | `linziyanleo/herdr-mods` | `mods/files-plus/README.md` |
| preview-plus | `linziyanleo/herdr-mods` | `mods/preview-plus/README.md` |
| git-changes | `aBER0724/herdr-git-changes` | `mods/git-changes/README.md` |
| tabs-graph | 无（克隆 Herdr 自带 `tabs`） | `mods/tabs-graph/README.md` |

`git-graph` 已删除，功能并入 git-changes 的 History 页。

## 安装与更新

```sh
bash scripts/install.sh [mod ...]
```

脚本删除 app home 的同名旧目录再复制，并逐个运行 `herdr-app check`；省略
参数时装全部。手动安装时也必须先删旧目录：直接覆盖会把上游已删除的文件
留在 app home。

同步上游：

1. 临时克隆上游到 `.tmp/`，只读它要装的 `mods/<name>/` 目录。
2. 覆盖到本仓库 `mods/<name>/`。
3. 重新应用或重新生成补丁（见下）。
4. 运行 `bash scripts/install.sh <name>`。
5. `herdr-app check` 通过后才算装好。
6. 删除 `.tmp/`，提交本仓库。

`check` 只验证首次渲染和首屏元素；行、菜单、拖放、异步状态还要在 app 里
实际点一遍。

## 补丁

补丁记录“上游原版 → 本地修改”的差异。生成方式：

```sh
python scripts/mkpatch.py <上游 mod 目录> mods/<name> patches/<name>-local.patch
```

应用方式：

```sh
(cd mods/<name> && git apply ../../patches/<name>-local.patch)
```

补丁冲突时手动合并，再用同一脚本重新生成，不要手改补丁。

没有上游副本时，可以用 HEAD 和已提交的旧补丁反推上游：

```sh
mkdir -p .tmp/upstream
git archive HEAD mods/<name> | tar -x -C .tmp/upstream --strip-components=2
git show HEAD:patches/<name>-local.patch > .tmp/old.patch
(cd .tmp/upstream && git apply -R ../../.tmp/old.patch)
python scripts/mkpatch.py .tmp/upstream mods/<name> patches/<name>-local.patch
```

生成后做一次正向验证，确保补丁能还原工作区：

```sh
cp -a .tmp/upstream .tmp/verify
(cd .tmp/verify && git apply ../../patches/<name>-local.patch)
for f in $(grep '^--- a/' patches/<name>-local.patch | sed 's|^--- a/||'); do
  if [ -e "mods/<name>/$f" ]; then
    cmp -s ".tmp/verify/$f" "mods/<name>/$f" || echo "DIFF: $f"
  else
    [ ! -e ".tmp/verify/$f" ] || echo "DIFF: $f"
  fi
done
rm -rf .tmp/upstream .tmp/verify .tmp/old.patch
```

## 验证

```sh
herdr-app check "$HOME/.config/herdr-app/mods/<name>"
herdr-app status        # errors 里不应有本仓库 mod 的错误
herdr-app shot out.png  # 检查版面、文字截断、对比度
```

`herdr-app status` 的 errors 可能含与 mod 无关的机器连接错误，按 layout 名
和错误内容判断。`check` 通过不等于可用：展开、右键菜单、拖放、异步刷新
必须手动验证。

## 改动规范

### 汉化

只改**用户可见字符串**，不改 git 参数、状态字母、键名、shared key、
localStorage key、类名和函数名。术语统一：

- 更改、历史、暂存、取消暂存、提交、修补、签名
- 贮藏（stash）、拉取、推送、获取、发布
- 已跟踪、未跟踪、冲突、丢弃

git 自身的原始输出、分支名、路径、哈希保持原样。汉化后必须重新运行
`herdr-app check` 并截图确认。

### 跨 mod 已知坑

- PowerShell 的 `-Command` 会把尾部参数重新当脚本解析：含空格、引号或
  花括号的路径会被截断。新增 PowerShell 调用必须用 `actions.js` 的
  `psQuote()` 把参数嵌入脚本，不要把参数跟在 `-Command` 后面。
- 异步任务要挂在生命周期足够长的视图的 `AsyncContext` 上（例如
  `FilesPanel.async`）。挂在行或单元格视图上的任务会随视图回收而中断，
  可能留下半截文件。
- Herdr 的 `watchFolder` 在 mod 热重载后可能静默失效，而 `watches` 里仍有
  记录：不能把它当作唯一刷新来源，要保留定时兜底。
- Windows 路径混用 `\` 与 `/`：比较和查表前用 `roots.js` 的 `pathKey()`
  归一，否则同一个目录会有多种写法。
- 新增或修改 mod 时，目录名必须与 mod 名一致：资源路径写死为
  `mods/<name>/...`；要改名用 `herdr-app do mod.clone`。
- 依赖外部命令时写清回退路径（node → PowerShell；Python 不可用时降级到什么）。

### 公开仓库注意

- 文档、代码和提交里不写个人绝对路径、用户名、令牌；命令用 `~`、
  `$HERDR_APP_HOME` 和相对路径。
- 截图、日志、示例布局不得包含个人项目路径或终端内容。
- 新增上游代码或资源时，同步更新 `THIRD_PARTY.md`、`LICENSES/` 和根
  `README.md` 的「与上游的差异」。
- 不把 app home 的 `shared.json`、`data/` 等运行状态拷进仓库；示例布局放
  `examples/`，复制前确认不含个人信息。

## 提交约定

按全局 `git-conventions` skill：`feat` / `fix` / `refactor` / `docs` /
`style` / `chore` 前缀，提交信息与 PR 描述不得出现 AI 署名。
未经用户要求不要提交或推送。
