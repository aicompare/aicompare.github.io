/* LLMRadar shared core: gate, header, data, formatters, footer. */
window.LR = (function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );

  const usd = (v) => {
    if (v == null) return null;
    return "$" + (v < 1 ? v.toFixed(3).replace(/0$/, "") : v.toFixed(2));
  };

  const tokens = (v) => {
    if (v == null) return null;
    if (v >= 1e6) return (v / 1e6).toFixed(v % 1e6 ? 1 : 0) + "M";
    if (v >= 1e3) return Math.round(v / 1e3) + "K";
    return String(v);
  };

  const daysSince = (iso) => {
    if (!iso) return null;
    return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  };

  /** live (<7d scraped) | verified (<30d) | stale */
  function freshness(m) {
    const d = daysSince(m.scraped_at);
    if (d == null) return { state: "stale", days: null, label: "UNKNOWN" };
    if (m.source === "live" && d < 7) return { state: "live", days: d, label: "LIVE · " + d + "D" };
    if (d < 30) return { state: "verified", days: d, label: "VERIFIED · " + d + "D" };
    return { state: "stale", days: d, label: "STALE · " + d + "D" };
  }

  function freshBadge(m) {
    const f = freshness(m);
    const dotClass = f.state === "live" ? "dot live" : f.state === "verified" ? "dot" : "dot hollow";
    return `<span class="fresh is-${f.state}"><span class="${dotClass}"></span>${f.label}</span>`;
  }

  const PROVIDER_LABEL = {
    anthropic: "Claude", openai: "GPT", google: "Gemini", groq: "Llama", mistral: "Mistral",
    xai: "Grok", deepseek: "DeepSeek", together: "Qwen / Gemma",
  };

  /* Capability matrix: key → [short label, tooltip] */
  const CAPS = [
    ["vision", "Vision", "Accepts image input"],
    ["audio", "Audio", "Accepts or produces audio"],
    ["tools", "Tools", "Function calling / tool use"],
    ["reasoning", "Reasoning", "Dedicated extended-thinking mode"],
    ["caching", "Caching", "Prompt or context caching discount"],
    ["batch", "Batch", "Discounted asynchronous batch API"],
    ["fine_tune", "Fine-tune", "Customisable on your own data"],
    ["open_weights", "Open weights", "Weights downloadable and self-hostable"],
  ];

  const capMark = (m, k) => {
    const c = m.capabilities;
    if (!c || !(k in c)) return '<span class="cap cap-unknown" title="Not recorded">·</span>';
    return c[k]
      ? '<span class="cap cap-yes" title="Supported">✓</span>'
      : '<span class="cap cap-no" title="Not supported">✕</span>';
  };

  const capCount = (m) => (m.capabilities ? Object.values(m.capabilities).filter(Boolean).length : 0);

  /* ---------------- data ----------------
     Base is derived from this script's own URL so the site works at a domain
     root (llmradar.ai) and under a project path (/llmradar/) unchanged. */
  const BASE = (function () {
    const s = document.currentScript;
    return s ? new URL("./", s.src).href : "./";
  })();

  let cache = null;
  async function load() {
    if (cache) return cache;
    const [models, status] = await Promise.all([
      fetch(BASE + "api/models.json").then((r) => r.json()),
      fetch(BASE + "api/status.json").then((r) => r.json()).catch(() => []),
    ]);
    cache = { models, status: Object.fromEntries((status || []).map((s) => [s.provider, s])) };
    return cache;
  }

  /* ---------------- gate ---------------- */
  function gate(onReady) {
    const el = $("#gate");
    if (!el) { onReady(); return; }

    const repeat = sessionStorage.getItem("mr_seen") === "1";
    const counter = $(".gate-counter", el);
    const btn = $(".gate-btn", el);
    const bar = $(".gate-progress", el);
    const label = $(".gate-btn-label", el);
    const duration = repeat ? 700 : 1200;
    const from = repeat ? 62 : 0;

    let pct = from;
    let dataReady = false;
    let pressed = false;
    let minDone = false;
    const start = performance.now();

    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      pct = Math.round(from + (100 - from) * t);
      if (counter) counter.textContent = "SYNCING " + String(pct).padStart(3, "0");
      if (t < 1) requestAnimationFrame(tick);
      else { minDone = true; if (counter) counter.textContent = "SYNC COMPLETE"; maybeLift(); }
    }
    requestAnimationFrame(tick);

    load().then(() => { dataReady = true; maybeLift(); });
    // hard cap so the page never dead-ends
    setTimeout(() => { dataReady = true; maybeLift(); }, 2500);

    function maybeLift() {
      if (!pressed || !dataReady || !minDone) return;
      sessionStorage.setItem("mr_seen", "1");
      el.classList.add("lifting");
      document.body.removeAttribute("aria-busy");
      setTimeout(() => { el.hidden = true; }, 760);
      onReady();
    }

    btn.addEventListener("click", () => {
      if (pressed) return;
      pressed = true;
      if (!dataReady || !minDone) {
        if (label) label.textContent = "Syncing prices…";
        if (bar) bar.style.width = "100%";
      }
      maybeLift();
    });
    document.addEventListener("keydown", (e) => {
      if (!el.hidden && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); btn.click(); }
    });
    btn.focus();
  }

  /* ---------------- header + nav ---------------- */
  function chrome() {
    initTheme();
    const header = $(".site-header");
    if (header) {
      const onScroll = () => header.classList.toggle("scrolled", window.scrollY > 8);
      onScroll();
      window.addEventListener("scroll", onScroll, { passive: true });
    }
    const toggle = $(".nav-toggle");
    const nav = $(".nav");
    if (toggle && nav) {
      toggle.addEventListener("click", () => {
        const open = nav.classList.toggle("open");
        toggle.setAttribute("aria-expanded", String(open));
      });
    }
    // mark current page
    const here = (location.pathname.split("/").pop() || "index.html").replace(/^$/, "index.html");
    $$(".nav a, .foot-meta a").forEach((a) => {
      if (a.getAttribute("href") === here) a.setAttribute("aria-current", "page");
    });
  }

  /* ---------------- header status pill ---------------- */
  function statusPill(models) {
    const el = $(".header-status-text");
    if (!el) return;
    const live = models.filter((m) => freshness(m).state === "live").length;
    el.textContent = `${models.length} MODELS · ${live} LIVE`;
  }

  /* ---------------- scroll reveals ---------------- */
  function observe(selector, cls = "in-view") {
    const els = $$(selector);
    if (!els.length) return;
    if (!("IntersectionObserver" in window)) { els.forEach((e) => e.classList.add(cls)); return; }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add(cls); io.unobserve(e.target); }
      }),
      { rootMargin: "0px 0px -12% 0px" }
    );
    els.forEach((e) => io.observe(e));
  }

  /* ---------------- boot ---------------- */
  function boot(pageInit) {
    chrome();
    const run = () => load().then(({ models, status }) => {
      statusPill(models);
      pageInit(models, status);
    }).catch((err) => {
      console.error(err);
      const host = $("#page-error");
      if (host) host.hidden = false;
    });
    gate(run);
  }

  /* ---------------- sorting ----------------
     Shared by the Models and Compare tabs so both offer identical ordering.
     A leading "-" means descending. Nulls always sort last, whichever way. */
  const SORTS = [
    ["-released", "Latest first"],
    ["input_price", "Cost: low to high"],
    ["-input_price", "Cost: high to low"],
    ["-context_window", "Biggest context"],
    ["-max_output", "Largest output"],
    ["name", "Name A–Z"],
  ];

  function sortModels(list, spec) {
    const desc = spec.startsWith("-");
    const k = desc ? spec.slice(1) : spec;
    return [...list].sort((a, b) => {
      let x = a[k], y = b[k];
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      if (typeof x === "string" || typeof y === "string") {
        const c = String(x).localeCompare(String(y));
        return desc ? -c : c;
      }
      return desc ? y - x : x - y;
    });
  }

  const sortOptions = (selected) =>
    SORTS.map(([v, label]) =>
      `<option value="${v}"${v === selected ? " selected" : ""}>${label}</option>`).join("");

  /* ---------------- theme ---------------- */
  const THEME_KEY = "lr-theme";

  function setTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem(THEME_KEY, t); } catch (e) { /* private mode */ }
    $$(".theme-toggle").forEach((b) =>
      b.setAttribute("aria-label", t === "light" ? "Switch to dark theme" : "Switch to light theme"));
  }

  function initTheme() {
    const current = document.documentElement.getAttribute("data-theme") || "dark";
    setTheme(current);
    $$(".theme-toggle").forEach((b) =>
      b.addEventListener("click", () =>
        setTheme(document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light")));
  }

  /* ---------------- model prose ----------------
     Generated from the structured record rather than hand-written per model,
     so the copy cannot drift out of sync with the data. */
  const PROVIDER_COMPANY = {
    anthropic: "Anthropic", openai: "OpenAI", google: "Google",
    groq: "Groq", mistral: "Mistral", xai: "xAI", deepseek: "DeepSeek",
    together: "Together AI",
  };
  const CATEGORY_PHRASE = {
    reasoning: "reasoning-focused", coding: "coding-focused",
    vision: "vision-focused", general: "general-purpose",
  };

  function describe(m) {
    const co = PROVIDER_COMPANY[m.provider] || m.provider;
    const cat = CATEGORY_PHRASE[m.category] || "general-purpose";
    const out = [`${m.name} is a ${cat} model served by ${co}.`];

    if (m.best_for) {
      const b = m.best_for.replace(/^Ideal for\s+/i, "").replace(/\.$/, "");
      out.push(`It is positioned for ${b.charAt(0).toLowerCase() + b.slice(1)}.`);
    }

    const io = [];
    const c = m.capabilities || {};
    if (c.vision && c.audio) io.push("reads text, images and audio");
    else if (c.vision) io.push("reads text and images");
    else io.push("reads text only");
    if (m.context_window) io.push(`holds up to ${tokens(m.context_window)} tokens in a single prompt`);
    if (m.max_output) io.push(`and can return up to ${tokens(m.max_output)}`);
    out.push("It " + io.join(", ") + ".");

    const supports = [];
    if (c.tools) supports.push("tool calling");
    if (c.reasoning) supports.push("an extended reasoning mode");
    if (c.caching) supports.push("prompt caching");
    if (c.batch) supports.push("batch processing");
    if (c.fine_tune) supports.push("fine-tuning");
    if (supports.length) {
      const last = supports.pop();
      out.push(`Supports ${supports.length ? supports.join(", ") + " and " + last : last}.`);
    }

    if (c.open_weights) out.push("The weights are open, so it can also be self-hosted.");
    out.push(m.free_tier ? `A free tier is available (${m.free_tier.toLowerCase()}).`
                         : "No free tier is offered.");
    return out.join(" ");
  }

  const shortDescribe = (m) => {
    const c = m.capabilities || {};
    const bits = [];
    if (m.best_for) bits.push(m.best_for.replace(/^Ideal for\s+/i, "").replace(/\.$/, ""));
    const extra = [];
    if (m.context_window) extra.push(`${tokens(m.context_window)} context`);
    if (c.vision) extra.push("vision");
    if (c.reasoning) extra.push("reasoning mode");
    if (c.open_weights) extra.push("open weights");
    if (extra.length) bits.push(extra.join(" · "));
    return bits.join(". ") + ".";
  };

  /* ---------------- detail modal ---------------- */
  function openDetail(m) {
    const c = m.capabilities || {};
    const specs = [
      ["Provider", PROVIDER_COMPANY[m.provider] || m.provider],
      ["Type", m.category || "—"],
      ["Context window", tokens(m.context_window) || "—"],
      ["Max output", tokens(m.max_output) || "—"],
      ["Inputs / outputs", m.modalities || "—"],
      ["Free tier", m.free_tier || "None"],
      ["Released", m.released || "Not recorded"],
    ];

    const html = `<div class="modal-root" id="detailroot">
      <div class="modal" role="dialog" aria-modal="true" aria-label="${esc(m.name)} details">
        <div class="detail-head">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px">
            <div>
              <p class="eyebrow">${esc(PROVIDER_COMPANY[m.provider] || m.provider)}${m.category ? " · " + esc(m.category) : ""}</p>
              <h2>${esc(m.name)}</h2>
              <span class="m-id">${esc(m.model_id)}</span>
            </div>
            <button class="modal-close" type="button" aria-label="Close">✕</button>
          </div>
        </div>
        <div class="modal-body detail-body">
          <p class="detail-lede">${esc(describe(m))}</p>

          <div class="detail-sec">
            <h3>Specifications</h3>
            <div class="spec-grid">${specs.map(([k, v]) =>
              `<div class="spec"><span class="sk">${esc(k)}</span><span class="sv">${esc(v)}</span></div>`).join("")}</div>
          </div>

          ${Array.isArray(m.features) && m.features.length ? `
          <div class="detail-sec">
            <h3>Key points</h3>
            <ul class="featlist">${m.features.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
          </div>` : ""}

          <div class="detail-sec">
            <h3>Capabilities</h3>
            <div class="capgrid">${CAPS.map(([k, label]) =>
              `<div class="capitem ${c[k] ? "" : "off"}">${capMark(m, k)} ${esc(label)}</div>`).join("")}</div>
          </div>
        </div>
        <div class="detail-foot">
          <a class="btn" href="compare.html">See pricing &amp; compare</a>
          ${m.url ? `<a class="btn ghost" href="${esc(m.url)}" target="_blank" rel="noopener">Vendor page ↗</a>` : ""}
          <span class="detail-note">${freshness(m).label}</span>
        </div>
      </div>
    </div>`;

    document.body.insertAdjacentHTML("beforeend", html);
    document.documentElement.style.overflow = "hidden";
    const root = $("#detailroot");
    const closeBtn = $(".modal-close", root);
    closeBtn.focus();

    function close() {
      root.remove();
      document.documentElement.style.overflow = "";
      document.removeEventListener("keydown", onKey);
      if (location.hash.startsWith("#model=")) history.replaceState(null, "", location.pathname);
    }
    function onKey(e) {
      if (e.key === "Escape") close();
      if (e.key === "Tab") {
        const f = $$('button, [href], input, select, [tabindex]:not([tabindex="-1"])', root);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    closeBtn.addEventListener("click", close);
    root.addEventListener("click", (e) => { if (e.target === root) close(); });
    document.addEventListener("keydown", onKey);
    history.replaceState(null, "", "#model=" + encodeURIComponent(m.model_id));
  }

  /** Wire every [data-detail] button in a container, plus #model= deep links. */
  function wireDetails(models, container) {
    (container || document).addEventListener("click", (e) => {
      const b = e.target.closest("[data-detail]");
      if (!b) return;
      const m = models.find((x) => x.model_id === b.dataset.detail);
      if (m) openDetail(m);
    });
    const hash = decodeURIComponent((location.hash.match(/^#model=(.+)$/) || [])[1] || "");
    if (hash) {
      const m = models.find((x) => x.model_id === hash);
      if (m) openDetail(m);
    }
  }

  return { $, $$, esc, usd, tokens, daysSince, freshness, freshBadge, load, boot, observe,
           PROVIDER_LABEL, PROVIDER_COMPANY, CAPS, capMark, capCount,
           SORTS, sortModels, sortOptions,
           setTheme, initTheme, describe, shortDescribe, openDetail, wireDetails };
})();
