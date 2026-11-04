// The panel, laid out like Zed's git panel: Changes and History tabs; a
// toolbar with View Diff, the tree/flat and one/two-column switches, and
// Stage All; the files grouped Conflicts, Tracked, Untracked, as a folder tree
// or a flat list, each with a staging checkbox, then the stashes; and at the
// bottom the branch with its remote button, the commit message, the Commit
// button and the last commit. Whatever you pick opens in the main area, in
// one diff tab per space (diff.js).
// Menus are popups of this same mod (menu.js); what's picked comes back
// through the shared "git-changes.pick" and runs here.
//
// Started as `herdr-app do mod.clone '{"name":"changes"}'` of Herdr's shipped
// Changes panel (Apache-2.0): location(), the folder watch and the context-keyed
// refresh are still its. Listens to herdr-git-graph's "git-graph.changed" so
// both panels refresh after either acts.
import { div, svg } from "gpui-kit";
import { v_flex, h_flex, TextareaState, Textarea } from "gpui-base";
import { spaces, panes, focused, exec, watchFolder, theme, settings, notify, shared, setShared, openOverlay, run, props } from "herdr";
import * as G from "./git.js";
import { icon, menuHeight } from "./menu.js";
import { showInTab, shownIn, shownSource, getLayout, setLayout } from "./diff.js";
import { History } from "./history.js";

// The focused terminal's folder, or `props.folder` when opened as a pane on one repository.
function location() {
  const fixed = props()?.folder;
  if (fixed) return { cwd: fixed, on: props()?.on ?? null };
  const space = spaces().find((s) => s.active), f = focused();
  const pane = f?.pane ? panes().find((p) => p.pane === f.pane) : null;
  // The diff tab is a mod pane with no folder: keep showing the repository it shows.
  if (pane?.mod === "git-changes") {
    const shown = shownSource(space?.id);
    if (shown) return { cwd: shown.root, on: shown.on ?? null };
  }
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { cwd: pane?.cwd || f?.cwd || space?.folder, on };
}
const key = () => JSON.stringify(location());
const itemKey = (it) => (it ? `${it.area}:${it.ref ?? it.hash ?? it.path ?? ""}` : "");
const ROW = 26;
const plain = (it) => JSON.parse(JSON.stringify(it));

export class Panel {
  init(cx) {
    this.uid = `gc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    this.entries = []; this.stashes = []; this.remotes = []; this.last = null;
    this.history = new History(); this.panelWidth = 400;
    this.branch = null;
    this.listMode = localStorage.getItem("list") === "flat" ? "flat" : "tree";
    this.folded = new Set(JSON.parse(localStorage.getItem("folded") ?? "[]"));
    this.tab = props()?.tab ?? localStorage.getItem("tab") ?? "changes";
    this.collapsed = JSON.parse(localStorage.getItem("collapsed") ?? "{}");
    this.signoff = localStorage.getItem("signoff") === "1";
    this.message = ""; this.menuActions = {};
    this.pickSeen = shared("git-changes.pick")?.at; this.seenChange = shared("git-graph.changed");
    this.handle = cx.focus_handle();
    this.editor = TextareaState.new({ placeholder: "" });
    this.editor.set_auto_grow(3, 10);
    this.editor.on("change", (_e, cx) => {
      const had = Boolean(this.message.trim());
      this.message = this.editor.value();
      if (had !== Boolean(this.message.trim())) cx.notify();
    });
    this.editor.on("submit", (e, cx) => { if (e.secondary) this.commit(cx, false); });
    this.editor.on("focus", (_e, cx) => { this.typing = true; cx.notify(); });
    this.editor.on("blur", (_e, cx) => { this.typing = false; cx.notify(); });
    this.refresh(cx);
    cx.timer.every(10000, (cx) => this.refresh(cx));
  }

  // --- reading ----------------------------------------------------------------

  watch(root, cx) {
    if (this.on || this.watched === root) return;
    this.watched = root;
    cx.spawn(async (cx) => {
      try {
        while (this.watched === root) {
          await watchFolder(root);
          if (this.watched === root) this.refresh(cx);
        }
      } catch { this.watched = null; }
    });
  }

  reset() {
    this.root = null; this.branch = null; this.entries = []; this.stashes = []; this.last = null; this.history.clear();
    this.limited = false;
  }

  refresh(cx) {
    if (this.loading || this.busy) { this.again = true; return; }
    const { cwd, on } = location(), context = key();
    if (context !== this.context) {
      this.context = context; this.reset();
      this.message = ""; this.editor.set_value(""); this.amend = false;
      this.error = null; this.note = null; this.watched = null;
    }
    if (!cwd) return;
    this.loading = true; this.again = false;
    cx.spawn(async (cx) => {
      try {
        const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on });
        if (key() !== context) return;
        if (top.code !== 0) { this.reset(); this.error = "不是 Git 仓库"; return; }
        const root = top.stdout.trim(), git = (args) => exec("git", [...G.READ, ...args], { cwd: root, on });
        const status = await git(G.STATUS);
        if (status.code !== 0) throw new Error(G.gitError(status));
        const s = G.parseStatus(status.stdout), hasHead = Boolean(s.branch.oid);
        const [stats, stash, remote, last] = await Promise.all([
          hasHead ? git(["diff", "HEAD", ...G.NUMSTAT]).then((r) => [r]) : Promise.all([git(["diff", "--cached", ...G.NUMSTAT]), git(["diff", ...G.NUMSTAT])]),
          git(G.STASHES), git(["remote"]),
          hasHead ? git(G.historyArgs({ all: false, limit: 1 })) : null]);
        if (key() !== context) return;
        // The graph is read only while it shows; switching to it reads it.
        if (this.tab === "history") await this.history.read(git, { changes: s.entries.length, head: s.branch.oid, upstream: s.branch.upstream });
        if (key() !== context) return;
        const numstat = G.parseNumstat(...stats.filter((r) => r.code === 0).map((r) => r.stdout));
        this.entries = s.entries.slice(0, G.LIMIT).map((e) => ({ ...e, area: "file", add: 0, del: 0, ...(numstat[e.path] ?? {}) }));
        this.limited = s.entries.length > G.LIMIT;
        this.root = root; this.on = on; this.branch = s.branch; this.hasHead = hasHead;
        this.stashes = stash.code === 0 ? G.parseStashes(stash.stdout).map((x) => ({ ...x, area: "stash" })) : [];
        this.remotes = remote.code === 0 ? remote.stdout.split("\n").filter(Boolean) : [];
        this.last = last?.code === 0 ? G.parseLog(last.stdout).map((c) => ({ ...c, area: "commit" }))[0] ?? null : null;
        this.error = null;
        this.watch(root, cx);
      } catch (e) { if (key() === context) this.error = String(e?.message ?? e); }
      finally {
        this.loading = false; cx.notify();
        if (this.again) this.refresh(cx);
      }
    });
  }

  // What the space's diff tab shows now, when it's this repository.
  shown() { return this.root ? shownIn(spaces().find((sp) => sp.active)?.id, this.root) : null; }
  isShown(item) { return itemKey(this.shown()) === itemKey(item); }

  // Show it in the main area: one diff tab per space, reused and renamed.
  pick(item, cx) {
    const space = spaces().find((sp) => sp.active);
    if (!space || !this.root) return;
    this.note = null;
    showInTab(space.id, item, { root: this.root, on: this.on ?? null });
    cx.notify();
  }

  setTab(tab, cx) {
    if (this.tab === tab) return;
    this.tab = tab; localStorage.setItem("tab", tab);
    this.refresh(cx); cx.notify();
  }

  // --- acting -----------------------------------------------------------------

  // Runs git commands in order, stopping at the first failure. `what` names the
  // work for the busy label and errors; remote work always toasts.
  act(cx, what, cmds, { done, remote, after } = {}) {
    if (!this.root || this.busy || this.context !== key()) return;
    const root = this.root, on = this.on, context = this.context;
    this.busy = what; this.note = null; this.armed = null;
    cx.spawn(async (cx) => {
      try {
        for (const args of cmds) {
          const r = await exec("git", args, { cwd: root, on });
          if (r.code !== 0) throw new Error(G.gitError(r));
        }
        if (key() === context) after?.();
        if (done) notify({ title: done, level: "success", timeout: 3000 });
      } catch (e) {
        const message = String(e?.message ?? e);
        if (key() === context) this.note = `${what}失败：${message}`;
        if (remote) notify({ title: `${what}失败`, body: message, level: "error" });
      } finally {
        this.busy = null;
        setShared("git-graph.changed", Date.now());
        this.refresh(cx); cx.notify();
      }
    });
    cx.notify();
  }

  fail(cx, message) { this.note = message; cx.notify(); }
  clearMessage() { this.message = ""; this.editor.set_value(""); this.amend = false; }
  mode() { return G.commitMode(this.entries); }
  suggestion() { return G.suggestMessage(this.entries); }

  commit(cx, push) {
    if (this.busy || this.loading) return;
    const message = this.message.trim() || (this.amend ? "" : this.suggestion());
    const c = G.commitArgs({ message, amend: this.amend, signoff: this.signoff, mode: this.mode() });
    if (c.error) return this.fail(cx, c.error);
    let cmds = c.cmds;
    if (push) {
      // An amended commit that was already pushed needs a lease to replace it.
      const p = G.pushArgs(this.branch ?? {}, this.remotes, { force: this.amend && Boolean(this.branch?.upstream) && this.branch.ahead === 0 });
      if (p.error) return this.fail(cx, p.error);
      cmds = [...cmds, ...p.cmds];
    }
    const label = this.amend ? "修补" : "提交";
    this.act(cx, push ? `${label}并推送` : label, cmds, { remote: push, done: push ? `已提交并推送 ${this.branch.head}` : null, after: () => this.clearMessage() });
  }

  remote(cx, type, opts = {}) {
    const b = this.branch ?? {};
    if (type === "fetch") return this.act(cx, "获取", G.fetchArgs(), { remote: true, done: "已获取" });
    if (type === "pull") {
      const p = G.pullArgs(b, opts);
      if (p.error) return this.fail(cx, p.error);
      return this.act(cx, "拉取", p.cmds, { remote: true, done: `已拉取 ${b.upstream}` });
    }
    const p = G.pushArgs(b, this.remotes, opts);
    if (p.error) return this.fail(cx, p.error);
    this.act(cx, opts.force ? "强制推送" : "推送", p.cmds, { remote: true, done: `已推送 ${b.head}${p.remote ? ` 到 ${p.remote}` : ""}` });
  }

  stash(cx, staged) {
    if (staged ? !this.entries.some((e) => e.staged !== "none") : !this.entries.length) return this.fail(cx, staged ? "没有可贮藏的暂存内容" : "没有可贮藏的更改");
    this.act(cx, "贮藏", G.stashPushArgs(this.message, { staged }), { after: () => this.clearMessage() });
  }

  uncommit(cx) {
    if (!this.last) return;
    const subject = this.last.subject;
    this.act(cx, "撤销提交", G.uncommitArgs(this.last.parents.length > 0), {
      after: () => { if (!this.message.trim()) { this.message = subject; this.editor.set_value(subject); } } });
  }

  toggleAmend(cx) {
    if (this.busy) return;
    this.amend = !this.amend;
    if (this.amend && !this.message.trim() && this.last) {
      // The whole last message, body too.
      const root = this.root, on = this.on;
      cx.spawn(async (cx) => {
        const r = await exec("git", [...G.READ, "log", "-1", "--format=%B"], { cwd: root, on });
        if (r.code === 0 && this.amend && !this.message.trim()) { this.message = r.stdout.trim(); this.editor.set_value(this.message); }
        cx.notify();
      });
    }
    cx.notify();
  }

  // The section checkbox: all staged unstages them, else stages them all.
  toggleSection(list, cx) {
    const paths = list.map((e) => e.path);
    if (!paths.length) return;
    const all = list.every((e) => e.staged === "all");
    this.act(cx, all ? "取消暂存" : "暂存", [all ? (this.hasHead ? ["restore", "--staged", "--", ...paths] : ["rm", "--cached", "-q", "-r", "--", ...paths]) : ["add", "-A", "--", ...paths]]);
  }

  setListMode(mode, cx) { this.listMode = mode; localStorage.setItem("list", mode); cx.notify(); }
  fold(key, cx) {
    if (this.folded.has(key)) this.folded.delete(key); else this.folded.add(key);
    localStorage.setItem("folded", JSON.stringify([...this.folded]));
    cx.notify();
  }

  // Inline destructive buttons ask on the button itself: the first click arms it, the second runs it.
  arm(id, cx, then) {
    if (this.armed === id) { this.armed = null; then(); return; }
    this.armed = id;
    cx.timer.after(3000, (cx) => { if (this.armed === id) { this.armed = null; cx.notify(); } });
    cx.notify();
  }

  // --- menus ------------------------------------------------------------------

  menu(items, cx, width = 250) {
    this.menuActions = {};
    const out = items.filter(Boolean).map((it, i) => {
      if (it.separator) return { separator: true };
      const id = `m${i}`;
      if (it.run) this.menuActions[id] = it.run;
      const { run: _r, ...rest } = it;
      return { ...rest, id };
    }).filter((it, i, a) => !(it.separator && (i === 0 || i === a.length - 1 || a[i - 1].separator)));
    openOverlay({ mod: "git-changes", kind: "popup", at: "pointer", width, height: menuHeight(out), props: { role: "menu", owner: this.uid, items: out } });
    cx.notify();
  }

  takePick(cx) {
    const pick = shared("git-changes.pick");
    if (!pick || pick.owner !== this.uid || pick.at === this.pickSeen) return;
    this.pickSeen = pick.at;
    const fn = this.menuActions[pick.id];
    if (fn) cx.spawn(async (cx) => { fn(cx); cx.notify(); });
  }

  fileMenu(e, cx) {
    const staged = e.staged === "all";
    this.menu([
      { label: staged ? "取消暂存" : e.conflict ? "标记已解决" : "暂存", icon: staged ? "minus" : "plus", run: (cx) => this.act(cx, staged ? "取消暂存" : "暂存", G.toggleArgs(e, this.hasHead)) },
      { label: "查看差异", icon: "diff", run: (cx) => this.pick(e, cx) },
      { separator: true },
      { label: "复制路径", icon: "copy", copy: e.path },
      { label: "复制完整路径", icon: "copy", copy: `${this.root}/${e.path}` },
      { separator: true },
      { label: e.untracked ? "删除文件" : "丢弃更改", icon: e.untracked ? "trash" : "undo", danger: true, run: (cx) => this.act(cx, "丢弃", G.discardArgs(e, this.hasHead)) },
    ], cx);
  }

  stashMenu(s, cx) {
    this.menu([
      { label: "应用", icon: "check", hint: "保留贮藏", run: (cx) => this.act(cx, "应用贮藏", G.stashArgs("apply", s.ref)) },
      { label: "弹出", icon: "fetch", hint: "应用并删除", run: (cx) => this.act(cx, "弹出贮藏", G.stashArgs("pop", s.ref)) },
      { label: "查看差异", icon: "diff", run: (cx) => this.pick(s, cx) },
      { separator: true },
      { label: "删除", icon: "trash", danger: true, run: (cx) => this.act(cx, "删除贮藏", G.stashArgs("drop", s.ref)) },
    ], cx);
  }

  commitMenu(c, cx) {
    const head = this.last && c.hash === this.last.hash, current = this.branch?.head;
    const refs = c.refs ?? [], local = refs.filter((r) => r.kind === "branch" && r.name !== current);
    const remote = refs.filter((r) => r.kind === "remote" && !refs.some((b) => b.kind === "branch" && r.name.endsWith(`/${b.name}`)));
    this.menu([
      ...local.map((r) => ({ label: `切换到 ${r.name}`, icon: "branch", run: (cx) => this.act(cx, "切换", G.checkoutArgs(r.name), { done: `已切换到 ${r.name}` }) })),
      ...remote.map((r) => ({ label: `切换到 ${r.name}`, icon: "cloud", hint: "跟踪", run: (cx) => this.act(cx, "切换", G.checkoutRemoteArgs(r.name), { done: `正在跟踪 ${r.name}` }) })),
      !head && { label: "切换到该提交", icon: "commit", hint: "分离 HEAD", run: (cx) => this.act(cx, "切换", G.detachArgs(c.hash), { done: `已切换到 ${c.short}` }) },
      { separator: true },
      { label: "查看差异", icon: "diff", run: (cx) => this.pick(c, cx) },
      { label: "复制哈希", icon: "copy", hint: "Ctrl+Shift+C", copy: c.hash },
      { label: "复制短哈希", icon: "copy", hint: c.short, copy: c.short },
      { label: "复制提交信息", icon: "copy", copy: c.subject },
      { separator: true },
      head && { label: "撤销提交", icon: "undo", hint: "保留暂存", run: (cx) => this.uncommit(cx) },
      { label: "还原提交", icon: "reset", run: (cx) => this.act(cx, "还原", G.revertArgs(c.hash), { done: `已还原 ${c.short}` }) },
    ], cx, 270);
  }

  optionsMenu(cx) {
    const any = this.entries.length > 0, tracked = this.entries.some((e) => !e.untracked), untracked = this.entries.some((e) => e.untracked);
    this.menu([
      { label: "全部暂存", icon: "plus", disabled: !any, run: (cx) => this.act(cx, "暂存", G.stageAllArgs()) },
      { label: "全部取消暂存", icon: "minus", disabled: !this.entries.some((e) => e.staged !== "none"), run: (cx) => this.act(cx, "取消暂存", G.unstageAllArgs(this.hasHead)) },
      { separator: true },
      { label: "贮藏全部", icon: "stash", disabled: !any, run: (cx) => this.stash(cx, false) },
      { label: "贮藏暂存内容", icon: "stash", disabled: !this.entries.some((e) => e.staged !== "none"), run: (cx) => this.stash(cx, true) },
      { label: "弹出最新贮藏", icon: "fetch", disabled: !this.stashes.length, run: (cx) => this.act(cx, "弹出贮藏", G.stashArgs("pop", "stash@{0}")) },
      { separator: true },
      { label: "丢弃已跟踪更改", icon: "undo", danger: true, disabled: !tracked, run: (cx) => this.act(cx, "丢弃", G.discardTrackedArgs(this.hasHead)) },
      { label: "删除未跟踪文件", icon: "trash", danger: true, disabled: !untracked, run: (cx) => this.act(cx, "删除", G.trashUntrackedArgs()) },
    ], cx);
  }

  remoteMenu(cx) {
    const b = this.branch ?? {}, has = this.remotes.length > 0, onBranch = !b.detached && Boolean(b.head);
    this.menu([
      { label: "获取", icon: "refresh", disabled: !has, run: (cx) => this.remote(cx, "fetch") },
      { label: "拉取", icon: "fetch", hint: b.behind ? `↓${b.behind}` : "", disabled: !b.upstream, run: (cx) => this.remote(cx, "pull") },
      { label: "拉取（变基）", icon: "fetch", disabled: !b.upstream, run: (cx) => this.remote(cx, "pull", { rebase: true }) },
      { separator: true },
      { label: b.upstream ? "推送" : "发布分支", icon: "push", hint: b.ahead ? `↑${b.ahead}` : "", disabled: !has || !onBranch, run: (cx) => this.remote(cx, "push") },
      { label: "强制推送（带租约）", icon: "push", danger: true, disabled: !has || !onBranch, run: (cx) => this.remote(cx, "push", { force: true }) },
    ], cx);
  }

  commitOptions(cx) {
    const remote = this.remotes.length > 0 && this.branch && !this.branch.detached;
    this.menu([
      { label: "修补上一次提交", check: Boolean(this.amend), disabled: !this.last, run: (cx) => this.toggleAmend(cx) },
      { label: "签名", check: this.signoff, run: () => { this.signoff = !this.signoff; localStorage.setItem("signoff", this.signoff ? "1" : "0"); } },
      { separator: true },
      { label: this.amend ? "修补并推送" : "提交并推送", icon: "push", disabled: !remote, run: (cx) => this.commit(cx, true) },
      { label: "贮藏全部", icon: "stash", disabled: !this.entries.length, run: (cx) => this.stash(cx, false) },
      { separator: true },
      { label: "撤销上一次提交", icon: "undo", hint: "保留更改", disabled: !this.last, run: (cx) => this.uncommit(cx) },
    ], cx);
  }

  branchMenu(cx) {
    if (!this.root) return;
    const root = this.root, on = this.on, current = this.branch?.head;
    cx.spawn(async (cx) => {
      const r = await exec("git", [...G.READ, ...G.BRANCHES], { cwd: root, on });
      const names = r.code === 0 ? r.stdout.split("\n").filter(Boolean) : [];
      this.menu([
        ...names.map((n) => ({ label: n, check: n === current, run: (cx) => n !== current && this.act(cx, "切换分支", G.checkoutArgs(n), { done: `已切换到 ${n}` }) })),
        { separator: true },
        current && { label: "复制分支名", icon: "copy", copy: current },
      ], cx, 280);
    });
  }

  // --- drawing ----------------------------------------------------------------

  iconButton(id, name, tip, onClick, t, { danger, disabled, label, active, size = 22 } = {}) {
    const armed = this.armed === id;
    return h_flex().id(id).h(size).min_w(size).px(label || armed ? 6 : 4).gap(4).flex_none().items_center().justify_center().rounded(5)
      .text_color(disabled ? t.dim : armed || danger ? t.ansi1 : t.muted).text_size(12).tooltip(tip)
      .when(armed, (e) => e.bg(t.ansi1 + "22")).when(Boolean(active) && !disabled, (e) => e.bg(t.selected).text_color(t.accent))
      .when(!disabled, (e) => e.cursor_pointer().hover((s) => s.bg(t.hover).text_color(danger || armed ? t.ansi1 : t.foreground)))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => { cx.stop_propagation(); if (!disabled) onClick(cx); })
      .child(svg(icon(name)).size(13).flex_none())
      .when(Boolean(label || armed), (e) => e.child(armed ? "确定？" : label));
  }

  // Connected icon toggles: one cell per choice, the chosen one highlighted.
  pills(id, choices, value, onPick, t) {
    return h_flex().p(2).gap(2).flex_none().rounded(7).border_1().border_color(t.border).children(choices.map(([v, name, tip]) =>
      h_flex().id(`${id}-${v}`).size(20).items_center().justify_center().rounded(5).cursor_pointer().tooltip(tip)
        .text_color(value === v ? t.accent : t.muted).when(value === v, (e) => e.bg(t.selected)).hover((s) => s.bg(value === v ? t.selected : t.hover))
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_click((_e, cx) => { cx.stop_propagation(); if (value !== v) onPick(v, cx); })
        .child(svg(icon(name)).size(12))));
  }

  // A button with a dropdown half, like Zed's "Push ⌄" and "Commit ⌄".
  split(id, text, t, { primary, enabled, onClick, onMenu, tip, iconName }) {
    const fg = !enabled ? t.dim : primary ? t.solid_foreground : t.foreground, bg = primary && enabled ? t.solid : t.raised;
    return h_flex().id(id).h(26).flex_none().items_center().rounded(6).border_1().border_color(primary && enabled ? t.solid : t.border).bg(bg).text_color(fg).text_size(12)
      .child(h_flex().id(`${id}-main`).h_full().px(10).gap(5).items_center().rounded_l(6).tooltip(tip)
        .when(enabled, (e) => e.cursor_pointer().hover((s) => s.bg(primary ? t.solid : t.hover).opacity(0.88)))
        .on_click((_e, cx) => { if (enabled) onClick(cx); })
        .when(Boolean(iconName), (e) => e.child(svg(icon(iconName)).size(12).flex_none()))
        .child(text))
      .child(div().w(1).h(14).bg(primary && enabled ? t.solid_foreground + "44" : t.border))
      .child(h_flex().id(`${id}-menu`).h_full().px(5).items_center().rounded_r(6).cursor_pointer().hover((s) => s.bg(primary && enabled ? t.solid : t.hover).opacity(0.88))
        .on_click((_e, cx) => onMenu(cx))
        .child(svg(icon("chevron-down")).size(12).text_color(primary && enabled ? t.solid_foreground : t.muted)));
  }

  checkbox(id, state, t, onClick) {
    const on = state === "all", some = state === "some";
    return h_flex().id(id).size(14).flex_none().items_center().justify_center().rounded(3).border_1()
      .border_color(on || some ? t.accent : t.input).when(on, (e) => e.bg(t.accent)).text_size(10).text_color(on ? t.accent_foreground : t.accent)
      .cursor_pointer().hover((s) => s.border_color(t.accent))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => { cx.stop_propagation(); onClick(cx); })
      .child(on ? "✓" : some ? "−" : "");
  }

  sectionHeader(area, title, list, t) {
    const folded = this.collapsed[area];
    const state = list.every((e) => e.staged === "all") ? "all" : list.some((e) => e.staged !== "none") ? "some" : "none";
    return h_flex().id(`section-${area}`).h(ROW).flex_none().px(6).gap(6).items_center().rounded(6).cursor_pointer().hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => { this.collapsed[area] = !folded; localStorage.setItem("collapsed", JSON.stringify(this.collapsed)); cx.notify(); })
      .child(svg(icon(folded ? "chevron-right" : "chevron-down")).size(12).flex_none().text_color(t.dim))
      .child(div().flex_1().text_size(12).text_color(t.muted).child(title))
      .when(area !== "stash", (e) => e.child(this.checkbox(`check-${area}`, state, t, (cx) => this.toggleSection(list, cx))))
      .child(div().min_w(18).px(4).rounded(4).bg(t.raised).text_size(10.5).text_color(t.muted).text_center().child(String(list.length)));
  }

  fileRow(e, t, depth = 0) {
    const parts = e.path.split("/"), name = parts.pop(), id = e.path, tree = this.listMode === "tree";
    const hovered = this.hovered === id || this.armed === `discard-${id}`;
    const color = e.conflict || e.status === "D" ? t.ansi1 : e.untracked || e.status === "A" ? t.ansi2 : t.blocked;
    const selected = this.isShown(e);
    return h_flex().id(`row-${id}`).h(ROW).flex_none().pl(8 + depth * 14).pr(6).gap(8).items_center().rounded(6).cursor_pointer()
      .border_1().border_color(selected ? t.accent : t.background + "00").when(selected, (el) => el.bg(t.selected)).hover((s) => s.bg(t.hover))
      .tooltip(e.path)
      .on_hover((h, cx) => { if (h) this.hovered = id; else if (this.hovered === id) this.hovered = null; cx.notify(); })
      .on_click((_ev, cx) => this.pick(e, cx))
      .on_mouse_down("right", (_ev, cx) => { cx.stop_propagation(); this.fileMenu(e, cx); })
      .child(this.checkbox(`stage-${id}`, e.staged, t, (cx) => this.act(cx, e.staged === "all" ? "Unstage" : "Stage", G.toggleArgs(e, this.hasHead))))
      .child(div().w(10).flex_none().text_size(11).text_color(color).child(e.untracked ? "U" : e.status))
      .child(h_flex().flex_1().min_w(0).items_center()
        .child(div().max_w(240).min_w(0).truncate().text_color(e.status === "D" ? t.muted : t.foreground).when(e.status === "D", (el) => el.line_through()).child(name))
        .when(!tree, (el) => el.child(div().pl(6).min_w(0).flex_1().truncate().text_size(11).text_color(t.dim).child(parts.join("/")))))
      .when(hovered, (el) => el
        .child(this.iconButton(`discard-${id}`, e.untracked ? "trash" : "undo", e.untracked ? "删除文件" : "丢弃更改",
          (cx) => this.arm(`discard-${id}`, cx, () => this.act(cx, "丢弃", G.discardArgs(e, this.hasHead))), t, { danger: true })))
      .when(!hovered && !e.untracked, (el) => el
        .child(div().text_size(11).text_color(t.ansi2).child(`+${e.add}`))
        .child(div().text_size(11).text_color(t.ansi1).child(`−${e.del}`)));
  }

  folderRow(row, area, list, t) {
    const key = `${area}:${row.path}`, open = !this.folded.has(key);
    const inside = list.filter((e) => e.path.startsWith(`${row.path}/`));
    const state = inside.every((e) => e.staged === "all") ? "all" : inside.some((e) => e.staged !== "none") ? "some" : "none";
    return h_flex().id(`folder-${key}`).h(ROW).flex_none().pl(8 + row.depth * 14).pr(6).gap(6).items_center().rounded(6).cursor_pointer()
      .hover((s) => s.bg(t.hover)).tooltip(row.path)
      .on_click((_e, cx) => this.fold(key, cx))
      .child(this.checkbox(`stage-dir-${key}`, state, t, (cx) => this.toggleSection(inside, cx)))
      .child(svg(icon(open ? "chevron-down" : "chevron-right")).size(11).flex_none().text_color(t.dim))
      .child(svg(icon("folder")).size(13).flex_none().text_color(t.muted))
      .child(div().flex_1().min_w(0).truncate().text_color(t.muted).child(row.name))
      .when(!open, (el) => el.child(div().text_size(10.5).text_color(t.dim).child(String(row.files))));
  }

  // A group's files, as a folder tree or a flat list.
  groupRows(area, list, t) {
    if (this.listMode === "flat") return list.map((e) => this.fileRow(e, t));
    const closed = new Set([...this.folded].filter((k) => k.startsWith(`${area}:`)).map((k) => k.slice(area.length + 1)));
    return G.fileTree(list, closed).map((r) => (r.kind === "folder" ? this.folderRow(r, area, list, t) : this.fileRow(r.entry, t, r.depth)));
  }

  stashRow(s, t) {
    const id = `stash-${s.ref}`, hovered = this.hovered === id || this.armed === `drop-${s.ref}`, selected = this.isShown(s);
    return h_flex().id(`row-${id}`).h(ROW).flex_none().pl(8).pr(6).gap(8).items_center().rounded(6).cursor_pointer()
      .border_1().border_color(selected ? t.accent : t.background + "00").when(selected, (el) => el.bg(t.selected)).hover((st) => st.bg(t.hover))
      .on_hover((h, cx) => { if (h) this.hovered = id; else if (this.hovered === id) this.hovered = null; cx.notify(); })
      .on_click((_ev, cx) => this.pick(s, cx))
      .on_mouse_down("right", (_ev, cx) => { cx.stop_propagation(); this.stashMenu(s, cx); })
      .child(svg(icon("stash")).size(13).flex_none().text_color(t.dim))
      .child(div().flex_1().min_w(0).truncate().child(s.subject || s.ref))
      .when(!hovered, (el) => el.child(div().flex_none().text_size(11).text_color(t.dim).child(s.when)))
      .when(hovered, (el) => el
        .child(this.iconButton(`apply-${s.ref}`, "check", "应用（保留贮藏）", (cx) => this.act(cx, "应用贮藏", G.stashArgs("apply", s.ref)), t))
        .child(this.iconButton(`pop-${s.ref}`, "fetch", "弹出（应用并删除）", (cx) => this.act(cx, "弹出贮藏", G.stashArgs("pop", s.ref)), t))
        .child(this.iconButton(`drop-${s.ref}`, "trash", "删除", (cx) => this.arm(`drop-${s.ref}`, cx, () => this.act(cx, "删除贮藏", G.stashArgs("drop", s.ref))), t, { danger: true })));
  }

  // A row of the graph picked: the uncommitted row shows every change.
  pickCommit(c, _clicks, cx) { this.pick(c.uncommitted ? { area: "all" } : c, cx); }

  historyView(t) {
    return this.history.view(t, {
      selected: ((s) => (s?.area === "all" ? G.UNCOMMITTED : s?.area === "commit" ? s.hash : null))(this.shown()),
      panelWidth: this.panelWidth, loading: this.loading,
      onPick: (c, clicks, cx) => this.pickCommit(c, clicks, cx),
      onMenu: (c, cx) => (c.uncommitted ? this.optionsMenu(cx) : this.commitMenu(c, cx)),
      onMore: (cx) => { this.history.more(); this.refresh(cx); cx.notify(); },
    });
  }

  changesList(t) {
    const out = [], conflicts = [], tracked = [], untracked = [];
    for (const e of this.entries) (e.conflict ? conflicts : e.untracked ? untracked : tracked).push(e);
    for (const [area, title, list] of [["conflict", "冲突", conflicts], ["tracked", "已跟踪", tracked], ["untracked", "未跟踪", untracked], ["stash", "贮藏", this.stashes]]) {
      if (!list.length) continue;
      out.push(this.sectionHeader(area, title, list, t));
      if (this.collapsed[area]) continue;
      const items = area === "stash" ? list.map((it) => this.stashRow(it, t)) : this.groupRows(area, list, t);
      out.push(...items);
    }
    if (!this.entries.length) {
      out.unshift(v_flex().py(18).gap(4).items_center().text_color(t.dim)
        .child(div().child(this.loading && !this.root ? "加载中…" : "没有可提交的更改"))
        .when(this.branch?.ahead > 0, (e) => e.child(div().text_size(11).child(`有 ${this.branch.ahead} 个提交待推送`))));
    }
    return { out };
  }

  tabs(t) {
    const tab = (id, label) => div().id(`tab-${id}`).flex_1().h_full().flex().items_center().justify_center().cursor_pointer().text_size(13)
      .text_color(this.tab === id ? t.foreground : t.muted).when(this.tab === id, (e) => e.border_b(2).border_color(t.accent)).hover((s) => s.text_color(t.foreground))
      .on_click((_e, cx) => this.setTab(id, cx)).child(label);
    return h_flex().h(34).flex_none().border_b(1).border_color(t.border)
      .child(tab("changes", this.entries.length ? `更改 (${this.entries.length})` : "更改"))
      .child(tab("history", "历史"));
  }

  toolbar(t) {
    const busy = Boolean(this.busy), any = this.entries.length > 0, allStaged = any && this.entries.every((e) => e.staged === "all");
    const add = this.entries.reduce((n, e) => n + e.add, 0), del = this.entries.reduce((n, e) => n + e.del, 0);
    if (this.tab === "history") {
      const h = this.history, n = h.base.length;
      const segment = (id, text, on, all) => div().id(id).h(20).px(8).flex().items_center().rounded(5).text_size(11.5).cursor_pointer()
        .text_color(on ? t.foreground : t.muted).when(on, (e) => e.bg(t.raised).border_1().border_color(t.border))
        .hover((s) => s.text_color(t.foreground)).on_click((_e, cx) => { if (!on) { h.setAll(all); this.refresh(cx); cx.notify(); } }).child(text);
      return h_flex().h(32).flex_none().px(8).gap(6).items_center().border_b(1).border_color(t.border)
        .child(h_flex().p(2).gap(2).rounded(7).border_1().border_color(t.border)
          .child(segment("history-all", "所有分支", h.all, true)).child(segment("history-current", "当前分支", !h.all, false)))
        .child(this.iconButton("history-remotes", "cloud", h.remotes ? "显示所有远程分支：点击只显示上游" : "只显示上游：点击显示所有远程分支",
          (cx) => { h.setRemotes(!h.remotes); this.refresh(cx); cx.notify(); }, t, { active: h.remotes, disabled: !h.all }))
        .child(div().flex_1().text_right().text_size(11).text_color(t.dim).child(n ? `${n}${h.hasMore ? "+" : ""}` : ""))
        .child(this.iconButton("refresh-h", "refresh", "刷新", (cx) => this.refresh(cx), t, { disabled: busy }));
    }
    return h_flex().h(32).flex_none().px(8).gap(4).items_center().border_b(1).border_color(t.border)
      .child(this.iconButton("view-diff", "diff", "在主区域显示全部更改", (cx) => this.pick({ area: "all" }, cx), t, { label: "查看差异", disabled: !any }))
      .when(any, (e) => e.child(div().pl(4).text_size(11).text_color(t.ansi2).child(`+${add}`)).child(div().text_size(11).text_color(t.ansi1).child(`−${del}`)))
      .child(div().flex_1())
      .child(this.pills("list", [["tree", "list-tree", "文件夹树"], ["flat", "list", "平铺列表"]], this.listMode, (m, cx) => this.setListMode(m, cx), t))
      .child(this.pills("layout", [["unified", "rows", "单栏显示差异"], ["split", "columns", "双栏显示差异：修改前 | 修改后"]], getLayout(), (m, cx) => { setLayout(m); cx.notify(); }, t))
      .child(this.iconButton("options", "sliders", "更多", (cx) => this.optionsMenu(cx), t))
      .child(this.iconButton("stage-all", allStaged ? "minus" : "plus", allStaged ? "取消暂存全部" : "暂存全部",
        (cx) => this.act(cx, allStaged ? "取消暂存" : "暂存", allStaged ? G.unstageAllArgs(this.hasHead) : G.stageAllArgs()), t, { label: allStaged ? "全部取消暂存" : "全部暂存", disabled: busy || !any }));
  }

  branchRow(t) {
    const b = this.branch, busy = Boolean(this.busy), action = G.remoteAction(b, this.remotes, this.hasHead);
    const name = b.detached ? `分离 ${b.oid?.slice(0, 7) ?? ""}` : b.head;
    return h_flex().h(34).flex_none().px(10).gap(6).items_center()
      .child(h_flex().id("branch").min_w(0).flex_1().gap(5).items_center().cursor_pointer().text_size(12).tooltip(b.upstream ? `跟踪 ${b.upstream}` : "无上游")
        .on_click((_e, cx) => this.branchMenu(cx))
        .child(svg(icon("branch")).size(13).flex_none().text_color(t.muted))
        .child(div().flex_none().text_color(t.muted).child(this.root.split("/").pop()))
        .child(div().flex_none().text_color(t.dim).child("/"))
        .child(div().min_w(0).truncate().hover((s) => s.text_color(t.accent)).child(name))
        .child(svg(icon("chevron-down")).size(11).flex_none().text_color(t.dim)))
      .when(Boolean(action), (e) => e.child(this.split("remote", busy && /推送|拉取|获取/.test(this.busy) ? `${this.busy}…` : action.count ? `${action.count} ${action.label}` : action.label, t, {
        enabled: !busy, iconName: action.count ? null : action.type === "pull" ? "fetch" : action.type === "push" ? "push" : "refresh",
        tip: action.type === "push" ? (b.upstream ? `推送到 ${b.upstream}` : "推送并设置上游") : action.type === "pull" ? `拉取 ${b.upstream}（仅快进）` : "从所有远程获取",
        onClick: (cx) => this.remote(cx, action.type), onMenu: (cx) => this.remoteMenu(cx),
      })));
  }

  editorBox(t) {
    const hint = this.amend ? "" : this.suggestion();
    return div().id("commit-editor").relative().mx(10).min_h(70).px(10).py(8).rounded(8).border_1().border_color(this.typing ? t.accent : t.border).bg(t.background).cursor_text()
      .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); this.editor.focus(); })
      .when(!this.message, (e) => e.child(div().absolute().top(8).left(10).right(10).truncate().text_size(12).text_color(t.dim)
        .font_family("JetBrains Mono").child(hint || (this.amend ? "修补信息（留空则沿用上一条）" : "输入提交信息"))))
      .child(Textarea.new(this.editor).w_full().text_size(12).text_color(t.foreground).font_family("JetBrains Mono"));
  }

  footer(t) {
    const busy = Boolean(this.busy) || this.loading, mode = this.mode();
    const hasMessage = Boolean(this.message.trim() || this.suggestion());
    const canCommit = !busy && (this.amend ? Boolean(this.last) : hasMessage && (mode === "staged" || mode === "tracked"));
    const label = this.busy && /提交|修补/.test(this.busy) ? "提交中…" : this.amend ? "修补" : mode === "tracked" ? "提交已跟踪" : "提交";
    const tip = this.amend ? "替换上一次提交" : mode === "tracked" ? "没有暂存内容：提交所有已跟踪更改（git commit -a）" : mode === "conflict" ? "请先解决冲突" : "提交暂存内容 · Ctrl+Enter";
    return v_flex().flex_none().gap(8).pt(2).pb(8)
      .child(this.editorBox(t))
      .child(h_flex().px(10).gap(6).items_center()
        .when(this.amend, (e) => e.child(div().px(6).py(1).rounded(4).bg(t.accent + "22").text_size(11).text_color(t.accent).child("修补")))
        .when(this.signoff, (e) => e.child(div().px(6).py(1).rounded(4).bg(t.raised).text_size(11).text_color(t.muted).child("签名")))
        .child(div().flex_1())
        .child(this.split("commit", label, t, { primary: true, enabled: canCommit, tip, onClick: (cx) => this.commit(cx, false), onMenu: (cx) => this.commitOptions(cx) })));
  }

  // A short hash that copies the full one when clicked, and says so for a moment.
  copyHash(c, cx) {
    cx.write_to_clipboard(c.hash);
    this.copied = c.hash;
    notify({ title: "已复制提交哈希", body: c.hash, level: "success", timeout: 2000 });
    cx.timer.after(1500, (cx) => { if (this.copied === c.hash) { this.copied = null; cx.notify(); } });
    cx.notify();
  }

  hashChip(c, t) {
    const done = this.copied === c.hash;
    return h_flex().id(`hash-${c.hash}`).flex_none().h(20).px(5).gap(4).items_center().rounded(5).cursor_pointer()
      .font_family(settings().font_family ?? "JetBrains Mono").text_size(11).text_color(done ? t.ansi2 : t.dim)
      .hover((s) => s.bg(t.hover).text_color(t.foreground)).tooltip(`复制 ${c.hash}`)
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => { cx.stop_propagation(); this.copyHash(c, cx); })
      .child(c.short)
      .child(svg(icon(done ? "check" : "copy")).size(11).flex_none());
  }
  lastCommit(t) {
    const c = this.last;
    return h_flex().id("last-commit").h(30).flex_none().px(10).gap(6).items_center().border_t(1).border_color(t.border).text_size(12).cursor_pointer()
      .hover((s) => s.bg(t.hover)).tooltip(`${c.short} · ${c.author} · ${c.when}`)
      .on_click((_e, cx) => this.pick(c, cx))
      .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); this.commitMenu(c, cx); })
      .child(this.hashChip(c, t))
      .child(div().flex_1().min_w(0).truncate().text_color(this.isShown(c) ? t.accent : t.muted).child(c.subject))
      .child(this.iconButton("uncommit", "undo", "撤销提交（保留暂存）", (cx) => this.arm("uncommit", cx, () => this.uncommit(cx)), t, { disabled: Boolean(this.busy) }))
      .child(this.iconButton("history", "history", "历史", (cx) => this.setTab("history", cx), t));
  }

  render(cx) {
    if (key() !== this.context) this.refresh(cx);
    const changed = shared("git-graph.changed");
    if (changed !== this.seenChange) { this.seenChange = changed; if (!this.busy) this.refresh(cx); }
    this.takePick(cx);
    const t = theme();
    const history = this.tab === "history" && Boolean(this.root);
    const list = !history && this.root ? this.changesList(t).out : [];
    const graph = history && (this.history.commits.length
      ? this.historyView(t)
      : div().flex_1().p(12).text_color(t.dim).child(this.hasHead ? "正在加载历史…" : "还没有提交"));
    return v_flex().id("git-changes").size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13).track_focus(this.handle)
      .on_size_change((size, cx) => {
        const width = Math.round(size.width / (settings().zoom ?? 1));
        if (width !== this.panelWidth) { this.panelWidth = width; cx.notify(); }
      })
      .on_key_down((e, cx) => {
        if (e.keystroke === "cmd-enter" || e.keystroke === "ctrl-enter") { this.commit(cx, false); cx.stop_propagation(); }
        // ⌘C on the panel (not while typing) copies the selected commit's hash.
        else if ((e.keystroke === "cmd-c" || e.keystroke === "ctrl-shift-c") && !this.typing && this.shown()?.area === "commit") { this.copyHash(this.shown(), cx); cx.stop_propagation(); }
        else if (e.key === "escape" && this.typing) { this.typing = false; this.handle.focus(); cx.stop_propagation(); cx.notify(); }
      })
      .child(this.tabs(t))
      .when(Boolean(this.root), (e) => e.child(this.toolbar(t)))
      .when(history, (e) => e.child(v_flex().flex_1().min_h(0).child(graph)))
      .when(!history, (e) => e.child(v_flex().id("git-changes-list").flex_1().min_h(0).overflow_y_scrollbar().p(6)
        .children(list)
        .when(!this.root, (el) => el.child(div().p(8).text_color(t.dim).child(this.error || (this.loading ? "正在加载更改…" : "没有文件夹"))))))
      .when(this.limited, (e) => e.child(div().px(12).py(4).text_size(11).text_color(t.dim).child(`仅显示前 ${G.LIMIT.toLocaleString()} 个文件`)))
      .when(Boolean(this.note), (e) => e.child(div().id("note").px(10).py(6).flex_none().border_t(1).border_color(t.border).text_size(11).text_color(t.ansi1).cursor_pointer().tooltip("点击关闭")
        .on_click((_e, cx) => { this.note = null; cx.notify(); }).child(this.note)))
      .when(Boolean(this.root && this.branch), (e) => e.child(v_flex().flex_none().border_t(1).border_color(t.border).bg(t.chrome)
        .child(this.branchRow(t))
        .child(this.footer(t))
        .when(Boolean(this.last), (e) => e.child(this.lastCommit(t)))));
  }
}
