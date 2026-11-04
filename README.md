# herdr-mods：Herdr 第三方 mod 仓库

Herdr 只从 app home 加载 mod，所以这里保存源码与备份，装好后复制过去。
不保留上游仓库副本；需要更新时临时 clone，用完删掉。

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

## 目录

```text
herdr-mods/
├── mods/
│   ├── files-plus/      本地修改：汉化 + Windows 中文文件名修复
│   ├── preview-plus/    本地修改：同上
│   ├── git-graph/       上游原样，未改
│   └── tabs-graph/      克隆自带 tabs，加了 Git 按钮
└── patches/
    ├── files-plus-local.patch
    └── preview-plus-local.patch
```

`gpui-kit.d.ts` 与 `jsconfig.json` 由 Herdr 生成，不入库。
`tabs-graph` 克隆的是 Herdr 自带 mod，没有独立上游，所以没有补丁。

## 更新上游

补丁基于 `linziyanleo/herdr-mods` 的 `92cef9f`（2026-11-04）。
上游变了就临时 clone，覆盖后再应用补丁：

```sh
git clone --depth 1 https://github.com/linziyanleo/herdr-mods.git .tmp/herdr-mods

cp -a .tmp/herdr-mods/files-plus/mods/files-plus/. mods/files-plus/
cp -a .tmp/herdr-mods/preview-plus/mods/preview-plus/. mods/preview-plus/

(cd mods/files-plus && git apply ../../patches/files-plus-local.patch)
(cd mods/preview-plus && git apply ../../patches/preview-plus-local.patch)

rm -rf .tmp
```

git-graph 没有本地改动，直接覆盖：

```sh
git clone --depth 1 https://github.com/rabeeh-ta/herdr-git-graph.git .tmp/git-graph
cp -a .tmp/git-graph/mods/git-graph/. mods/git-graph/
rm -rf .tmp
```

补丁冲突时按 `git apply` 的提示手动合并，然后重新生成：

```sh
git clone --depth 1 https://github.com/linziyanleo/herdr-mods.git .tmp/herdr-mods
python scripts/mkpatch.py .tmp/herdr-mods/files-plus/mods/files-plus mods/files-plus patches/files-plus-local.patch
python scripts/mkpatch.py .tmp/herdr-mods/preview-plus/mods/preview-plus mods/preview-plus patches/preview-plus-local.patch
rm -rf .tmp
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
