# git-changes

Zed 风格的 Git 面板，取代 Herdr 自带的 `changes`：

- **Changes**：按“冲突 / 已跟踪 / 未跟踪 / 贮藏”分组，复选框逐文件暂存；
  提交区有分支切换、拉取/推送/发布按钮、多行提交信息、修补与签名，
  以及 `git stash`。
- **History**：提交图，分支/标签/远程标签，分页加载。
- **主区域 diff**：点击文件、贮藏或提交，在主区域打开一个可复用的 diff
  tab，支持单栏和 `Before | After` 双栏。

## 本地修改

- **降低后台轮询**：本地仓库变动由 `watchFolder` 驱动，不再每 10 秒跑一轮
  git 命令；10 秒轮询只保留给远程空间，本地 60 秒兜底。diff 的提交视图
  不再轮询（提交内容不会变）。

整体汉化，只改用户可见字符串。术语统一：

- 更改、历史、暂存、取消暂存、提交、修补、签名
- 贮藏（stash）、拉取、推送、获取、发布
- 已跟踪、未跟踪、冲突、丢弃

git 自身的原始输出、分支名、路径、哈希保持原样。默认提交建议消息
（“更新 / 新建 / 删除 xxx”）也改成了中文。

## 接入布局

布局 `main-plus.json` 的 `panel-body` 里，`changes` 块的 `content.mod`
指向 `git-changes`。tab 栏的 Changes 按钮按这个 id 打开。

## 上游与补丁

上游是 `aBER0724/herdr-git-changes`。
本地修改记录在 `patches/git-changes-local.patch`，按工作区的补丁流程
重新生成。

## 注意

- Windows 上 `Ctrl+Enter` 提交，`Ctrl+Shift+C` 复制当前提交的完整哈希。
- 只在 Fetch / Pull / Push 时联网，其余操作只在本仓库内跑 git。
- 只支持整文件暂存；重命名显示为删除加新增。
