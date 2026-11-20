/* ==========================================================================
   Flowchart renderer + animation engine
   Reads window.FLOWS (assets/js/flow-data.js) and renders the selected flow
   into #flowSvg. A packet travels edge by edge. At decision nodes it picks a
   branch at random, weighted by each edge's `p`.
   ========================================================================== */
(function () {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";
  const DEFAULT_W = 130, DEFAULT_H = 56;
  const PX_PER_MS = 0.32;        // packet speed at 1×
  const DWELL_MS = 650;          // time spent "processing" in each node
  const MAX_LOOPS = 3;           // after this many revisits, take the happy path
  const TRAIL = 5;

  const $ = (s) => document.querySelector(s);
  const svg = $("#flowSvg");
  const statusEl = $("#status");
  const statusText = $("#statusText");
  const playBtn = $("#playBtn");
  const logEl = $("#log");

  const el = (tag, attrs = {}, parent) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  };

  // ---------------------------------------------------------------- geometry
  const size = (n) => ({ w: n.w || DEFAULT_W, h: n.h || (n.type === "decision" ? 96 : DEFAULT_H) });

  /** Point on node n's border along the ray from its center toward (px,py). */
  function borderPoint(n, px, py, gap = 0) {
    const { w, h } = size(n);
    const dx = px - n.x, dy = py - n.y;
    if (!dx && !dy) return [n.x, n.y];
    let t;
    if (n.type === "decision") t = 1 / (Math.abs(dx) / (w / 2) + Math.abs(dy) / (h / 2));
    else t = Math.min(dx ? (w / 2) / Math.abs(dx) : Infinity, dy ? (h / 2) / Math.abs(dy) : Infinity);
    const len = Math.hypot(dx, dy);
    const g = gap / len;
    return [n.x + dx * (t + g), n.y + dy * (t + g)];
  }

  function edgePath(flow, e) {
    const a = flow.byId[e.from], b = flow.byId[e.to];
    const pts = [[a.x, a.y], ...(e.via || []), [b.x, b.y]];
    pts[0] = borderPoint(a, pts[1][0], pts[1][1], 2);
    const p = pts[pts.length - 2];
    pts[pts.length - 1] = borderPoint(b, p[0], p[1], 4);
    return "M" + pts.map((q) => q.map((v) => v.toFixed(1)).join(",")).join(" L");
  }

  // ---------------------------------------------------------------- render
  let flow = null;     // currently rendered flow (with lookups)
  let refs = {};       // id -> { g } for nodes, edge index -> { g, path, flowPath, len }

  function prepare(def) {
    const f = { ...def, byId: {}, out: {}, inc: {} };
    def.nodes.forEach((n) => { f.byId[n.id] = n; f.out[n.id] = []; f.inc[n.id] = []; });
    def.edges.forEach((e, i) => { e.i = i; f.out[e.from].push(e); f.inc[e.to].push(e); });
    return f;
  }

  function render(def) {
    flow = prepare(def);
    refs = { nodes: {}, edges: [] };
    svg.innerHTML = "";
    svg.setAttribute("viewBox", def.viewBox.join(" "));
    svg.setAttribute("aria-label", def.title + " flowchart");

    const defs = el("defs", {}, svg);
    [["arrow", "var(--border-strong)"], ["arrow-taken", "var(--accent)"], ["arrow-no", "var(--bad)"]].forEach(([id, color]) => {
      const m = el("marker", { id, viewBox: "0 0 10 10", refX: 8, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" }, defs);
      el("path", { d: "M0,0 L10,5 L0,10 z", style: `fill:${color}` }, m);
    });

    const gEdges = el("g", { class: "edges" }, svg);
    const gPacket = el("g", { class: "packets" }, svg);
    const gNodes = el("g", { class: "nodes" }, svg);

    // Edges
    def.edges.forEach((e, i) => {
      const g = el("g", { class: "edge draw" + (e.kind === "no" ? " no" : "") }, gEdges);
      const d = edgePath(flow, e);
      const base = el("path", { class: "base", d, "marker-end": "url(#arrow)" }, g);
      const fp = el("path", { class: "flow", d }, g);
      const len = base.getTotalLength();
      base.style.strokeDasharray = len;
      base.style.strokeDashoffset = len;
      base.style.animationDelay = (0.25 + i * 0.07) + "s";
      base.addEventListener("animationend", () => {
        g.classList.remove("draw");
        base.style.strokeDasharray = base.style.strokeDashoffset = "";
      }, { once: true });

      if (e.label) {
        const at = base.getPointAtLength(len * (e.labelAt ?? 0.5));
        const w = e.label.length * 7 + 12;
        el("rect", { class: "label-bg", x: at.x - w / 2, y: at.y - 10, width: w, height: 20, rx: 4 }, g);
        const t = el("text", { x: at.x, y: at.y + 4, "text-anchor": "middle" }, g);
        t.textContent = e.label;
      }
      refs.edges[i] = { g, base, fp, len, e };
    });

    // Packet + trail
    refs.trail = Array.from({ length: TRAIL }, (_, k) =>
      el("circle", { class: "packet-trail", r: 5 - k * 0.7, cx: -50, cy: -50 }, gPacket));
    refs.packet = el("circle", { class: "packet", r: 6, cx: -50, cy: -50 }, gPacket);

    // Nodes
    def.nodes.forEach((n, i) => {
      const { w, h } = size(n);
      const g = el("g", {
        class: `node ${n.type}`, transform: `translate(${n.x},${n.y})`,
        tabindex: 0, role: "button", "aria-label": `${n.label}: ${n.info?.desc || ""}`,
      }, gNodes);
      const pop = el("g", { class: "pop", style: `animation-delay:${i * 0.06}s` }, g);

      let shape, ring;
      if (n.type === "decision") {
        const pts = `0,${-h / 2} ${w / 2},0 0,${h / 2} ${-w / 2},0`;
        shape = el("polygon", { class: "shape", points: pts }, pop);
        ring = el("polygon", { class: "ring", points: pts }, pop);
      } else {
        const rx = n.type === "terminal" ? h / 2 : 10;
        const a = { x: -w / 2, y: -h / 2, width: w, height: h, rx };
        shape = el("rect", { class: "shape", ...a }, pop);
        ring = el("rect", { class: "ring", ...a }, pop);
      }
      const label = el("text", { "text-anchor": "middle", y: n.sub ? -2 : 5 }, pop);
      label.textContent = n.label;
      if (n.sub) {
        const sub = el("text", { class: "sub", "text-anchor": "middle", y: 15 }, pop);
        sub.textContent = n.sub;
      }

      g.addEventListener("click", () => select(n.id));
      g.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); ev.stopPropagation(); select(n.id); }
      });
      refs.nodes[n.id] = { g, ring };
    });

    resetRun(false);
  }

  // ---------------------------------------------------------------- engine
  const state = {
    playing: false,
    stepOnce: false,
    phase: "idle",    // idle | dwell | moving | done
    current: null,
    edge: null,
    progress: 0,
    dwell: 0,
    speed: 1,
    visits: {},
    steps: 0,
    simMs: 0,
    autoLoop: false,
    selected: null,
  };

  function resetRun(announce = true) {
    state.playing = false;
    state.stepOnce = false;
    state.phase = "idle";
    state.current = null;
    state.edge = null;
    state.progress = 0;
    state.visits = {};
    state.steps = 0;
    state.simMs = 0;
    Object.values(refs.nodes).forEach(({ g }) => g.classList.remove("active", "visited", "pulse"));
    refs.edges.forEach(({ g, base }) => { g.classList.remove("active", "taken"); base.setAttribute("marker-end", "url(#arrow)"); });
    hidePacket();
    updateUi();
    if (announce) log("Run reset", "warn");
  }

  function hidePacket() {
    [refs.packet, ...refs.trail].forEach((c) => { c.setAttribute("cx", -50); c.setAttribute("cy", -50); });
  }

  function arrive(id) {
    const prev = state.current && refs.nodes[state.current];
    if (prev) { prev.g.classList.remove("active"); prev.g.classList.add("visited"); }
    state.current = id;
    state.visits[id] = (state.visits[id] || 0) + 1;
    state.steps++;
    const r = refs.nodes[id];
    r.g.classList.add("active");
    r.g.classList.remove("pulse"); void r.g.getBBox(); r.g.classList.add("pulse");

    const n = flow.byId[id];
    const cls = n.type === "error" ? "bad" : n.type === "success" ? "ok" : "";
    log(`${n.label}: ${n.info?.log || "processing"}`, cls);

    if (state.selected === id) renderInspector(id);
    state.phase = "dwell";
    state.dwell = DWELL_MS;
  }

  function chooseEdge(id) {
    const outs = flow.out[id];
    if (!outs.length) return null;
    if (outs.length === 1) return outs[0];
    // After too many loops, always take the highest-weight branch so the run ends
    const looping = Object.values(state.visits).some((v) => v >= MAX_LOOPS);
    if (looping) return outs.reduce((a, b) => ((b.p || 0) > (a.p || 0) ? b : a));
    const total = outs.reduce((s, e) => s + (e.p ?? 1), 0);
    let r = Math.random() * total;
    for (const e of outs) { r -= e.p ?? 1; if (r <= 0) return e; }
    return outs[outs.length - 1];
  }

  function depart() {
    const e = chooseEdge(state.current);
    if (!e) return finish();
    const n = flow.byId[state.current];
    if (n.type === "decision") log(`  → ${e.label || "continue"}`, e.kind === "no" ? "bad" : "ok");
    state.edge = e;
    state.progress = 0;
    state.phase = "moving";
    const r = refs.edges[e.i];
    r.g.classList.add("active");
  }

  function finish() {
    state.phase = "done";
    const n = flow.byId[state.current];
    log(`Finished at “${n.label}” after ${state.steps} steps (${(state.simMs / 1000).toFixed(1)}s)`, n.type === "error" ? "bad" : "ok");
    state.playing = false;
    hidePacket();
    updateUi();
    if (state.autoLoop) setTimeout(() => { if (state.phase === "done") { resetRun(false); play(); } }, 1200);
  }

  function placePacket(r, t) {
    const p = r.base.getPointAtLength(r.len * t);
    refs.packet.setAttribute("cx", p.x);
    refs.packet.setAttribute("cy", p.y);
    refs.trail.forEach((c, k) => {
      const tt = Math.max(0, t - (k + 1) * (18 / r.len));
      const q = r.base.getPointAtLength(r.len * tt);
      c.setAttribute("cx", q.x);
      c.setAttribute("cy", q.y);
    });
  }

  let last = 0;
  function tick(now) {
    const dt = Math.min(64, now - (last || now));
    last = now;
    if (state.playing) {
      const sdt = dt * state.speed;
      state.simMs += sdt;
      if (state.phase === "dwell") {
        state.dwell -= sdt;
        if (state.dwell <= 0) {
          if (state.stepOnce) { state.stepOnce = false; state.playing = false; updateUi(); }
          else depart();
        }
      } else if (state.phase === "moving") {
        const r = refs.edges[state.edge.i];
        state.progress = Math.min(1, state.progress + (sdt * PX_PER_MS) / r.len);
        placePacket(r, state.progress);
        if (state.progress >= 1) {
          r.g.classList.remove("active");
          r.g.classList.add("taken");
          r.base.setAttribute("marker-end", state.edge.kind === "no" ? "url(#arrow-no)" : "url(#arrow-taken)");
          arrive(state.edge.to);
          if (state.stepOnce) { state.stepOnce = false; state.playing = false; }
          updateUi();
        }
      }
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  function begin(startId) {
    resetRun(false);
    log(`▶ Run started: ${flow.title}`, "warn");
    arrive(startId || flow.start);
  }

  function play() {
    if (state.phase === "idle" || state.phase === "done") begin();
    state.playing = true;
    state.stepOnce = false;
    updateUi();
  }
  function pause() { state.playing = false; updateUi(); }

  function step() {
    if (state.phase === "idle" || state.phase === "done") { begin(); updateUi(); return; }
    if (state.phase === "dwell") depart();
    if (state.phase === "done") return;
    state.stepOnce = true;
    state.playing = true;
    updateUi();
  }

  function updateUi() {
    const running = state.playing && !state.stepOnce;
    playBtn.textContent = running ? "❚❚ Pause" : state.phase === "done" ? "↻ Replay" : "▶ Play";
    playBtn.setAttribute("aria-pressed", String(running));
    statusEl.classList.toggle("running", state.playing);
    const cur = state.current ? flow.byId[state.current].label : "";
    statusText.textContent =
      state.phase === "idle" ? "Ready, press play" :
      state.phase === "done" ? `Done · ${state.steps} steps · ended at ${cur}` :
      `${state.playing ? "Running" : "Paused"} · step ${state.steps} · ${cur}`;
  }

  // ---------------------------------------------------------------- log
  function log(msg, cls = "") {
    const li = document.createElement("li");
    const t = new Date();
    li.innerHTML = `<span class="t">${t.toLocaleTimeString([], { hour12: false })}</span><span class="${cls}"></span>`;
    li.lastChild.textContent = msg;
    logEl.prepend(li);
    while (logEl.children.length > 200) logEl.lastChild.remove();
  }
  $("#clearLog").addEventListener("click", () => { logEl.innerHTML = ""; });

  // ---------------------------------------------------------------- inspector
  function select(id) {
    if (state.selected && refs.nodes[state.selected]) refs.nodes[state.selected].g.classList.remove("selected");
    state.selected = id;
    refs.nodes[id].g.classList.add("selected");
    renderInspector(id);
    Flyout.open("node-panel");
  }

  function renderInspector(id) {
    const n = flow.byId[id];
    $("#node-title").textContent = n.label;
    const body = $("#nodeBody");
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const conn = (list, dir) => list.length
      ? `<ul class="conn-list">${list.map((e) => {
          const other = flow.byId[dir === "in" ? e.from : e.to];
          const pct = e.p != null && flow.byId[e.from].type === "decision" ? ` · ${Math.round(e.p * 100)}%` : "";
          return `<li><button data-goto="${other.id}"><span class="arrow">${dir === "in" ? "←" : "→"}</span>${esc(other.label)}<span class="lbl">${esc(e.label || "")}${pct}</span></button></li>`;
        }).join("")}</ul>`
      : `<p style="color:var(--text-faint);font-size:14px">None</p>`;

    body.innerHTML = `
      <div class="stagger">
        <p><span class="pill ${n.type}">${n.type}</span></p>
        <p style="color:var(--text-dim)">${esc(n.info?.desc || "")}</p>
        <dl class="kv">
          <dt>Owner</dt><dd>${esc(n.info?.owner || "—")}</dd>
          <dt>Avg time</dt><dd>${esc(n.info?.avg || "—")}</dd>
          <dt>Visits</dt><dd>${state.visits[id] || 0} this run</dd>
          <dt>Node id</dt><dd><code>${esc(n.id)}</code></dd>
        </dl>
        <div class="nav-label" style="margin-left:0">Incoming</div>
        ${conn(flow.inc[id], "in")}
        <div class="nav-label" style="margin-left:0">Outgoing</div>
        ${conn(flow.out[id], "out")}
      </div>`;
  }

  $("#nodeBody").addEventListener("click", (e) => {
    const b = e.target.closest("[data-goto]");
    if (b) { select(b.dataset.goto); refs.nodes[b.dataset.goto].g.focus(); }
  });

  document.getElementById("node-panel").addEventListener("flyout:close", () => {
    if (state.selected && refs.nodes[state.selected]) refs.nodes[state.selected].g.classList.remove("selected");
    state.selected = null;
  });

  $("#runFromHere").addEventListener("click", () => {
    if (!state.selected) return;
    begin(state.selected);
    state.playing = true;
    updateUi();
  });

  // ---------------------------------------------------------------- controls
  playBtn.addEventListener("click", () => (state.playing && !state.stepOnce ? pause() : play()));
  $("#stepBtn").addEventListener("click", step);
  $("#resetBtn").addEventListener("click", () => resetRun());

  const speed = $("#speed"), speedOut = $("#speedOut");
  speed.addEventListener("input", () => { state.speed = +speed.value; speedOut.textContent = speed.value + "×"; });

  const autoLoop = $("#autoLoop");
  if (autoLoop) {
    try { autoLoop.checked = localStorage.getItem("gh-pages-demo:autoloop") === "1"; } catch { /* ignore */ }
    state.autoLoop = autoLoop.checked;
    autoLoop.addEventListener("change", () => {
      state.autoLoop = autoLoop.checked;
      try { localStorage.setItem("gh-pages-demo:autoloop", autoLoop.checked ? "1" : "0"); } catch { /* ignore */ }
    });
  }

  // Tabs
  const tabs = $("#flowTabs");
  function selectFlow(id, push = true) {
    const def = window.FLOWS.find((f) => f.id === id) || window.FLOWS[0];
    tabs.querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.id === def.id)));
    Flyout.close("node-panel");
    render(def);
    if (push && location.hash.slice(1) !== def.id) history.replaceState(null, "", "#" + def.id);
  }
  window.FLOWS.forEach((f, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role", "tab");
    b.dataset.id = f.id;
    b.textContent = f.title;
    b.title = `${f.title} (${i + 1})`;
    b.addEventListener("click", () => selectFlow(f.id));
    tabs.appendChild(b);
  });
  window.addEventListener("hashchange", () => selectFlow(location.hash.slice(1), false));

  // Page-level shortcuts (dispatched by shortcuts.js)
  document.addEventListener("shortcut", (e) => {
    const { key, original } = e.detail;
    // Let focused buttons/links/nodes handle Space natively
    if (key === " " && original.target.closest && original.target.closest("button, a, [role='button']")) return;
    if (key === " ") { original.preventDefault(); playBtn.click(); }
    else if (key === "n") step();
    else if (key === "r") resetRun();
    else if (key === "l") Flyout.toggle("log-panel");
    else if (/^[1-9]$/.test(key) && window.FLOWS[+key - 1]) selectFlow(window.FLOWS[+key - 1].id);
  });

  selectFlow(location.hash.slice(1) || window.FLOWS[0].id, false);
})();
