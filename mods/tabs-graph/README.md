# tabs-graph

Herdr 标签栏的本地克隆（源自内置 `tabs` 0.1.12），在右侧按钮区保留
文件（Files）/ 更改（Changes）两个面板开关，点击显示或隐藏右侧面板。

## 本地修改

- 新增 Files / Changes 面板按钮；每个空间记住自己上次打开的面板。
- 移除旧的 Git 按钮：`git-graph` 已删除，提交图并入了 git-changes
  的 History 页。

在布局的标签栏块把 `content.mod` 从 `tabs` 改成 `tabs-graph` 即可
（见 `examples/main-plus.json`）。没有独立上游，所以没有补丁。
