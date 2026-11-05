import { exec, focused, panes, spaces, window, home, appHome, readTextFile, shared, setShared, run } from "herdr";
import { basename, dirname, joinPath, contains, relativePath, workspaceOf } from "./roots.js";
import { textWidth } from "./metrics.js";

export function menuLayout(items, statusText, metrics, viewport, pointer, zoom = 1) {
  const width = Math.min(Math.floor(Math.max(188, viewport ? viewport.width / zoom - 16 : 10000)), Math.ceil(Math.max(188,
    Math.max(...items.map(item => textWidth(item.label, 13, metrics) + 20), statusText ? textWidth(statusText, 12, metrics) + 16 : 0) + 10)));
  const intrinsicHeight = items.length * 30 + items.filter(item => item.group).length * 9 + 10 + (statusText ? 24 : 0);
  const height = Math.min(intrinsicHeight, viewport ? Math.max(30, viewport.height / zoom - 16) : intrinsicHeight);
  const at = viewport && pointer ? {
    x: Math.max(8 * zoom, Math.min(pointer.x, viewport.width - width * zoom - 8 * zoom)),
    y: Math.max(8 * zoom, Math.min(pointer.y, viewport.height - height * zoom - 8 * zoom))
  } : pointer;
  return { width, height, ...(at ? { at } : {}) };
}

export const CLIPBOARD = "files-plus.clipboard", REVISION = "files-plus.revision";
const windows = on => !on && window().platform === "windows";
const destination = target => target.kind === "file" ? dirname(target.path) : target.path;
async function checked(command, args, on) {
  const result = await exec(command, args, { on });
  if (result.code !== 0) throw new Error(result.stderr.trim() || result.stdout.trim() || `${command} failed`);
  return result;
}
const shell = (script, args, on) => checked("sh", ["-c", script, "files-plus", ...args], on);
const powershell = (script, args) => checked("powershell", ["-NoProfile", "-NonInteractive", "-Command", `& { ${script.replace(/^(param\([^)]*\))/, "$1 $ErrorActionPreference='Stop';")} }`, ...args], null);

export function captureTarget(space, path, kind, root, on, physicalRoot = root) {
  const f = focused();
  let active = null;
  if (f?.space === space && f.terminal) active = { pane: f.pane, terminal: f.shown || f.terminal, cwd: f.cwd };
  else if (!f || f.space === space) {
    const tab = spaces().find(s => s.id === space)?.tabs.find(t => t.active);
    const candidates = panes().filter(p => p.tab === tab?.id && p.terminal);
    const pane = candidates.find(p => p.focused) || candidates.find(p => p.program?.agent) || candidates[0];
    if (pane) active = { pane: pane.pane, terminal: pane.terminal, cwd: pane.cwd };
  }
  return { space, path, kind, root, physicalRoot, on: on ?? null, active };
}
export function ensureTarget(target) {
  if (!spaces().some(s => s.id === target.space && s.machine === target.on)) throw new Error("目标工作空间已不可用");
}
export function reference(target) {
  let cwd = target.active?.cwd;
  // Herdr reports physical terminal cwd paths; workspace roots keep their spelling.
  if (cwd && target.physicalRoot && contains(target.physicalRoot, cwd)) {
    const relative = relativePath(target.physicalRoot, cwd);
    cwd = relative === "." ? target.root : joinPath(target.root, relative);
  }
  const path = cwd && contains(target.root, cwd) && contains(cwd, target.path) ? relativePath(cwd, target.path) : target.path;
  return `@${/[\s"\\]/.test(path) ? JSON.stringify(path) : path} `;
}
export async function insertReference(target, cx) {
  ensureTarget(target);
  const active = target.active;
  if (!active?.terminal) throw new Error("此工作空间没有活动终端");
  const space = spaces().find(s => s.id === target.space), tabs = new Set(space.tabs.map(t => t.id));
  if (active.pane && !panes().some(p => p.pane === active.pane && tabs.has(p.tab) && p.terminal)) throw new Error("目标终端已不可用");
  const previous = cx.read_from_clipboard();
  // run() queues a command. Yield before reading focus or restoring clipboard text.
  run("pane.focus", { terminal: active.terminal });
  await cx.sleep(0);
  if (focused()?.terminal !== active.terminal && focused()?.shown !== active.terminal) throw new Error("无法聚焦目标终端");
  try {
    cx.write_to_clipboard(reference(target));
    run("terminal.paste");
    await cx.sleep(0);
  } finally { if (previous !== undefined) cx.write_to_clipboard(previous); }
}
export function validateName(name) {
  if (!name.trim() || name === "." || name === ".." || /[/\\\x00-\x1f\x7f]/.test(name)) throw new Error("名称不能包含路径分隔符或控制字符");
  return name;
}
export async function exists(path, on) {
  if (windows(on)) {
    const result = await powershell('param($p) if (Test-Path -LiteralPath $p) { "yes" }', [path]);
    return result.stdout.trim() === "yes";
  }
  const result = await exec("sh", ["-c", '[ -e "$1" ] || [ -L "$1" ]', "files-plus", path], { on });
  if (result.code !== 0 && result.code !== 1) throw new Error(result.stderr || "无法检查此路径");
  return result.code === 0;
}
export async function availablePath(dir, name, kind, on) {
  const dot = kind === "file" ? name.lastIndexOf(".") : -1;
  const stem = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : "";
  for (let n = 0; n < 10000; n++) {
    const candidate = n === 0 ? name : `${stem} copy${n > 1 ? ` ${n}` : ""}${ext}`;
    const path = joinPath(dir, candidate);
    if (!await exists(path, on)) return path;
  }
  throw new Error("此文件夹中没有可用的副本名称");
}
export function changed() { setShared(REVISION, (Number(shared(REVISION)) || 0) + 1); }

export async function paste(target) {
  ensureTarget(target);
  const source = shared(CLIPBOARD), dir = destination(target);
  if (!source || source.on !== target.on) throw new Error("请先在同一台机器上复制条目");
  if (source.kind !== "file") {
    if (contains(source.path, dir)) throw new Error("文件夹不能粘贴到自身或其子目录");
    // A symlink in the destination path must not bypass the directory-cycle check.
    if (!windows(target.on)) {
      const physical = await shell('cd -P "$1" && printf "%s\\0" "$PWD" && cd -P "$2" && printf "%s\\0" "$PWD"', [source.path, dir], target.on);
      const [src, dst] = physical.stdout.split("\0");
      if (contains(src, dst)) throw new Error("文件夹不能粘贴到自身或其子目录");
    }
  }
  if (!await exists(source.path, target.on)) throw new Error("复制的条目已不可用");
  const path = await availablePath(dir, basename(source.path), source.kind, target.on);
  if (windows(target.on)) {
    await powershell('param($src,$dst) if (Test-Path -LiteralPath $dst) { throw "目标已存在" }; Copy-Item -LiteralPath $src -Destination $dst -Recurse -ErrorAction Stop', [source.path, path]);
  } else await checked("cp", ["-R", "-P", "-n", source.path, path], target.on);
  changed();
  return path;
}

export async function createEntry(target, kind, name) {
  ensureTarget(target); validateName(name);
  const path = joinPath(destination(target), name);
  if (await exists(path, target.on)) throw new Error("An entry with this name already exists");
  if (windows(target.on)) {
    await powershell('param($p,$kind) if (Test-Path -LiteralPath $p) { throw "已存在同名条目" }; New-Item -Path $p -ItemType $kind -ErrorAction Stop | Out-Null', [path, kind === "file" ? "File" : "Directory"]);
  } else if (kind === "file") await shell('set -C; : > "$1"', [path], target.on);
  else await checked("mkdir", [path], target.on);
  changed();
  return path;
}

export async function renameEntry(target, name) {
  ensureTarget(target); validateName(name);
  if (target.kind === "root") throw new Error("工作区根目录不能在此重命名");
  if (name === basename(target.path)) return target.path;
  const path = joinPath(dirname(target.path), name);
  if (await exists(path, target.on)) throw new Error("An entry with this name already exists");
  if (windows(target.on)) await powershell('param($p,$name) Rename-Item -LiteralPath $p -NewName $name -ErrorAction Stop', [target.path, name]);
  else await shell('mv -n "$1" "$2" && { [ ! -e "$1" ] && [ ! -L "$1" ]; }', [target.path, path], target.on);
  changed();
  return path;
}

export async function trashEntry(target) {
  ensureTarget(target);
  if (target.kind === "root" || target.path === target.root || /^[a-z]?:?\/$/i.test(target.path)) throw new Error("工作区根目录不能在此移除");
  if (!target.on && window().platform === "macos") {
    const trash = joinPath(home(), ".Trash");
    await checked("mkdir", ["-p", trash], null);
    const path = await availablePath(trash, basename(target.path), target.kind, null);
    await shell('mv -n "$1" "$2" && { [ ! -e "$1" ] && [ ! -L "$1" ]; }', [target.path, path], null);
  } else if (windows(target.on)) await powershell('param($p) Remove-Item -LiteralPath $p -Recurse -Force -ErrorAction Stop', [target.path]);
  else await checked("rm", ["-rf", "--", target.path], target.on);
  changed();
}
export async function reveal(target) {
  ensureTarget(target);
  if (target.on !== null) throw new Error("仅本地文件可显示所在位置");
  const platform = window().platform;
  if (platform === "macos") await checked("open", ["-R", target.path], null);
  else if (platform === "windows") await checked("explorer.exe", [`/select,${target.path.replace(/\//g, "\\")}`], null);
  else await checked("xdg-open", [dirname(target.path)], null);
}
export async function openInBrowser(target) {
  ensureTarget(target);
  if (target.on !== null) throw new Error("仅本地文件可在浏览器中打开");
  if (target.kind !== "file" || !/\.html?$/i.test(target.path)) throw new Error("仅 HTML 文件可在浏览器中打开");
  const platform = window().platform;
  // explorer.exe 走文件关联启动默认浏览器；带 /select 会变成选中文件，不能用。
  const command = platform === "macos" ? "open" : platform === "windows" ? "explorer.exe" : "xdg-open";
  await checked(command, [platform === "windows" ? target.path.replace(/\//g, "\\") : target.path], null);
}
export async function installed(name) { return await readTextFile(joinPath(appHome(), `mods/${name}/mod.json`)) !== null; }
export function menuItems(target) {
  const clip = shared(CLIPBOARD), root = target.kind === "root" || target.path === target.root;
  return [
    { id: "agent", label: "插入到 agent（@）", enabled: Boolean(target.active?.terminal) },
    { id: "copy", label: "复制", enabled: true },
    { id: "paste", label: "粘贴", enabled: Boolean(clip && clip.on === target.on) },
    { id: "path", label: "复制路径", enabled: true },
    { id: "relative", label: "复制相对路径", enabled: true },
    { id: "reveal", label: window().platform === "macos" ? "在访达中显示" : window().platform === "windows" ? "在资源管理器中显示" : "在文件管理器中显示", enabled: target.on === null },
    { id: "browser", label: "用浏览器打开", enabled: target.on === null && target.kind === "file" && /\.html?$/i.test(target.path) },
    { id: "new-file", label: "新建文件…", enabled: true, group: true },
    { id: "new-folder", label: "新建文件夹…", enabled: true },
    { id: "rename", label: "重命名…", enabled: !root },
    { id: "trash", label: "删除…", enabled: !root, danger: true },
    ...(root ? [
      { id: "new-here", label: "在此打开终端", enabled: true, group: true },
      { id: "remove-root", label: "从工作区移除", enabled: (workspaceOf(target.space)?.folders.length || 0) > 1 }
    ] : [])
  ];
}
