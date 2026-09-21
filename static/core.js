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

  /* ---------------- data ---------------- */
  let cache = null;
  async function load() {
    if (cache) return cache;
    const [models, status] = await Promise.all([
      fetch("/api/models").then((r) => r.json()),
      fetch("/api/status").then((r) => r.json()).catch(() => []),
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
    const here = location.pathname.replace(/\/$/, "") || "/";
    $$(".nav a, .foot-meta a").forEach((a) => {
      const href = a.getAttribute("href").replace(/\/$/, "") || "/";
      if (href === here) a.setAttribute("aria-current", "page");
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

  return { $, $$, esc, usd, tokens, daysSince, freshness, freshBadge, load, boot, observe,
           PROVIDER_LABEL, CAPS, capMark, capCount };
})();
