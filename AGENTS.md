# herdr-mods 工作区

本工作区是 **Herdr 第三方 mod 的源码与备份仓库**，不是 Herdr 的运行目录。
Herdr 只从 app home 加载 mod，因此这里的改动必须复制过去才会生效。

## 两个位置

| 用途 | 路径 |
| --- | --- |
| 运行位置（Herdr 唯一加载处） | `C:\Users\25530\.config\herdr-app\mods\<name>\` |
| 保存位置（唯一事实源） | `D:\project\herdr-mods\mods\<name>\` |

**改 mod 先改本仓库，再复制到 app home**。反方向只在临时排障时使用，
解决后要同步回仓库。

布局文件（`layouts/*.json`）只存在于 app home，不在本仓库。
布局按 mod 名字引用，覆盖 mod 文件后不需要改布局。

## 目录

```text
herdr-mods/
├── mods/
│   ├── files-plus/      本地修改：汉化 + Windows 中文文件名修复
│   ├── preview-plus/    本地修改：同上
│   ├── git-changes/     本地修改：整体汉化
│   └── tabs-graph/      克隆自带 tabs，加 Files/Changes 按钮
├── patches/             本地修改相对上游的补丁
├── scripts/mkpatch.py   从上游副本生成本地补丁
└── AGENTS.md
```

`gpui-kit.d.ts`、`jsconfig.json` 由 Herdr 生成，`.tmp/` 是临时克隆，
三者都不入库（见 `.gitignore`）。

## 已装 mod 与状态

| mod | 上游 | 状态 |
| --- | --- | --- |
| files-plus | `linziyanleo/herdr-mods` | 本地汉化，有补丁 |
| preview-plus | `linziyanleo/herdr-mods` | 本地汉化，有补丁 |
| git-changes | `aBER0724/herdr-git-changes` | 本地汉化，有补丁 |
| tabs-graph | 无（克隆 Herdr 自带 `tabs`） | 本地修改，无补丁 |

已被替代并删除：`git-graph`（提交图面板），其功能由 git-changes 的
History 页覆盖。git-changes 的 `lanes.js` 虽源自 git-graph，但已自带，
不依赖 git-graph 安装。

## 安装或更新一个 mod

1. 临时克隆上游到 `.tmp/`，只读它要装的 `mods/<name>/` 目录。
2. 覆盖到本仓库 `mods/<name>/`。
3. 有本地修改的，重新应用或重新生成补丁（见下）。
4. 复制到 app home：
   `cp -a mods/<name>/. "C:/Users/25530/.config/herdr-app/mods/<name>/"`
5. 跑 `herdr-app check "C:/Users/25530/.config/herdr-app/mods/<name>"`。
6. 删除 `.tmp/`，提交本仓库。

没有 `herdr-app check` 通过，不得视为装好。check 只验证首次渲染，
涉及行、菜单和异步状态的问题还要在 app 里实际点一遍。

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

## 汉化约定

只改**用户可见字符串**，不改 git 参数、状态字母、键名、shared key、
localStorage key、类名和函数名。术语统一：

- 更改、历史、暂存、取消暂存、提交、修补、签名
- 贮藏（stash）、拉取、推送、获取、发布
- 已跟踪、未跟踪、冲突、丢弃

git 自身的原始输出、分支名、路径、哈希保持原样。
汉化后必须重新运行 `herdr-app check` 并截图确认。

## 验证

```sh
herdr-app check "C:/Users/25530/.config/herdr-app/mods/<name>"
herdr-app status        # errors 为空；layout 应为 main-plus
herdr-app shot out.png  # 检查版面、文字截断、对比度
```

## 提交约定

按全局 `git-conventions` skill：`feat` / `fix` / `refactor` / `docs` /
`style` / `chore` 前缀，提交信息与 PR 描述不得出现 AI 署名。
未经用户要求不要提交或推送。
