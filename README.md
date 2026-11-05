# sdadz-herdr-mod

个人使用的 [Herdr](https://herdr.dev) 第三方 mod 远端备份。代码来自各 mod
的上游项目，加上本人针对 Windows 中文环境和日常使用所做的本地修改。

这不是 Herdr 官方项目，也不保证与未来 Herdr 版本兼容。需要某个 mod 时，
请优先使用它的上游仓库。

## 包含的 mod

| mod                                | 上游                         | 功能                                                                   |
| ---------------------------------- | ---------------------------- | ---------------------------------------------------------------------- |
| [files-plus](mods/files-plus/)     | [linziyanleo/herdr-mods]     | 文件树面板：多根工作区、右键菜单、拖拽打开、VS Code 图标；文件交给 preview-plus 编辑 |
| [preview-plus](mods/preview-plus/) | [linziyanleo/herdr-mods]     | 文件预览与编辑：文本、Markdown、图片、PDF；UTF-8/GBK 保存、语法高亮、缩放、翻页 |
| [git-changes](mods/git-changes/)   | [aBER0724/herdr-git-changes] | Git 面板：暂存与提交、提交历史图、主区域 diff；本地改动由 watch 驱动   |
| [tabs-graph](mods/tabs-graph/)     | 无，克隆 Herdr 内置 `tabs`   | 标签栏：Files / Changes 面板开关，每个空间记住上次选择                 |

[linziyanleo/herdr-mods]: https://github.com/linziyanleo/herdr-mods
[aBER0724/herdr-git-changes]: https://github.com/aBER0724/herdr-git-changes

## 目录结构

```text
.
├── mods/
│   ├── files-plus/
│   ├── preview-plus/
│   ├── git-changes/
│   └── tabs-graph/
├── patches/            本地修改相对上游的补丁
├── scripts/mkpatch.py  从上游副本生成本地补丁
└── AGENTS.md           给 AI 助手的工作区说明
```

`gpui-kit.d.ts` 和 `jsconfig.json` 由 Herdr 生成，不入库。

## 本地修改

四个 mod 都以上游为基准，本地修改集中在：

- 整体汉化：界面文字、菜单、错误提示，只改用户可见字符串。
- Windows 中文环境：中文文件名与路径处理。
- files-plus：用 `node` 批量读取目录并预取；修复打开文件时的查重与点击
  丢失；接入 Material Icon Theme 文件图标；所有文件交给 preview-plus；
  本地目录树只在 watch 缺失时兜底刷新。
- preview-plus：删去与 files-plus 重复的文件树；GBK/GB18030 双向编辑；
  Markdown 默认源码；扩充语法映射；watch 事件去抖。
- git-changes：本地轮询改为 `watchFolder` 驱动，远程才保留 10 秒轮询。
- tabs-graph：去掉已废弃的 Git 按钮，加入 Files / Changes 面板开关。

本地修改通过 `patches/` 下的补丁记录。补丁只包含代码差异，不含图标资产
（体积大且版本固定）。补丁冲突时按 `git apply` 的提示手动合并，再用
`scripts/mkpatch.py` 重新生成，不要手改补丁。

## 安装

把 mod 复制到 Herdr 的 app home，然后跑检查：

```bash
cp -a mods/files-plus/. ~/.config/herdr-app/mods/files-plus/
herdr-app check ~/.config/herdr-app/mods/files-plus
```

Windows 的 app home 是 `C:/Users/<用户名>/.config/herdr-app`。布局按 mod
名字引用，覆盖 mod 文件后不需要改布局。

## 更新上游

临时克隆上游，覆盖 mod 目录，再应用补丁：

```bash
git clone --depth 1 https://github.com/linziyanleo/herdr-mods.git .tmp/herdr-mods
cp -a .tmp/herdr-mods/files-plus/mods/files-plus/. mods/files-plus/
(cd mods/files-plus && git apply ../../patches/files-plus-local.patch)
rm -rf .tmp
```

git-changes 的上游是
`https://github.com/aBER0724/herdr-git-changes.git`，流程相同。

## 许可与来源

- files-plus、preview-plus、tabs-graph 基于 Herdr 内置 mod（Apache-2.0）。
- git-changes 来自 aBER0724/herdr-git-changes，许可见其上游仓库。
- 文件图标来自 Material Icon Theme 5.40.0（MIT），许可见
  `mods/files-plus/LICENSE-material-icon-theme.txt`。

各 mod 的详细说明见其目录下的 `README.md`。
