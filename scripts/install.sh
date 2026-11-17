#!/usr/bin/env bash
# 把本仓库的 mod 安装到 Herdr 的 app home。
# 用法：bash scripts/install.sh [mod ...]
# 省略参数时安装 mods/ 下的全部 mod；HERDR_APP_HOME 可覆盖默认目录。
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
app_home=${HERDR_APP_HOME:-$HOME/.config/herdr-app}

if [ "$#" -gt 0 ]; then
  names=("$@")
else
  names=()
  for dir in "$root"/mods/*/; do names+=("$(basename "$dir")"); done
fi

[ "${#names[@]}" -gt 0 ] || { echo "没有找到 mod" >&2; exit 1; }
mkdir -p "$app_home/mods"

for name in "${names[@]}"; do
  case "$name" in
    ""|.|..|*[!A-Za-z0-9._-]*) echo "无效的 mod 名：$name" >&2; exit 1 ;;
  esac
  source="$root/mods/$name"
  target="$app_home/mods/$name"
  [ -d "$source" ] || { echo "仓库里没有这个 mod：$name" >&2; exit 1; }
  # 先删旧目录：直接覆盖会把上游已删除的文件留在 app home。
  rm -rf -- "$target"
  mkdir -p -- "$target"
  cp -a -- "$source/." "$target/"
  if command -v herdr-app >/dev/null 2>&1; then
    herdr-app check "$target"
  else
    echo "未找到 herdr-app，跳过检查：$name" >&2
  fi
  echo "已安装 $name -> $target"
done
