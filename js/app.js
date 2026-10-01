/* ============================================================
   给鲤鱼的一封信 —— 引擎（第二版：动画 · 手感 · 引导）
   流程：同意公约 → 点火漆拆封 → 按住抽出信纸 → 一叠信纸（两侧箭头抽纸）
        → 问答 → 风险勾选 → 原初版.txt → 落款
   ============================================================ */
(() => {
  "use strict";

  const dev = new URLSearchParams(location.search).has("dev") || window.__DEV__ === true;
  const $ = (s) => document.querySelector(s);
  const app = $("#app");
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const ROMAN = ["", "Ⅰ","Ⅱ","Ⅲ","Ⅳ","Ⅴ","Ⅵ","Ⅶ","Ⅷ","Ⅸ","Ⅹ","Ⅺ","Ⅻ","ⅩⅢ","ⅩⅣ","ⅩⅤ","ⅩⅥ","ⅩⅦ","ⅩⅧ","ⅩⅨ","ⅩⅩ",
    "ⅩⅪ","ⅩⅫ","ⅩⅩⅢ","ⅩⅩⅣ","ⅩⅩⅤ","ⅩⅩⅥ","ⅩⅩⅦ","ⅩⅩⅧ","ⅩⅩⅨ","ⅩⅩⅩ"];
  const roman = (n) => ROMAN[n] || n;

  let story = null;
  let UNITS_MAIN = [];          // 主信：句子级单元（用于"写满了再翻页"）
  let UNITS_RAW = [];           // 原初版：同上
  const S = { gateOk: false, opened: false, pulled: false, sealBroken: false, qSeen: false, rawRead: false, riskOk: false, passOk: false,
              top: 0, seen: new Set(),
              busy: false, pending: 0, letterIdx: 0,
              pages: [], firstDeal: true };
  const VIS = 5;                // 堆叠时可见的纸边层数

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  let toastTimer = null;
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 2400);
  }
  function show(el) {
    document.querySelectorAll(".scene").forEach((s) => s.classList.add("hidden"));
    el.classList.remove("hidden");
  }

  /* ---------------- 音效（Web Audio 合成，不需要音频文件） ---------------- */
  const sfx = (() => {
    const AC = window.AudioContext || window.webkitAudioContext;
    let ac = null, master = null, noise = null, muted = false, plays = 0;
    function ensure() {
      if (!AC) return null;
      if (!ac) {
        ac = new AC();
        master = ac.createGain();
        master.gain.value = muted ? 0 : 0.5;
        master.connect(ac.destination);
        const len = Math.floor(ac.sampleRate * 1.2);
        noise = ac.createBuffer(1, len, ac.sampleRate);
        const d = noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.8;
      }
      if (ac.state === "suspended") ac.resume();
      return ac;
    }
    function burst(o) {
      const c = ensure();
      if (!c || muted) return;
      const t = c.currentTime + 0.004;
      const src = c.createBufferSource(); src.buffer = noise; src.loop = true;
      src.playbackRate.value = o.rate || 1;
      const f1 = c.createBiquadFilter(), f2 = c.createBiquadFilter(), g = c.createGain();
      f1.type = "bandpass"; f1.Q.value = o.q || 0.8;
      f1.frequency.setValueAtTime(o.f1, t);
      f1.frequency.exponentialRampToValueAtTime(o.f2, t + o.band);
      f2.type = "highpass"; f2.frequency.value = o.hp || 300;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(o.peak, t + o.attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + o.attack + o.dur);
      let out = g;
      if (c.createStereoPanner) {                        // 轻微左右随机：翻纸不会两次一模一样
        const p = c.createStereoPanner();
        p.pan.value = (Math.random() - 0.5) * (o.spread == null ? 0.35 : o.spread);
        g.connect(p); out = p;
      }
      src.connect(f1); f1.connect(f2); f2.connect(g); out.connect(master);
      src.start(t); src.stop(t + o.attack + o.dur + 0.1);
      plays++;
    }
    return {
      // 翻一页纸："沙"
      flip(s) { burst({ f1: 1700 + Math.random() * 500, f2: 3300 + Math.random() * 1100, band: .2, q: .7, hp: 850,
        attack: .012, dur: .15 + Math.random() * .08, peak: (s == null ? 1 : s) * (.30 + Math.random() * .1),
        rate: 1 + (Math.random() - .5) * .3, spread: .3 }); },
      // 抽出/滑回信纸："唰——"
      slide(s, dur) { burst({ f1: 800 + Math.random() * 300, f2: 2100, band: (dur || .55), q: .55, hp: 260,
        attack: .05, dur: (dur || .55), peak: (s == null ? 1 : s) * .26, rate: .85, spread: .55 }); },
      // 火漆裂开："咔"
      crack() { burst({ f1: 2600, f2: 520, band: .1, q: 1.3, hp: 700, attack: .003, dur: .085, peak: .6, rate: 1.35 });
                burst({ f1: 420, f2: 160, band: .12, q: 1, hp: 90, attack: .006, dur: .13, peak: .34, rate: .9 }); },
      // 火漆/信纸落定："噗"
      press() { burst({ f1: 460, f2: 200, band: .2, q: 1.1, hp: 110, attack: .02, dur: .16, peak: .38, rate: .8 }); },
      wake() { ensure(); },
      toggle() { muted = !muted; const c = ensure(); if (c && master) master.gain.value = muted ? 0 : 0.5; return muted; },
      debug() { return { ctx: ac ? ac.state : null, plays: plays, muted: muted }; },
    };
  })();
  window.__sfxDebug = () => sfx.debug();

  /* ---------------- 分页：句子 → 页（用真实排版量，"写满了再下一页"） ---------------- */
  function splitSentences(t) {
    const raw = [];
    let cur = "";
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      cur += ch;
      if ("。！？…".includes(ch)) {
        const next = t[i + 1] || "";
        if (!"”』」…".includes(next)) { raw.push(cur); cur = ""; }
      }
    }
    if (cur) raw.push(cur);
    // 把落在句尾的引号/括号并回上一句
    const out = [];
    raw.forEach((s) => {
      if (out.length && /^[”』」）]/.test(s)) out[out.length - 1] += s;
      else out.push(s);
    });
    return out.length ? out : [t];
  }

  function toUnits(paras) {
    const units = [];
    (paras || []).forEach((pa, i) => {
      if (pa.role === "salutation") { units.push({ salute: pa.t }); return; }
      splitSentences(pa.t).forEach((s, k) => units.push({ t: s, orig: i, first: k === 0 }));
    });
    return units;
  }

  function parseRawText(text) {
    return String(text || "").split("\n").map((line) => {
      const t = line.replace(/\t/g, " ").trim();
      if (!t) return null;
      const role = (t.length <= 8 && t.startsWith("致") && !/[。！？，…]$/.test(t)) ? "salutation" : "text";
      return { t, role };
    }).filter(Boolean);
  }

  function sheetHTML(pg, idx) {
    const head = pg.salute
      ? `<div class="sheet-head"><div class="flourish"><span class="dia">◆</span></div>
         <div class="sheet-salute">${esc(pg.salute)}<span class="sub">${esc(story.meta.toLatin || story.meta.to)}</span></div></div>`
      : `<div class="sheet-head"><div class="flourish"><span class="dia">◆</span></div></div>`;
    const body = pg.frags.map((f) => `<p class="${f.indent ? "" : "no-indent"}">${esc(f.text)}</p>`).join("");
    return head + `<div class="sheet-body">${body}</div>` + `<div class="sheet-foot">${roman(idx + 1)}</div>`;
  }

  function paginateByDOM(units) {
    const meas = document.createElement("div");
    meas.className = "sheet-layer paper";
    meas.style.cssText = "visibility:hidden;z-index:9999;";
    $(".stack-wrap").appendChild(meas);
    const pages = [];
    const newPage = () => { const p = { frags: [] }; pages.push(p); return p; };
    let cur = newPage();
    const render = () => { meas.innerHTML = sheetHTML(cur, pages.indexOf(cur)); };
    const fits = () => {
      const b = meas.querySelector(".sheet-body");
      if (!b) return true;
      if (b.clientHeight === 0) {   // 无排版环境（jsdom 之类）→ 退化成字数估算
        const len = cur.frags.reduce((s, f) => s + f.text.length, 0);
        return len <= 420;
      }
      return b.scrollHeight <= b.clientHeight + 2;
    };

    for (const u of units) {
      if (u.salute) {                                   // 抬头独占一页
        if (!cur.frags.length && !cur.salute) pages.pop();
        const p = newPage(); p.salute = u.salute;       // 抬头页（无正文）
        cur = newPage();                                // 正文另起
        continue;
      }
      if (!cur.frags.length || cur.frags[cur.frags.length - 1].orig !== u.orig) {
        cur.frags.push({ orig: u.orig, text: "", indent: u.first });
      }
      const frag = cur.frags[cur.frags.length - 1];
      const before = frag.text;
      frag.text = before + u.t;
      render();
      if (!fits()) {
        if (cur.frags.length > 1 || frag.text !== u.t) {
          frag.text = before;
          if (!frag.text) { cur.frags.pop(); }
          render();
          cur = newPage();
        } else {
          cur.frags.pop();
          cur = newPage();
        }
        cur.frags.push({ orig: u.orig, text: u.t, indent: !before });
        render();
      }
    }
    if (!cur.frags.length && !cur.salute) pages.pop();
    meas.remove();
    return pages.filter((p) => p.salute || p.frags.length);
  }

  /* ---------------- 火漆印章 ---------------- */
  function sealSVG() {
    const blob = "M54 7 C70 5 86 15 94 29 C100 41 102 57 96 69 C91 81 80 92 66 96 C54 100 39 98 28 91 C15 83 8 69 8 56 C8 43 15 29 26 19 C36 10 46 8 54 7 Z";
    return `
    <svg viewBox="0 0 108 108">
      <defs><radialGradient id="waxG" cx="38%" cy="32%" r="80%">
        <stop offset="0%" stop-color="#c04a3b"/><stop offset="45%" stop-color="#9e2720"/>
        <stop offset="100%" stop-color="#70130f"/></radialGradient>
        <filter id="emboss"><feDropShadow dx="0.9" dy="0.9" stdDeviation="0.4"
          flood-color="#ffb48f" flood-opacity="0.55"/></filter></defs>
      <g class="seal-body">
        <path d="${blob}" fill="url(#waxG)"/>
        <path d="${blob}" fill="none" stroke="#5c0e0a" stroke-width="1.2" opacity=".8"/>
        <circle cx="54" cy="55" r="36" fill="none" stroke="#4e0c09" stroke-width="4" opacity=".5"/>
        <circle cx="54" cy="55" r="38.5" fill="none" stroke="#e8b48f" stroke-width="1.6" opacity=".5"/>
        <text x="54" y="55" text-anchor="middle" dominant-baseline="central" font-size="40"
              font-family="KaiTi, 楷体, STKaiti, serif" fill="#5c0d0a" filter="url(#emboss)">鲤</text>
        <path class="crack" d="M54 55 L26 30 M54 55 L82 38 M54 55 L63 90 M54 55 L74 62"/>
      </g>
    </svg>`;
  }
  function smallSeal() {
    return `<svg viewBox="0 0 108 108">
      <defs><filter id="emboss2"><feDropShadow dx="1" dy="1" stdDeviation="0.4"
          flood-color="#f3c9a8" flood-opacity="0.6"/></filter></defs>
      <path d="M54 9 C69 7 85 16 93 30 C99 42 101 57 95 69 C90 81 79 92 65 96 C54 99 40 98 29 91 C16 83 9 69 9 56 C9 43 16 29 27 20 C36 11 45 9 54 9 Z"
            fill="#8e1e1c" stroke="#4e0c09" stroke-width="2"/>
      <circle cx="54" cy="55" r="33" fill="none" stroke="#d9a06f" stroke-width="2.5" opacity=".8"/>
      <text x="54" y="55" text-anchor="middle" dominant-baseline="central" font-size="38"
            font-family="KaiTi, 楷体, serif" fill="#3c0a08" filter="url(#emboss2)">鲤</text></svg>`;
  }

  /* ---------------- 场景一：信封 ---------------- */
  function buildEnvScene() {
    const m = story.meta;
    const d = document.createElement("div");
    d.id = "sceneEnv"; d.className = "scene";
    d.innerHTML = `
      <div class="vignette-text">A LETTER FOR<em>${esc(m.toLatin || m.to)}</em></div>
      <div class="env-wrap">
        <div class="env-halo"></div>
        <div class="pull-arrow" id="pullArrow">↑<span>按住 · 向上抽出</span></div>
        <div class="env" id="envBox">
          <div class="env-letter" id="envLetter">
            <div class="leaf paper l0"></div>
            <div class="leaf paper l1"></div>
            <div class="leaf paper l2"></div>
          </div>
          <div class="env-body">
            <div class="paper env-face"></div>
            <svg class="env-folds" viewBox="0 0 640 400" preserveAspectRatio="none" aria-hidden="true">
              <path class="fold" d="M0 0 L320 200 L0 400 Z"/>
              <path class="fold dark" d="M640 0 L320 200 L640 400 Z"/>
              <path class="fold mid" d="M0 400 L320 200 L640 400 Z"/>
              <path class="crease" d="M0 0 L320 200 L640 0 M0 400 L320 200 L640 400"/>
              <path class="crease-hi" d="M1.5 2 L320 201 M638.5 2 L320 201"/>
            </svg>
          </div>
          <div class="paper env-flap" id="envFlap"></div>
          <div class="flap-addr" id="flapAddr">
            <div class="addr">
              <div class="script">${esc(m.toLatin || m.to)}</div>
              <div class="han">致&nbsp;${esc(m.to)}</div>
            </div>
          </div>
          <button class="seal locked" id="sealBtn" aria-label="揭开火漆">${sealSVG()}</button>
        </div>
      </div>
      <div class="hint" id="envHint"></div>
      <div class="gate" id="gateBar">
        <label class="cboxWrap"><input type="checkbox" id="gateBox"><span class="cbox"></span></label>
        <span class="txt" id="gateTxt">我同意&nbsp;我已年满20周岁并且阅读并认同<span class="pactLink" id="pactLink">《红鲤鱼公约》</span></span>
        <span class="tip" id="gateTip">（勾选后火漆才会松开）</span>
      </div>`;
    return d;
  }

  function envHint() {
    const h = $("#envHint");
    if (!h) return;
    const arrow = $("#pullArrow");
    if (arrow) arrow.classList.toggle("show", S.opened && !S.pulled);
    if (!S.gateOk) h.innerHTML = `先同意《红鲤鱼公约》`;
    else if (!S.opened) h.innerHTML = `点击火漆 · 拆开信封`;
    else if (!S.pulled) h.innerHTML = `按住信纸 · 向上抽出`;
    else h.innerHTML = "";
  }

  function breakSeal() {
    const env = $("#envBox");
    if (!env || S.opened) return;
    if (!S.gateOk) {                              // 没勾选：火漆摇头
      const s = $("#sealBtn");
      s.classList.remove("noGate"); void s.offsetWidth; s.classList.add("noGate");
      toast("还没有同意《红鲤鱼公约》哦");
      return;
    }
    S.opened = true;
    S.sealBroken = true;                          // 火漆一次性：拆过就不再要求拆
    sfx.crack();                                  // 火漆裂开
    env.classList.add("breaking");
    $("#gateBar").classList.add("gone");
    const vt = document.querySelector(".vignette-text"); if (vt) vt.classList.add("gone");
    setTimeout(() => { env.classList.add("open"); sfx.slide(0.5, 0.4); }, 340);
    setTimeout(() => {
      const b = env.querySelector(".seal-body");
      if (b) { b.style.transition = "transform 1s cubic-bezier(.5,-.15,.6,1), opacity .85s ease .3s";
               b.style.transform = "translate(30px, 250px) rotate(40deg)"; b.style.opacity = "0"; }
    }, 660);
    setTimeout(envHint, 400);
  }

  /* ---------------- 按住 · 拖出信纸 ---------------- */
  function wireDrag() {
    const el = $("#envLetter");
    let drag = null;
    const REST = "translateY(-75%)";

    const pullOut = () => {
      S.pulled = true;
      el.classList.remove("dragging");
      el.style.transition = "transform .6s cubic-bezier(.3,.8,.3,1)";
      el.style.transform = "translateY(-170%)";
      sfx.slide(0.85, 0.6);                       // 信纸抽出来
      envHint();
      setTimeout(() => {
        // 拆封时的"先读哪封"只有第一次问；重置信封后会再问一次
        if (story.qa.afterOpen && !S.qSeen) { S.qSeen = true; askQuestion(story.qa.afterOpen, startReading); }
        else startReading();
      }, 700);
    };

    el.addEventListener("pointerdown", (e) => {
      if (!S.opened || S.pulled) return;
      drag = { y0: e.clientY, x0: e.clientX, dy: 0, t0: Date.now() };
      el.classList.add("dragging");
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* 合成事件时忽略 */ }
      e.preventDefault();
    });
    el.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const dy = clamp(drag.y0 - e.clientY, 0, 330);
      const dx = clamp(e.clientX - drag.x0, -70, 70);
      drag.dy = dy;
      el.style.transform = `translate(${dx * 0.25}px, calc(-75% - ${dy}px)) rotate(${-dx * 0.02}deg)`;
    });
    const end = () => {
      if (!drag) return;
      const { dy, t0 } = drag;
      const quick = Date.now() - t0 < 600 && dy < 24;      // 直接点一下 = 也算抽
      el.classList.remove("dragging");
      drag = null;
      if (dy >= 110 || quick) {
        pullOut();
      } else {
        el.style.transition = "transform .5s cubic-bezier(.3,1.4,.5,1)";
        el.style.transform = REST;
        setTimeout(() => { el.style.transition = ""; }, 520);
      }
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    el.addEventListener("click", () => { if (S.opened && !S.pulled) pullOut(); });
  }

  /* ---------------- 场景二：一叠信纸 ---------------- */
  let sheetEls = [];
  function buildReadScene() {
    const m = story.meta;
    const d = document.createElement("div");
    d.id = "sceneRead"; d.className = "scene hidden";
    d.innerHTML = `
      <div class="topbar">
        <div class="brand">给鲤鱼的一封信<em>${esc(m.toLatin || m.to)}</em></div>
        <div class="tools">
          <button class="ghost icon" id="btnSound" title="音效开关" aria-label="音效开关">
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M3.6 7.6v4.8h2.9l3.9 3.4V4.2L6.5 7.6H3.6Z" fill="currentColor"/>
              <path class="w1" d="M12.6 7.1c1 .9 1.6 1.8 1.6 2.9 0 1.1-.6 2-1.6 2.9" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
              <path class="w2" d="M14.8 4.6c1.7 1.4 2.8 3 2.8 5.4 0 2.4-1.1 4-2.8 5.4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
              <path class="sl" d="M4.2 3.8l11.6 12.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
            </svg>
          </button>
          <button class="ghost" id="btnEnv">回到信封</button>
        </div>
      </div>
      <div class="stage">
        <div class="stack-wrap">
          <div class="stack-block"><div class="edge"></div></div>
          <button class="nav-arrow left" id="navPrev" aria-label="上一张">
            <svg viewBox="0 0 34 40" fill="none"><path d="M27 20H7M14 12 6 20l8 8" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="lb">上一张</span></button>
          <button class="nav-arrow right pulse" id="navNext" aria-label="下一张">
            <svg viewBox="0 0 34 40" fill="none"><path d="M7 20h20M20 12l8 8-8 8" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="lb">下一张</span></button>
          <div class="read-hint" id="readHint">点右边的箭头 · 一张一张读</div>
          <div class="finish-wrap" id="finishWrap">
            <div class="finish-cap">信读完了吗？</div>
            <div class="finish-line">
              <span class="fa left">→</span>
              <button class="finish-btn" id="btnFinish">读完了</button>
              <span class="fa right">←</span>
            </div>
          </div>
        </div>
      </div>`;
    return d;
  }

  function depthOf(i) { const n = S.pages.length; return (i - S.top + n) % n; }

  function layout(skip) {
    const n = S.pages.length;
    sheetEls.forEach((el, i) => {
      if (el === skip) return;
      const d = depthOf(i);
      const dd = Math.min(d, VIS);
      el.style.zIndex = String(n - d);
      el.style.visibility = d > VIS ? "hidden" : "visible";
      el.style.transform = `translate(${dd * 1.4}px, ${dd * 3.2}px) rotate(${(i % 2 ? .14 : -.11)}deg) scale(${1 - dd * .004})`;
    });
    // 底下那摞纸的厚度
    const block = document.querySelector(".stack-block");
    if (block) {
      const deep = clamp(n - 1, 0, VIS);
      block.style.transform = `translate(${6 + deep}px, ${10 + deep * 3.2}px)`;
      block.style.opacity = n > 1 ? "1" : "0";
    }
  }

  const animTo = (el, tf, ms, ease) => new Promise((res) => {
    el.style.transition = `transform ${ms}ms ${ease || "cubic-bezier(.3,.72,.28,1)"}`;
    el.style.transform = tf;
    setTimeout(res, ms);
  });

  async function deal(dir) {
    const n = sheetEls.length;
    if (n < 2) return;
    if (S.busy) { S.pending = dir; return; }     // 手快时记下来，忙完立刻执行，不再丢点击
    sfx.flip(dir > 0 ? 1 : 0.8);                 // 翻纸声
    S.busy = true;
    const outIdx = dir > 0 ? S.top : (S.top + n - 1) % n;
    const el = sheetEls[outIdx];
    el.style.visibility = "visible";
    el.style.zIndex = String(1000 + n);
    el.style.transition = "none";
    if (dir < 0) el.style.transform = `translate(${VIS * 1.4}px, ${VIS * 3.2 + 6}px) rotate(0deg) scale(.995)`;

    if (dir > 0) {
      // 抽出来、放到最下面
      await animTo(el, "translate(82px,-58px) rotate(3.2deg) scale(1.02)", 240);
      S.top = (S.top + 1) % n;
      layout(el);
      await animTo(el, `translate(16px, ${VIS * 3.2 + 10}px) rotate(-1.5deg) scale(.99)`, 380, "cubic-bezier(.4,.05,.3,1)");
      el.style.zIndex = "0";
    } else {
      // 把最下面那张抽上来、落到最上面
      await animTo(el, "translate(-82px,-58px) rotate(-3.2deg) scale(1.02)", 250);
      S.top = (S.top + n - 1) % n;
      layout(el);
      await animTo(el, "translate(0px, 0px) rotate(0deg) scale(1)", 340, "cubic-bezier(.2,1.25,.4,1)");
      el.style.zIndex = String(n);
    }
    el.style.transition = "";
    layout();
    S.seen.add(S.top);
    if (S.seen.size >= n && !$("#finishWrap").classList.contains("show")) {
      $("#finishWrap").classList.add("show");
      const h = $("#readHint");
      h.textContent = "读完了吗？点下面那颗红按钮 ↓";
      h.classList.remove("gone");
    }
    if (S.firstDeal) {
      S.firstDeal = false;
      $("#navNext").classList.remove("pulse");
      if (S.seen.size < n) $("#readHint").classList.add("gone");
    }
    S.busy = false;
    if (S.pending) { const d = S.pending; S.pending = 0; deal(d); }
  }

  async function mountLetter(which, opts) {
    opts = opts || {};
    if (!opts.silent) sfx.slide(0.5, 0.4);                 // 一叠信纸落定
    S.letterIdx = which === "raw" ? 1 : 0;
    document.body.dataset.paper = S.letterIdx ? "green" : "blue";   // 主信青灰，原初版浅绿
    $(".topbar .brand").innerHTML = S.letterIdx
      ? `原初版 · 以一个愚蠢的人为主角<em>${esc(story.meta.toLatin || story.meta.to)}</em>`
      : `给鲤鱼的一封信<em>${esc(story.meta.toLatin || story.meta.to)}</em>`;
    show($("#sceneRead"));                                   // 先让版式成立，才能量出每页容量
    S.pages = paginateByDOM(S.letterIdx ? UNITS_RAW : UNITS_MAIN);
    sheetEls.forEach((e) => e.remove());
    sheetEls = [];
    S.pages.forEach((pg, i) => {
      const el = document.createElement("div");
      el.className = "sheet-layer paper";
      el.dataset.i = i;
      el.innerHTML = sheetHTML(pg, i);
      $(".stack-wrap").insertBefore(el, $("#navPrev"));
      sheetEls.push(el);
    });
    let top = 0;
    if (typeof opts.anchor === "number") {
      S.pages.forEach((pg, i) => { if (pg.frags.some((f) => f.orig === opts.anchor)) top = i; });
    }
    S.top = top; S.seen = new Set([top]); S.firstDeal = true; S.pending = 0;
    layout();
    $("#finishWrap").classList.remove("show");
    $("#navNext").classList.add("pulse");
    if (opts.hintReset !== false) {
      const h = $("#readHint");
      h.textContent = "点右边的箭头 · 一张一张读";
      h.classList.remove("gone");
    }
  }

  function startReading() { mountLetter("main"); }

  /* ---------------- 弹层 ---------------- */
  let overlay = null;
  function openOverlay(innerHTML, closable) {
    closeOverlay();
    const bd = document.createElement("div");
    bd.className = "backdrop";
    bd.innerHTML = `<div class="mcard paper">${innerHTML}</div>`;
    app.appendChild(bd);
    void bd.offsetWidth;              // 强制重排：让过渡生效，且不依赖 requestAnimationFrame
    bd.classList.add("show");
    overlay = bd;
    sfx.flip(0.35);                  // 弹出一张小纸片
    if (closable) {
      bd.dataset.closable = "1";     // 只有可关闭的弹层才允许 Esc 关掉
      bd.querySelectorAll(".close").forEach((x) => x.addEventListener("click", closeOverlay));
      bd.addEventListener("click", (e) => { if (e.target === bd) closeOverlay(); });
    }
    return bd;
  }
  function closeOverlay() {
    if (!overlay) return;
    const o = overlay; overlay = null;
    o.classList.remove("show");
    setTimeout(() => o.remove(), 320);
  }

  function openPact() {
    const g = story.gate;
    const bd = openOverlay(`
      <button class="close">✕</button>
      <div class="mtitle">${esc(g.pactName)}</div>
      <div class="msub">The Red Koi Pact</div>
      <div class="pact-list">${g.pact.map((t) => `<p>${esc(t)}</p>`).join("")}</div>
    `, true);
    return bd;
  }

  function askQuestion(q, onPick) {
    const bd = openOverlay(`
      <div class="mtitle">请选一个</div>
      <div class="msub">A Question</div>
      <p class="ask">${esc(q.ask)}</p>
      <div class="options">
        ${q.options.map((o, i) => `<button class="opt-btn" data-i="${i}"><span>${esc(o)}</span></button>`).join("")}
      </div>`, false);
    bd.querySelectorAll(".opt-btn").forEach((btn) => btn.addEventListener("click", () => {
      const i = +btn.dataset.i;
      closeOverlay();
      setTimeout(() => onPick && onPick(i), 260);
    }));
  }

  function openRisk(cfg, onDone) {
    const bd = openOverlay(`
      <div class="mtitle">风险告知</div>
      <div class="msub">Read at your own risk</div>
      <p class="ask">${esc(cfg.ask)}</p>
      <div class="hintline">${esc(cfg.hint || "")}</div>
      <div class="risk-list">
        ${cfg.items.map((t, i) => `<button class="risk-item" data-i="${i}">
           <span class="bx"></span><span>${esc(t)}</span></button>`).join("")}
      </div>`, false);
    const items = [...bd.querySelectorAll(".risk-item")];
    const on = new Set();
    items[items.length - 1].classList.add("lock");   // 最后一项：前面勾完才可勾
    items.forEach((it, i) => it.addEventListener("click", () => {
      if (it.classList.contains("lock")) return;
      if (on.has(i)) { on.delete(i); it.classList.remove("on"); }
      else { on.add(i); it.classList.add("on"); }
      const restDone = items.slice(0, -1).every((_, k) => on.has(k));
      items[items.length - 1].classList.toggle("lock", !restDone);
      if (on.size === items.length) {
        S.riskOk = true;                              // 已经确认过风险：之后再读原初版就不重复问了
        setTimeout(() => { closeOverlay(); setTimeout(onDone, 300); }, 650);
      }
    }));
  }

  /* 第二封信的最后一道锁：输入暗号才放行 */
  function askPassword(onOk) {
    const L = (story.qa && story.qa.lock) || {};
    if (!L.pass) { onOk && onOk(); return; }              // 没配密码 → 直接放行
    const bd = openOverlay(`
      <div class="mtitle">${esc(L.title || "最后一道锁")}</div>
      <div class="msub">${esc(L.sub || "A Locked Letter")}</div>
      <p class="ask">${esc(L.ask || "")}</p>
      <div class="pw-row">
        <input type="password" id="pwInput" inputmode="numeric" autocomplete="off" maxlength="12" placeholder="· · · · · ·">
        <button class="pw-go" id="pwGo">开封</button>
      </div>
      <div class="pw-err" id="pwErr"></div>`, false);
    const card = bd.querySelector(".mcard");
    const input = bd.querySelector("#pwInput");
    const err = bd.querySelector("#pwErr");
    const tryGo = () => {
      if (input.value.trim() === String(L.pass)) {
        S.passOk = true;
        sfx.press();                                      // 咔哒一声，锁弹开
        closeOverlay();
        setTimeout(() => onOk && onOk(), 300);
      } else {
        err.textContent = L.err || "暗号不对";
        input.value = "";
        sfx.flip(0.25);
        card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake");
        input.focus();
      }
    };
    bd.querySelector("#pwGo").addEventListener("click", tryGo);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); tryGo(); } });
    setTimeout(() => input.focus(), 100);
  }

  /* ---------------- 场景三：落款 ---------------- */
  function endReading() {
    let d = $("#sceneEnd");
    if (!d) {
      d = document.createElement("div");
      d.id = "sceneEnd"; d.className = "scene hidden";
      d.innerHTML = `
        <div class="end-card paper">
          <div class="end-seal">${smallSeal()}</div>
          <div class="flourish" style="justify-content:center"><span class="dia">◆</span></div>
          <div class="end-happy">生日快乐</div>
          <div class="end-to">${esc(story.meta.toLatin || story.meta.to)}</div>
          <div class="end-from">—— ${esc(story.meta.from)}</div>
          <div class="end-btns" id="endBtns"></div>
        </div>`;
      app.appendChild(d);
    }
    // 读过原初版之后，换成"纪念品"一套选项；重置信封 = 把火漆刷回去
    const both = S.rawRead;
    $("#endBtns").innerHTML = both
      ? `<button class="btn-ink" data-act="main">再读正式信</button>
         <button class="btn-ink" data-act="raw">再读原初信</button>
         <button class="btn-ink btn-solid" data-act="reset">重置信封</button>`
      : `<button class="btn-ink" data-act="main">我再细品一下这封信</button>
         <button class="btn-ink" data-act="tuck">放回信封</button>
         <button class="btn-ink btn-solid" data-act="raw">我要阅读原初版本</button>`;
    show(d);
  }

  /* ---------------- 事件 ---------------- */
  function wire() {
    // 公约
    $("#pactLink").addEventListener("click", (e) => { e.stopPropagation(); openPact(); });
    const box = $("#gateBox");
    const syncGate = () => {
      S.gateOk = box.checked;
      $("#gateTip").textContent = S.gateOk ? "（可以开封了）" : "（勾选后火漆才会松开）";
      $("#sealBtn").classList.toggle("locked", !S.gateOk);
      if (S.gateOk) $("#sealBtn").classList.remove("noGate");
      envHint();
    };
    box.addEventListener("change", syncGate);
    $("#gateTxt").addEventListener("click", (e) => {
      if (e.target.id === "pactLink") return;
      box.checked = !box.checked;
      syncGate();
    });

    $("#sealBtn").addEventListener("click", breakSeal);
    wireDrag();

    $("#navNext").addEventListener("click", () => deal(1));
    $("#navPrev").addEventListener("click", () => deal(-1));
    $("#btnFinish").addEventListener("click", finishRead);
    $("#btnEnv").addEventListener("click", () => enterEnv("open"));

    // 音效：首次手势时唤醒音频引擎（浏览器自动播放策略）；右上角可开关
    document.addEventListener("pointerdown", () => sfx.wake(), { once: true });
    $("#btnSound").addEventListener("click", () => {
      const m = sfx.toggle();
      $("#btnSound").classList.toggle("off", m);
      toast(m ? "音效已关闭" : "音效已开启");
      if (!m) sfx.flip(0.5);                              // 开回来时"试听"一下
    });

    document.addEventListener("click", (e) => {
      const a = e.target.closest("[data-act]");
      if (!a) return;
      const act = a.dataset.act;
      if (act === "main") { mountLetter("main"); }
      else if (act === "raw") { goRaw(); }                 // 原初版：没确认过风险 → 先勾选
      else if (act === "tuck") { enterEnv("return"); }     // 放回信封（不再拆火漆）
      else if (act === "reset") { enterEnv("restore"); }   // 重置信封（火漆刷回去）
    });

    document.addEventListener("keydown", (e) => {
      if (overlay) { if (e.key === "Escape" && overlay.dataset.closable === "1") closeOverlay(); return; }
      if ($("#sceneRead").classList.contains("hidden")) return;
      if (e.key === "ArrowRight") $("#navNext").click();
      if (e.key === "ArrowLeft") $("#navPrev").click();
    });

    // 窗口尺寸变化 → 按新的页面容量重新分页，并回到原来的位置
    let rzT = null;
    window.addEventListener("resize", () => {
      clearTimeout(rzT);
      rzT = setTimeout(() => {
        if ($("#sceneRead").classList.contains("hidden")) return;
        const pg = S.pages[S.top];
        const anchor = pg && pg.frags.length ? pg.frags[0].orig : undefined;
        mountLetter(S.letterIdx ? "raw" : "main", { anchor, hintReset: false, silent: true });
      }, 350);
    });
  }

  function goRaw() {                       // 读原初版：先过风险确认，再输暗号
    if (S.riskOk && S.passOk) { mountLetter("raw"); return; }
    const afterLock = () => {
      if (S.passOk) { mountLetter("raw"); return; }
      askPassword(() => mountLetter("raw"));
    };
    if (S.riskOk) { afterLock(); return; }
    openRisk(story.qa.risk, afterLock);
  }

  function finishRead() {
    if (S.letterIdx === 1) { S.rawRead = true; endReading(); return; }   // 原初版读完 → 落款
    if (S.rawRead) { endReading(); return; }                            // 两封都读过 → 直接落款
    askQuestion(story.qa.afterRead, (i) => {
      if (i === 0) goRaw();
      else endReading();
    });
  }

  /* 信封复用：拆过火漆就不再生火漆（生日礼物，是留给她纪念的） */
  function enterEnv(mode) {          // "open"=回到信封 | "return"=放回信纸 | "restore"=重置信封
    const env = $("#envBox"), el = $("#envLetter"), seal = $("#sealBtn");
    const vt = document.querySelector(".vignette-text"); if (vt) vt.classList.add("gone");
    show($("#sceneEnv"));

    if (mode === "restore") {
      // 从"打开"状态开始 → 翻盖合上、信纸缩回、火漆刷回来
      sfx.slide(0.45, 0.9);                                // 翻盖合上
      env.classList.add("breaking", "open");
      el.style.transition = "none";
      el.style.transform = "translateY(-75%)";             // 打开状态的位置
      seal.classList.add("gone");
      const b = env.querySelector(".seal-body");
      if (b) { b.style.transition = "none"; b.style.transform = ""; b.style.opacity = ""; }
      void env.offsetWidth;
      S.opened = false; S.pulled = false; S.sealBroken = false; S.qSeen = false;
      el.style.transition = "";                            // 交回 CSS 的弹性过渡
      el.style.transform = "";                             // 清掉内联 → 去掉 open 就缩回袋里
      env.classList.remove("open");                        // 翻盖合上 + 信纸缩回袋里
      setTimeout(() => {
        env.classList.remove("breaking");                  // 新火漆：没有裂纹
        seal.classList.remove("gone");
        seal.classList.add("rewax");
        sfx.press();                                       // 火漆落定
        setTimeout(() => seal.classList.remove("rewax"), 1000);
      }, 1150);
      envHint(); toast("火漆已经封装回去 · 可以重新拆封了");
      return;
    }

    // open / return：信封开着，不再需要火漆，信纸露着头随时能再抽
    env.classList.add("breaking", "open");
    S.opened = true; S.pulled = false;
    seal.classList.add("gone");
    el.style.transition = "none";
    if (mode === "return") {
      el.style.transform = "translateY(-210%)";            // 先摆到"抽出来"的位置
      void el.offsetWidth;
      el.style.transition = "transform 1s cubic-bezier(.34,1.28,.5,1)";
      el.style.transform = "";                             // 滑回袋口 · 仍露着头可再抽
      sfx.slide(0.7, 0.8);                                 // 信纸滑回信封
      setTimeout(() => { el.style.transition = ""; }, 1100);
      toast("信已经放回信封");
    } else {
      el.style.transform = "";                             // .env.open .env-letter → 露头
      void el.offsetWidth;
      el.style.transition = "";
    }
    envHint();
  }

  /* ---------------- 启动 ---------------- */
  async function init() {
    let res;
    try { res = await fetch("story.json", { cache: "no-store" }); }
    catch (err) {
      document.querySelector("#boot p").textContent = "请用 app.py 或打包后的 exe 打开这封信";
      return;
    }
    story = await res.json();
    UNITS_MAIN = toUnits(story.letters.main || []);
    UNITS_RAW = toUnits(parseRawText(story.letters.raw || ""));

    app.appendChild(buildEnvScene());
    app.appendChild(buildReadScene());
    wire();
    envHint();
    if (dev) $("#devBadge").classList.remove("hidden");
    const boot = $("#boot");
    boot.classList.add("fade");
    setTimeout(() => boot.remove(), 700);
    show($("#sceneEnv"));
  }

  init();
})();
