import { exec, panes, spaces, window, run } from "herdr";
import { resolvePath } from "./roots.js";

const viewer = mod => mod === "files-plus" || mod === "preview-plus";
const pathKey = (path, on) => {
  if (!on && window().platform === "windows") {
    const normalized = resolvePath("/", path);
    return /^[a-z]:\//i.test(normalized) ? normalized[0].toLowerCase() + normalized.slice(1) : normalized;
  }
  const parts = [];
  for (const part of path.split("/")) {
    if (part === "..") parts.pop();
    else if (part && part !== ".") parts.push(part);
  }
  return "/" + parts.join("/");
};

// `hc connect` answers one JSON-RPC request per line on stdin. Two Windows traps:
// PowerShell re-parses a JSON argument on its command line as script, and `hc` drops
// its reply when stdin closes before it writes. So the request travels as hex (nothing
// for an argument parser to break) and node keeps stdin open until the reply arrives.
const QUERY = [
  "const {spawn}=require('child_process');",
  "const req=Buffer.from(process.argv[1],'hex').toString('utf8');",
  "const p=spawn('hc',['connect'],{stdio:['pipe','pipe','ignore']});",
  "let out='';",
  // Without clearing this timer node stays alive for the full timeout after hc is done.
  "const timer=setTimeout(()=>{try{p.stdin.end()}catch{}},1500);",
  "p.stdout.setEncoding('utf8');",
  "p.stdout.on('data',c=>{out+=c;if(out.includes('\\n'))p.stdin.end();});",
  "p.stdin.on('error',()=>{});",
  "p.on('error',()=>{clearTimeout(timer);process.exit(1)});",
  "p.on('close',()=>{clearTimeout(timer);process.stdout.write(out)});",
  "p.stdin.write(req+'\\n');",
].join("");

const hex = text => {
  const bytes = [];
  for (const char of text) {
    const code = char.codePointAt(0);
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    else if (code < 0x10000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    else bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 63), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
  }
  return bytes.map(byte => byte.toString(16).padStart(2, "0")).join("");
};

/** The open spaces document, or null when the app cannot be asked. */
async function spacesDocument(request) {
  const result = window().platform === "windows"
    ? await exec("node", ["-e", QUERY, hex(request)])
    : await exec("sh", ["-c", 'printf "%s\\n" "$1" | hc connect', "files-plus", request]);
  if (result.code !== 0) return null;
  for (const line of result.stdout.split("\n")) {
    if (!line.trim()) continue;
    try {
      const reply = JSON.parse(line);
      if (reply?.id === "files-plus-open" && !reply.error && Array.isArray(reply.result?.value?.spaces)) return reply.result.value.spaces;
    } catch {}
  }
  return null;
}

export async function findOpenFile(file, on, preferredSpace) {
  if (!panes().some(pane => viewer(pane.mod))) return null;
  const request = JSON.stringify({ jsonrpc: "2.0", id: "files-plus-open", method: "doc.get", params: { name: "herdr-app", ...(on ? { on } : {}) } });
  // Asked for tidying (reuse the tab that already shows this file), never a reason to
  // refuse opening: when the app can't answer, open a new tab as usual.
  const open = await spacesDocument(request).catch(() => null);
  if (!open) return null;
  const qualify = id => on ? `${on}/${id}` : id;
  const livePanes = new Map(panes().map(pane => [pane.pane, pane]));
  const liveSpaces = spaces();
  const matches = [];
  for (const space of open) {
    const spaceId = qualify(space.id), liveSpace = liveSpaces.find(value => value.id === spaceId);
    if (!liveSpace) continue;
    for (const tab of space.tabs || []) {
      const tabId = qualify(tab.id);
      if (!liveSpace.tabs.some(value => value.id === tabId)) continue;
      const visit = node => {
        const content = node.content, target = content?.props, pane = livePanes.get(qualify(node.id));
        if (pane?.tab === tabId && pane.mod === content?.mod && viewer(content?.mod)
          && (content.mod !== "files-plus" || target?.role === "preview")
          && typeof target?.file === "string" && (target.on || null) === (on || null) && pathKey(target.file, on) === pathKey(file, on)) {
          matches.push({ space: spaceId, tab: tabId, pane: pane.pane });
        }
        for (const child of node.children || []) visit(child);
      };
      visit(tab.root);
    }
  }
  return matches.find(match => match.space === preferredSpace) || matches[0] || null;
}

export function focusOpenFile(target) {
  run("space.select", { id: target.space });
  run("tab.select", { id: target.tab });
  const zoomed = panes().find(pane => pane.tab === target.tab && pane.zoomed && pane.pane !== target.pane);
  if (zoomed) run("pane.zoom", { pane: zoomed.pane });
  run("pane.focus", { pane: target.pane });
}
