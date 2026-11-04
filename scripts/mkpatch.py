"""Generate a patch that turns an upstream mod folder into this repo's version.

Usage:
  python scripts/mkpatch.py <.tmp upstream mod folder> <mods/name> <patches/name.patch>

The patch uses a/<path> and b/<path> headers, so `git apply` works from inside
the mod folder.
"""
import difflib
import io
import os
import sys

SKIP = {"RECIPE.md", "preview.png", "gpui-kit.d.ts", "jsconfig.json"}


def files(base):
    out = set()
    for dirpath, dirnames, filenames in os.walk(base):
        dirnames[:] = [d for d in dirnames if d not in (".git", ".cache", "node_modules")]
        for name in filenames:
            if name in SKIP:
                continue
            out.add(os.path.relpath(os.path.join(dirpath, name), base).replace("\\", "/"))
    return out


def main():
    if len(sys.argv) != 4:
        print(__doc__)
        return 2
    upstream, ours, patch = sys.argv[1:4]
    up_files, our_files = files(upstream), files(ours)
    chunks = []
    for rel in sorted(up_files & our_files):
        a = io.open(os.path.join(upstream, rel), encoding="utf-8").read().splitlines(True)
        b = io.open(os.path.join(ours, rel), encoding="utf-8").read().splitlines(True)
        if a != b:
            chunks.append("".join(difflib.unified_diff(a, b, fromfile="a/" + rel, tofile="b/" + rel, n=3)))
    for rel in sorted(our_files - up_files):
        b = io.open(os.path.join(ours, rel), encoding="utf-8").read().splitlines(True)
        chunks.append("".join(difflib.unified_diff([], b, fromfile="/dev/null", tofile="b/" + rel, n=3)))
    io.open(patch, "w", encoding="utf-8", newline="\n").write("".join(chunks))
    print(f"{patch}: {len(chunks)} files changed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
