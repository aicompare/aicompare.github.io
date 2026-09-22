/* Compare page: filterable, sortable index + side-by-side modal. */
LR.boot(function (models) {
  const { $, $$, esc, usd, tokens, freshness, freshBadge, PROVIDER_LABEL } = LR;
  const MAX = 4;
  const MR_CAPS = LR.CAPS;

  const state = {
    view: "pricing",
    provider: "all",
    category: "all",
    cap: "all",
    q: "",
    sort: { key: "input_price", asc: true },
    selected: new Set(),
  };

  const key = (m) => m.provider + "/" + m.model_id;
  const byKey = new Map(models.map((m) => [key(m), m]));

  /* ---------- filters ---------- */
  const providers = [...new Set(models.map((m) => m.provider))].sort();
  $("#chips").innerHTML =
    `<button class="chip active" data-p="all">All</button>` +
    providers.map((p) => `<button class="chip" data-p="${esc(p)}">${esc(PROVIDER_LABEL[p] || p)}</button>`).join("");

  const cats = [...new Set(models.map((m) => m.category).filter(Boolean))].sort();
  $("#category").insertAdjacentHTML("beforeend",
    cats.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join(""));

  $("#capfilter").insertAdjacentHTML("beforeend",
    MR_CAPS.map(([k, label]) => `<option value="${k}">Has ${label.toLowerCase()}</option>`).join(""));
  $("#sortsel").innerHTML = LR.sortOptions("input_price");

  /* ---------- derive ---------- */
  function rows() {
    const q = state.q;
    let out = models.filter((m) =>
      (state.provider === "all" || m.provider === state.provider) &&
      (state.category === "all" || m.category === state.category) &&
      (state.cap === "all" || (m.capabilities && m.capabilities[state.cap])) &&
      (!q || (m.name + " " + m.model_id + " " + m.provider + " " + (m.best_for || "")).toLowerCase().includes(q))
    );
    const { key: k, asc } = state.sort;
    const dir = asc ? 1 : -1;
    out.sort((a, b) => {
      let x, y;
      if (k === "_fresh") { x = LR.daysSince(a.scraped_at); y = LR.daysSince(b.scraped_at); }
      else { x = a[k]; y = b[k]; }
      if (typeof x === "string" || typeof y === "string")
        return String(x || "").localeCompare(String(y || "")) * dir;
      if (x == null) return 1;
      if (y == null) return -1;
      return (x - y) * dir;
    });
    return out;
  }

  /* ---------- feature matrix ---------- */
  function renderMatrix(list) {
    $("#matrixhead").innerHTML =
      `<th style="width:44px"></th><th>Model</th>` +
      LR.CAPS.map(([, label, tip]) => `<th class="capcol" title="${esc(tip)}">${esc(label)}</th>`).join("") +
      `<th class="num">Supported</th>`;

    $("#matrixrows").innerHTML = list.length ? list.map((m) => {
      const k = key(m);
      const sel = state.selected.has(k);
      return `<tr data-k="${esc(k)}" class="${sel ? "sel" : ""}">
        <td><label class="cbx"><input type="checkbox" data-k="${esc(k)}" ${sel ? "checked" : ""}
          aria-label="Compare ${esc(m.name)}"><span class="box"></span></label></td>
        <td><span class="m-name">${esc(m.name)}</span><span class="m-id">${esc(m.provider)}</span></td>
        ${LR.CAPS.map(([ck]) => `<td class="capcol">${LR.capMark(m, ck)}</td>`).join("")}
        <td class="num">${LR.capCount(m)} / ${LR.CAPS.length}</td>
      </tr>`;
    }).join("") : `<tr><td colspan="${LR.CAPS.length + 3}" class="empty">No models match —
      <button class="linkbtn" id="clearfilters2">clear filters</button></td></tr>`;

    const cf = $("#clearfilters2");
    if (cf) cf.addEventListener("click", resetFilters);
  }

  function resetFilters() {
    state.provider = "all"; state.category = "all"; state.q = "";
    $("#search").value = ""; $("#category").value = "all";
    $$(".chip").forEach((c) => c.classList.toggle("active", c.dataset.p === "all"));
    render();
  }

  /* ---------- render ---------- */
  function render(withFlip) {
    const tbody = $("#rows");
    const before = withFlip
      ? new Map($$("tr[data-k]", tbody).map((tr) => [tr.dataset.k, tr.getBoundingClientRect().top]))
      : null;

    const list = rows();
    tbody.innerHTML = list.length ? list.map((m) => {
      const k = key(m);
      const sel = state.selected.has(k);
      return `<tr data-k="${esc(k)}" class="${sel ? "sel" : ""}">
        <td><label class="cbx"><input type="checkbox" data-k="${esc(k)}" ${sel ? "checked" : ""}
          aria-label="Compare ${esc(m.name)}"><span class="box"></span></label></td>
        <td><span class="m-name">${esc(m.name)}</span><span class="m-id">${esc(m.model_id)}</span></td>
        <td class="col-cat">${m.category ? `<span class="cat">${esc(m.category)}</span>` : '<span class="na">—</span>'}</td>
        <td class="col-best"><span class="m-best" title="${esc(m.best_for)}">${esc(m.best_for) || '<span class="na">—</span>'}</span></td>
        <td><span class="m-prov">${esc(m.provider)}</span></td>
        <td class="num">${tokens(m.context_window) || '<span class="na">—</span>'}</td>
        <td class="num price">${usd(m.input_price) || '<span class="na">—</span>'}</td>
        <td class="num price">${usd(m.output_price) || '<span class="na">—</span>'}</td>
        <td class="num">${usd(m.cache_read_price) || '<span class="na">—</span>'}</td>
        <td>${freshBadge(m)}</td>
      </tr>`;
    }).join("") : `<tr><td colspan="10" class="empty">No models match —
      <button class="linkbtn" id="clearfilters">clear filters</button></td></tr>`;

    // FLIP only on explicit sort
    if (before) {
      $$("tr[data-k]", tbody).forEach((tr) => {
        const prev = before.get(tr.dataset.k);
        if (prev == null) return;
        const delta = prev - tr.getBoundingClientRect().top;
        if (!delta) return;
        tr.style.transform = `translateY(${delta}px)`;
        tr.style.transition = "none";
        requestAnimationFrame(() => {
          tr.style.transition = "transform 350ms cubic-bezier(0.22,1,0.36,1)";
          tr.style.transform = "";
        });
      });
    }

    $("#count").textContent = `${list.length} / ${models.length}`;
    const dirWord = state.sort.asc ? "↑" : "↓";
    const label = $(`th[data-k="${state.sort.key}"] button`);
    $("#tablefoot").textContent = state.view === "features"
      ? `${list.length} models · ${LR.CAPS.length} capabilities · curated, hand-checked data`
      : `${list.length} models · sorted by ${label ? label.textContent.replace("▲", "").trim() : state.sort.key} ${dirWord} · source: vendor pricing pages`;

    $$("th[data-k]").forEach((th) => {
      const on = th.dataset.k === state.sort.key;
      if (on) th.setAttribute("aria-sort", state.sort.asc ? "ascending" : "descending");
      else th.removeAttribute("aria-sort");
      const arrow = th.querySelector(".arrow");
      if (arrow) arrow.textContent = state.sort.asc ? "▲" : "▼";
    });

    const cf = $("#clearfilters");
    if (cf) cf.addEventListener("click", resetFilters);

    renderMatrix(list);
  }

  /* ---------- selection ---------- */
  function renderBar() {
    const n = state.selected.size;
    $("#bar").classList.toggle("up", n > 0);
    $("#barlabel").textContent = `${n} / ${MAX} selected`;
    $("#open").disabled = n < 2;
    $("#selchips").innerHTML = [...state.selected].map((k) => {
      const m = byKey.get(k);
      return `<span class="sel-chip">${esc(m.name)}<button type="button" data-k="${esc(k)}" aria-label="Remove ${esc(m.name)}">×</button></span>`;
    }).join("");
  }

  $("#selchips").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-k]");
    if (!b) return;
    state.selected.delete(b.dataset.k);
    render(); renderBar();
  });

  $$(".viewtab").forEach((tab) => tab.addEventListener("click", () => {
    state.view = tab.dataset.view;
    $$(".viewtab").forEach((t) => {
      const on = t === tab;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", String(on));
    });
    const features = state.view === "features";
    $("#view-pricing").hidden = features;
    $("#view-features").hidden = !features;
    $("#note-pricing").hidden = features;
    $("#note-features").hidden = !features;
    render();
  }));

  function onCheck(e) {
    const cb = e.target.closest("input[type=checkbox]");
    if (!cb) return;
    if (cb.checked) {
      if (state.selected.size >= MAX) {
        cb.checked = false;
        const l = $("#barlabel");
        l.textContent = `Max ${MAX} — deselect one first`;
        setTimeout(renderBar, 1400);
        return;
      }
      state.selected.add(cb.dataset.k);
    } else state.selected.delete(cb.dataset.k);
    // keep both views in sync
    $$(`input[data-k="${CSS.escape(cb.dataset.k)}"]`).forEach((other) => {
      other.checked = cb.checked;
      other.closest("tr").classList.toggle("sel", cb.checked);
    });
    renderBar();
  }

  $("#rows").addEventListener("change", onCheck);
  $("#matrixrows").addEventListener("change", onCheck);

  $("#clear").addEventListener("click", () => { state.selected.clear(); render(); renderBar(); });

  /* ---------- modal ---------- */
  function openModal() {
    const chosen = [...state.selected].map((k) => byKey.get(k));
    if (chosen.length < 2) return;

    const best = (k, cmp) => {
      const vals = chosen.map((m) => m[k]).filter((v) => v != null);
      if (!vals.length) return null;
      return vals.reduce(cmp);
    };
    const lo = (k) => best(k, (a, b) => Math.min(a, b));
    const hi = (k) => best(k, (a, b) => Math.max(a, b));

    const ROWS = [
      ["Input $/1M", (m) => usd(m.input_price), "input_price", lo("input_price")],
      ["Output $/1M", (m) => usd(m.output_price), "output_price", lo("output_price")],
      ["Cache read $/1M", (m) => usd(m.cache_read_price), "cache_read_price", lo("cache_read_price")],
      ["Cache write $/1M", (m) => usd(m.cache_write_price), "cache_write_price", lo("cache_write_price")],
      ["Context window", (m) => tokens(m.context_window), "context_window", hi("context_window")],
      ["Max output", (m) => tokens(m.max_output), "max_output", hi("max_output")],
      ["Provider", (m) => m.provider],
      ["Type", (m) => m.category],
      ["Best for", (m) => m.best_for, null, null, true],
      ["Inputs / outputs", (m) => m.modalities, null, null, true],
      ["Free tier", (m) => m.free_tier || "None"],
      ["Released", (m) => m.released || "—"],
      ["Data checked", (m) => freshness(m).label],
    ];

    const capRows = LR.CAPS.map(([k, label, tip]) => `
      <tr class="caprow">
        <th class="rl" title="${esc(tip)}">${esc(label)}</th>
        ${chosen.map((m) => `<td class="capcell">${LR.capMark(m, k)}</td>`).join("")}
      </tr>`).join("");

    const featureRow = `
      <tr class="featrow">
        <th class="rl">Key points</th>
        ${chosen.map((m) => `<td class="prose-cell">${
          Array.isArray(m.features) && m.features.length
            ? `<ul class="featlist">${m.features.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>`
            : '<span class="na">—</span>'
        }</td>`).join("")}
      </tr>`;

    const html = `<div class="modal-root" id="modalroot">
      <div class="modal" role="dialog" aria-modal="true" aria-label="Side by side comparison">
        <div class="modal-head">
          <p class="eyebrow">Side-by-side · ${chosen.length} models</p>
          <button class="modal-close" type="button" aria-label="Close">✕</button>
        </div>
        <div class="modal-body">
          <table>
            <tr><th class="rl"></th>${chosen.map((m) =>
              `<td class="mh">${esc(m.name)}<span>${esc(m.provider)} · ${esc(m.model_id)}</span></td>`).join("")}</tr>
            ${ROWS.map(([label, fn, k, winner, proseCell], i) => `
              <tr style="animation-delay:${i * 40}ms">
                <th class="rl">${label}</th>
                ${chosen.map((m) => {
                  const raw = fn(m);
                  const isWin = k && winner != null && m[k] === winner && chosen.filter((c) => c[k] === winner).length < chosen.length;
                  return `<td class="${proseCell ? "prose-cell" : ""} ${isWin ? "win" : ""}">${raw ? esc(raw) : '<span class="na">—</span>'}</td>`;
                }).join("")}
              </tr>`).join("")}
            <tr class="secrow"><th class="rl">Capabilities</th><td colspan="${chosen.length}"></td></tr>
            ${capRows}
            <tr class="secrow"><th class="rl">Detail</th><td colspan="${chosen.length}"></td></tr>
            ${featureRow}
          </table>
        </div>
      </div>
    </div>`;

    document.body.insertAdjacentHTML("beforeend", html);
    document.documentElement.style.overflow = "hidden";
    const root = $("#modalroot");
    const closeBtn = $(".modal-close", root);
    closeBtn.focus();

    function close() {
      root.remove();
      document.documentElement.style.overflow = "";
      $("#open").focus();
      document.removeEventListener("keydown", onKey);
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
  }

  $("#open").addEventListener("click", openModal);

  /* ---------- controls ---------- */
  $("#chips").addEventListener("click", (e) => {
    const c = e.target.closest(".chip");
    if (!c) return;
    state.provider = c.dataset.p;
    $$(".chip").forEach((x) => x.classList.toggle("active", x === c));
    render();
  });

  $("#category").addEventListener("change", (e) => { state.category = e.target.value; render(); });
  $("#capfilter").addEventListener("change", (e) => { state.cap = e.target.value; render(); });
  $("#sortsel").addEventListener("change", (e) => {
    const v = e.target.value;
    state.sort = { key: v.replace(/^-/, ""), asc: !v.startsWith("-") };
    render(true);
  });

  let t;
  $("#search").addEventListener("input", (e) => {
    clearTimeout(t);
    const v = e.target.value.trim().toLowerCase();
    t = setTimeout(() => { state.q = v; render(); }, 120);
  });

  $$("th[data-k] button").forEach((b) => b.addEventListener("click", () => {
    const k = b.closest("th").dataset.k;
    if (state.sort.key === k) state.sort.asc = !state.sort.asc;
    else state.sort = { key: k, asc: true };
    const spec = (state.sort.asc ? "" : "-") + state.sort.key;
    const sel = $("#sortsel");
    if (sel) sel.value = [...sel.options].some((o) => o.value === spec) ? spec : "";
    render(true);
  }));

  render();
  renderBar();
});
