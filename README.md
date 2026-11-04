# herdr-mods：Herdr 第三方 mod 仓库

Herdr 只从 app home 加载 mod，所以这里保存源码与备份，装好后复制过去。

## 两个位置

| 用途 | 路径 |
| --- | --- |
| 运行位置（Herdr 唯一加载处） | `C:\Users\25530\.config\herdr-app\mods\<name>\` |
| 保存位置（唯一事实源） | `D:\project\herdr-mods\mods\<name>\` |

以后装新 mod 的固定流程：

1. 把 mod 文件夹放进 `mods\<name>\`。
2. 复制到 app home 的 `mods\<name>\`。
3. 跑 `herdr-app check`。
4. 在这里提交一次。

仓库里的 `mods\<name>\` 与 app home 的内容保持一致；升级上游时先改这里，再复制过去。

## 目录

```text
herdr-mods/
├── mods/
│   ├── files-plus/      本地修改：汉化 + Windows 中文文件名修复
│   ├── preview-plus/    本地修改：同上
│   ├── git-graph/       上游原样，未改
│   └── tabs-graph/      克隆自带 tabs，加了 Git 按钮
├── upstream/
│   ├── linziyanleo-herdr-mods/     files-plus、preview-plus 的上游
│   └── rabeeh-ta-herdr-git-graph/  git-graph 的上游
└── patches/
    ├── files-plus-local.patch
    └── preview-plus-local.patch
```

`gpui-kit.d.ts` 与 `jsconfig.json` 由 Herdr 生成，不入库。
`tabs-graph` 克隆的是 Herdr 自带 mod，没有独立上游，所以没有补丁。

## 更新上游

```sh
git -C upstream/linziyanleo-herdr-mods pull

# 用上游新文件覆盖本地版
cp -a upstream/linziyanleo-herdr-mods/files-plus/mods/files-plus/. mods/files-plus/
cp -a upstream/linziyanleo-herdr-mods/preview-plus/mods/preview-plus/. mods/preview-plus/

# 重放本地改动
(cd mods/files-plus && git apply ../../patches/files-plus-local.patch)
(cd mods/preview-plus && git apply ../../patches/preview-plus-local.patch)
```

git-graph 没有本地改动，直接覆盖：

```sh
git -C upstream/rabeeh-ta-herdr-git-graph pull
cp -a upstream/rabeeh-ta-herdr-git-graph/mods/git-graph/. mods/git-graph/
```

补丁冲突时手动合并，然后重新生成：

```sh
git diff --no-index upstream/linziyanleo-herdr-mods/files-plus/mods/files-plus mods/files-plus > patches/files-plus-local.patch
```

## 复制到 Herdr

```sh
cp -a mods/files-plus/.   "C:/Users/25530/.config/herdr-app/mods/files-plus/"
cp -a mods/preview-plus/. "C:/Users/25530/.config/herdr-app/mods/preview-plus/"
cp -a mods/git-graph/.    "C:/Users/25530/.config/herdr-app/mods/git-graph/"
cp -a mods/tabs-graph/.   "C:/Users/25530/.config/herdr-app/mods/tabs-graph/"

herdr-app check "C:/Users/25530/.config/herdr-app/mods/files-plus"
herdr-app check "C:/Users/25530/.config/herdr-app/mods/preview-plus"
herdr-app check "C:/Users/25530/.config/herdr-app/mods/git-graph"
herdr-app check "C:/Users/25530/.config/herdr-app/mods/tabs-graph"
```

布局 `layouts/main-plus.json` 按名字引用这些 mod，覆盖文件后不用改布局。

## 可选：用 junction 省掉复制

如果不想每次复制，可以把 app home 的 mod 目录做成指向仓库的 junction：

```powershell
cmd /c rmdir "$env:USERPROFILE\.config\herdr-app\mods\files-plus"
New-Item -ItemType Junction -Path "$env:USERPROFILE\.config\herdr-app\mods\files-plus" -Target "D:\project\herdr-mods\mods\files-plus"
```

代价是仓库目录必须一直在 D 盘，删掉仓库 Herdr 也会失去这个 mod。
