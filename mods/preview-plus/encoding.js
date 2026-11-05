import { exec, readTextFile, writeTextFile, appHome, window } from "herdr";
import { mkdir, writeFile, unlink } from "fs/promises";

// Herdr's text APIs only speak UTF-8, so a GBK file is either rejected or
// decoded with replacement characters. Python 3 ships the gbk/gb18030 codecs
// in its standard library, which keeps the fallback dependency-free.
const PYTHON_READ = String.raw`
import sys, json, pathlib
raw = pathlib.Path(sys.argv[1]).read_bytes()
if raw.startswith(b'\xef\xbb\xbf'):
    text, encoding = raw[3:].decode('utf-8'), 'utf-8-sig'
elif raw.startswith(b'\xff\xfe') or raw.startswith(b'\xfe\xff'):
    raise SystemExit('UTF-16 文件暂不支持编辑。')
else:
    try:
        text, encoding = raw.decode('utf-8'), 'utf-8'
    except UnicodeDecodeError:
        try:
            text, encoding = raw.decode('gbk'), 'gbk'
        except UnicodeDecodeError:
            text, encoding = raw.decode('gb18030'), 'gb18030'
sys.stdout.buffer.write(json.dumps({'text': text, 'encoding': encoding}, ensure_ascii=False).encode('utf-8'))
`;

// Comparing at the decoded-text level keeps the same guarantee as
// writeTextFile's `expected`: the disk must still hold what the editor opened.
const PYTHON_WRITE = String.raw`
import sys, os, pathlib
target, expected_file, new_file, encoding = sys.argv[1:5]
expected = pathlib.Path(expected_file).read_text(encoding='utf-8')
new = pathlib.Path(new_file).read_text(encoding='utf-8')
raw = pathlib.Path(target).read_bytes()
try:
    current = raw.decode(encoding)
except UnicodeDecodeError:
    sys.exit(2)
if current != expected:
    sys.exit(2)
try:
    data = new.encode(encoding)
except UnicodeEncodeError:
    sys.exit(3)
tmp = target + '.preview-plus.tmp'
try:
    pathlib.Path(tmp).write_bytes(data)
    os.chmod(tmp, os.stat(target).st_mode)
    os.replace(tmp, target)
except OSError:
    try:
        os.unlink(tmp)
    except OSError:
        pass
    raise
`;

export const UTF8 = "utf-8";

const python = () => window()?.platform === "windows" ? "python" : "python3";
const cache = () => `${appHome()}/mods/preview-plus/.cache`;

// The native reader is the fast path. Only text that it could not decode
// cleanly goes through Python — a replacement character or a BOM means the
// byte-level encoding is still in question.
export async function readDocumentText(file) {
  let native = null, nativeError = null;
  try { native = await readTextFile(file); }
  catch (error) { nativeError = error; }
  if (native === null && !nativeError) return null;
  if (native !== null && !native.includes("�") && !native.startsWith("﻿")) return { text: native, encoding: UTF8 };
  try {
    const result = await exec(python(), ["-c", PYTHON_READ, file]);
    if (result.code !== 0) throw new Error(result.stderr.trim() || "无法读取文件。");
    const value = JSON.parse(result.stdout);
    if (typeof value.text !== "string" || typeof value.encoding !== "string") throw new Error("编码探测返回了无效数据。");
    return value;
  } catch (error) {
    // Without Python the old behaviour is the least surprising fallback: the
    // native text stays visible (replacement characters included).
    if (native !== null) return { text: native, encoding: UTF8 };
    throw new Error(`无法读取此文件：${error.message || error}`);
  }
}

export async function writeDocumentText(file, text, expected, encoding) {
  if (encoding === UTF8) return writeTextFile(file, text, expected);
  const dir = cache();
  await mkdir(dir, { recursive: true });
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const expectedFile = `${dir}/save-${id}-expected.txt`, newFile = `${dir}/save-${id}-new.txt`;
  try {
    await writeFile(expectedFile, expected);
    await writeFile(newFile, text);
    const result = await exec(python(), ["-c", PYTHON_WRITE, file, expectedFile, newFile, encoding]);
    if (result.code === 2) { const error = new Error("文件已在磁盘上变化，保存已取消。"); error.code = "conflict"; throw error; }
    if (result.code === 3) { const error = new Error(`当前文件编码（${encoding.toUpperCase()}）无法表示新增的字符。`); error.code = "encoding"; throw error; }
    if (result.code !== 0) throw new Error(result.stderr.trim() || "保存失败。");
  } finally {
    await unlink(expectedFile).catch(() => {});
    await unlink(newFile).catch(() => {});
  }
}
