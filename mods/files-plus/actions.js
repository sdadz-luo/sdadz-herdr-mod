import { exec, focused, panes, spaces, window, home, appHome, readTextFile, shared, setShared, run } from "herdr";
import { basename, dirname, joinPath, contains, relativePath, pathKey, workspaceOf } from "./roots.js";
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
// explorer.exe 把请求转交给已运行的 shell 后自身非 0 退出，即使文件已打开，
// 所以调用方可传 ignoreExitCode 跳过退出码检查。
async function checked(command, args, on, ignoreExitCode = false) {
  const result = await exec(command, args, { on });
  if (!ignoreExitCode && result.code !== 0) throw new Error(result.stderr.trim() || result.stdout.trim() || `${command} failed`);
  return result;
}
const shell = (script, args, on) => checked("sh", ["-c", script, "files-plus", ...args], on);
// PowerShell 的 -Command 会把尾部参数重新当脚本解析：含空格、引号或花括号的
// 路径会被拆坏（"C:/My Docs/a.txt" 只拿到 "C:/My"）。参数一律转成单引号字符串
// 嵌进脚本，命令行上不再跟参数。
export const psQuote = value => `'${String(value).replace(/'/g, "''")}'`;
const powershell = (script, args = []) => {
  const names = (script.match(/^param\(([^)]*)\)/)?.[1] || "").split(",").map(name => name.trim()).filter(Boolean);
  const bindings = names.map((name, index) => `${name} = ${psQuote(args[index] ?? "")};`).join(" ");
  const body = `$ErrorActionPreference='Stop'; ${bindings} ${script.replace(/^param\([^)]*\)\s*/, "")}`;
  return checked("powershell", ["-NoProfile", "-NonInteractive", "-Command", `& { ${body} }`], null);
};

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

// 外部拖入可能一次来很多文件，逐项开进程检查和改名在 Windows 上太慢，
// 整批交给一次 PowerShell。任务 JSON 同样嵌进脚本，由 psQuote 负责转义。
const dropCopyScript = job => [
  "param()",
  // 结果里可能有中文路径，和 directory() 一样显式用 UTF-8 输出。
  "[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false);",
  `$job = ConvertFrom-Json ${psQuote(JSON.stringify(job))}; $dest = $job.dir; $seps = [char[]]@([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar);`,
  "if (-not (Test-Path -LiteralPath $dest -PathType Container)) { throw '目标文件夹已不可用' }",
  "$fullDest = [IO.Path]::GetFullPath($dest).TrimEnd($seps);",
  "foreach ($src in $job.paths) {",
  "  try {",
  "    if (-not (Test-Path -LiteralPath $src)) { throw '源路径已不可用' }",
  "    $isDir = Test-Path -LiteralPath $src -PathType Container; $fullSrc = [IO.Path]::GetFullPath($src).TrimEnd($seps);",
  // Split-Path 的 -LiteralPath 与 -Parent 不属同一参数集（5.1 会报错），这里用 .NET 方法。
  "    $parent = [IO.Path]::GetDirectoryName($fullSrc);",
  "    if ($parent -ieq $fullDest) { throw '已在目标文件夹中' }",
  "    $prefix = $fullSrc + [IO.Path]::DirectorySeparatorChar;",
  "    if ($isDir -and ($fullDest + [IO.Path]::DirectorySeparatorChar).StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw '不能复制到自身或其子目录' }",
  "    $leaf = [IO.Path]::GetFileName($fullSrc); if (-not $leaf) { throw '源路径已不可用' }",
  "    $dot = if ($isDir) { -1 } else { $leaf.LastIndexOf('.') };",
  "    $stem = if ($dot -gt 0) { $leaf.Substring(0, $dot) } else { $leaf }; $ext = if ($dot -gt 0) { $leaf.Substring($dot) } else { '' };",
  "    $target = Join-Path $dest $leaf;",
  "    for ($n = 1; Test-Path -LiteralPath $target; $n++) { $target = Join-Path $dest ($stem + $(if ($n -eq 1) { ' copy' } else { \" copy $n\" }) + $ext) }",
  "    Copy-Item -LiteralPath $src -Destination $target -Recurse -ErrorAction Stop;",
  "    ConvertTo-Json -Compress -InputObject ([pscustomobject]@{ ok = $true; from = $src; to = $target });",
  "  } catch { ConvertTo-Json -Compress -InputObject ([pscustomobject]@{ ok = $false; from = $src; error = [string]$_.Exception.Message }) }",
  "}",
].join("\n");
const dropRecords = text => text.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => JSON.parse(line));
// 拖入只复制、不移动：on_drop 不提供修饰键，源文件必须原样保留。
// 远程根暂不支持——拖入的是本机路径，远程写入需要另一条传输通道。
export async function copyDropped(paths, dir, on) {
  if (on !== null) throw new Error("暂不支持拖入远程工作区");
  const sources = [], failed = [];
  for (const path of Array.isArray(paths) ? paths : []) {
    if (typeof path === "string" && path && !/[\x00-\x1f\x7f]/.test(path)) { if (!sources.includes(path)) sources.push(path); }
    else failed.push({ from: String(path), error: "路径无效" });
  }
  if (!sources.length) return { copied: [], failed };
  if (windows(on)) {
    const result = await powershell(dropCopyScript({ dir, paths: sources }), []), records = dropRecords(result.stdout);
    return {
      copied: records.filter(record => record.ok).map(record => record.to),
      failed: [...failed, ...records.filter(record => !record.ok).map(record => ({ from: record.from, error: record.error }))]
    };
  }
  const copied = [];
  for (const source of sources) {
    try {
      const probe = await exec("sh", ["-c", 'if [ -d "$1" ]; then echo d; elif [ -e "$1" ] || [ -L "$1" ]; then echo f; fi', "files-plus", source], { on });
      const kind = probe.stdout.trim() === "d" ? "dir" : probe.stdout.trim() === "f" ? "file" : null;
      if (!kind) throw new Error("源路径已不可用");
      if (pathKey(dirname(source)) === pathKey(dir)) throw new Error("已在目标文件夹中");
      if (kind === "dir" && (pathKey(dir) === pathKey(source) || pathKey(dir).startsWith(pathKey(source) + "/"))) throw new Error("不能复制到自身或其子目录");
      const target = await availablePath(dir, basename(source), kind, on);
      await checked("cp", ["-R", "-P", "-n", source, target], on);
      copied.push(target);
    } catch (error) { failed.push({ from: source, error: error.message || String(error) }); }
  }
  return { copied, failed };
}

export async function createEntry(target, kind, name) {
  ensureTarget(target); validateName(name);
  const path = joinPath(destination(target), name);
  if (await exists(path, target.on)) throw new Error("已存在同名条目");
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
  if (await exists(path, target.on)) throw new Error("已存在同名条目");
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
  else if (platform === "windows") await checked("explorer.exe", [`/select,${target.path.replace(/\//g, "\\")}`], null, true);
  else await checked("xdg-open", [dirname(target.path)], null);
}
export async function openWithSystem(target) {
  ensureTarget(target);
  if (target.on !== null) throw new Error("仅本地文件可用系统应用打开");
  if (target.kind !== "file") throw new Error("仅文件可用系统应用打开");
  const platform = window().platform;
  const command = platform === "macos" ? "open" : platform === "windows" ? "explorer.exe" : "xdg-open";
  await checked(command, [platform === "windows" ? target.path.replace(/\//g, "\\") : target.path], null, platform === "windows");
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
    { id: "open", label: "打开", enabled: target.on === null && target.kind === "file" },
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
