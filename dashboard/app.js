(function () {
  "use strict";

  const cfg = window.TUIK_DASHBOARD_CONFIG;
  const GTIP_NAMES = {
    "100590000019": "1005.90.00.00.19 MISIR",
    "120190000000": "1201.90.00.00.00 SOYA FASULYESİ",
    "110430900011": "1104.30.90.00.11 MISIR ÖZÜ",
    "230400000000": "2304.00.00.00.00 SOYA KÜSPESİ",
    "120600990019": "1206.00.99.00.19 ÇEKİRDEK",
  };
  const FLOW_LABEL = ["İhracat", "İthalat"];
  const FLOW_COLOR = ["var(--series-export)", "var(--series-import)"];
  const CAT_COLORS = ["var(--series-export)", "var(--series-import)", "var(--cat-3)", "var(--cat-4)", "var(--cat-5)"];

  // ---------- status ----------
  function setStatus(text, ok) {
    const dot = document.getElementById("status-dot");
    const label = document.getElementById("status-text");
    label.textContent = text;
    dot.style.background = ok ? "var(--good)" : "var(--bad)";
  }

  // ---------- live data ----------
  async function fetchAllRows() {
    const headers = { apikey: cfg.SUPABASE_ANON_KEY, Authorization: `Bearer ${cfg.SUPABASE_ANON_KEY}` };
    const pageSize = 1000;
    let rows = [];
    let from = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const res = await fetch(
        `${cfg.SUPABASE_URL}/rest/v1/trade_stats?select=period_year,period_month,flow,gtip_code,country_code,country_name,value_usd,weight_kg&order=id.asc`,
        { headers: Object.assign({}, headers, { Range: `${from}-${from + pageSize - 1}` }) }
      );
      if (!res.ok) throw new Error(`Supabase istek hatası: ${res.status}`);
      const page = await res.json();
      rows = rows.concat(page);
      if (page.length < pageSize) break;
      from += pageSize;
    }
    const reportRes = await fetch(
      `${cfg.SUPABASE_URL}/rest/v1/daily_reports?select=*&order=report_date.desc&limit=1`,
      { headers }
    );
    const reports = reportRes.ok ? await reportRes.json() : [];
    return {
      rows: rows.map(r => [
        r.period_year,
        r.flow === "import" ? 1 : 0,
        r.gtip_code,
        r.country_code,
        r.country_name || "Bilinmiyor",
        r.value_usd,
        r.weight_kg,
        r.period_month,
      ]),
      report: reports[0] || null,
    };
  }

  // Renders the small, fixed markdown subset build_report() (reports/daily_report.py)
  // actually produces: #/##/### headings, "- " bullet lists, **bold**, blank-line breaks.
  // A generic markdown library is overkill for one known, self-authored source.
  function renderInlineMd(text) {
    const frag = document.createDocumentFragment();
    const re = /\*\*(.+?)\*\*/g;
    let last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      const strong = document.createElement("strong");
      strong.textContent = m[1];
      frag.appendChild(strong);
      last = re.lastIndex;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    return frag;
  }

  function renderReport(report) {
    const el = document.getElementById("report-body");
    el.textContent = "";
    if (!report) {
      el.textContent = "Henüz rapor üretilmedi.";
      return;
    }

    let ul = null;
    const closeList = () => { ul = null; };

    for (const raw of report.summary_md.split("\n")) {
      // bullet lines reference bare GTİP codes ("- 100590000019: $…") — show the
      // same "kod AD" label used everywhere else in the report instead of a bare code.
      const line = raw.replace(/\b(\d{12})\b/g, code => GTIP_NAMES[code] || code);
      let m;
      if (!line.trim()) {
        closeList();
      } else if ((m = /^### (.+)/.exec(line))) {
        closeList();
        const h = document.createElement("h4");
        h.className = "report-h3";
        h.appendChild(renderInlineMd(m[1]));
        el.appendChild(h);
      } else if ((m = /^## (.+)/.exec(line))) {
        closeList();
        const h = document.createElement("h3");
        h.className = "report-h2";
        h.appendChild(renderInlineMd(m[1]));
        el.appendChild(h);
      } else if ((m = /^# (.+)/.exec(line))) {
        closeList();
        const h = document.createElement("div");
        h.className = "report-h1";
        h.appendChild(renderInlineMd(m[1]));
        el.appendChild(h);
      } else if ((m = /^- (.+)/.exec(line))) {
        if (!ul) { ul = document.createElement("ul"); ul.className = "report-list"; el.appendChild(ul); }
        const li = document.createElement("li");
        li.appendChild(renderInlineMd(m[1]));
        ul.appendChild(li);
      } else {
        closeList();
        const p = document.createElement("p");
        p.appendChild(renderInlineMd(line));
        el.appendChild(p);
      }
    }
  }

  // ---------- theme (works immediately, doesn't need data) ----------
  document.getElementById("theme-toggle").addEventListener("click", () => {
    const root = document.documentElement;
    const current = root.getAttribute("data-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const next = current === "dark" ? "light" : current === "light" ? (prefersDark ? "dark" : "light") : (prefersDark ? "light" : "dark");
    root.setAttribute("data-theme", next);
  });

  function init(RAW, report) {

    const countryNames = {};
    RAW.forEach(r => { if (!countryNames[r[3]]) countryNames[r[3]] = r[4]; });
    const allCountries = Object.keys(countryNames).sort((a, b) => countryNames[a].localeCompare(countryNames[b], "tr"));
    const allProducts = Object.keys(GTIP_NAMES);
    const allYears = [...new Set(RAW.map(r => r[0]))].sort((a, b) => b - a);
    const maxYear = allYears[0];

    const state = {
      flow: "all",
      year: String(maxYear),
      products: new Set(),
      countries: new Set(),
      groupDims: new Set(["product", "country"]),
      tableSort: { key: "usd", dir: "desc" },
      tableSearch: "",
      trendZoom: null, // null = full range, else [startYear, endYear]
    };

    const DIMENSIONS = {
      product: { label: "Ürün", get: r => r[2], display: v => GTIP_NAMES[v] || v },
      country: { label: "Ülke", get: r => r[3], display: v => countryNames[v] || v },
      year: { label: "Yıl", get: r => r[0], display: v => String(v) },
      flow: { label: "Yön", get: r => r[1], display: v => FLOW_LABEL[v] },
    };
    const DIM_ORDER = ["product", "country", "year", "flow"];

    function fmtUsd(v) {
      if (v == null || isNaN(v)) return "—";
      const a = Math.abs(v);
      if (a >= 1e9) return "$" + (v / 1e9).toFixed(2) + "B";
      if (a >= 1e6) return "$" + (v / 1e6).toFixed(1) + "M";
      if (a >= 1e3) return "$" + (v / 1e3).toFixed(1) + "K";
      return "$" + v.toFixed(0);
    }
    function fmtUsdFull(v) {
      if (v == null || isNaN(v)) return "—";
      return "$" + Math.round(v).toLocaleString("tr-TR");
    }
    function fmtKg(v) {
      if (v == null || isNaN(v)) return "—";
      const ton = v / 1000;
      const a = Math.abs(ton);
      if (a >= 1e6) return (ton / 1e6).toFixed(2) + "M ton";
      if (a >= 1e3) return (ton / 1e3).toFixed(1) + "K ton";
      if (a >= 1) return ton.toFixed(1) + " ton";
      return v.toFixed(0) + " kg";
    }
    // birim fiyat = toplam değer / toplam miktar ($/ton)
    function fmtUnitPrice(v) {
      if (v == null || isNaN(v)) return "—";
      return "$" + v.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "/ton";
    }

    // ---------- filtering ----------
    function filteredRows() {
      return RAW.filter(r => {
        if (state.flow !== "all" && String(r[1]) !== state.flow) return false;
        if (state.year !== "all" && r[0] !== Number(state.year)) return false;
        if (state.products.size && !state.products.has(r[2])) return false;
        if (state.countries.size && !state.countries.has(r[3])) return false;
        return true;
      });
    }
    // trend chart ignores the year filter so the timeline stays visible
    function filteredRowsAllYears() {
      return RAW.filter(r => {
        if (state.flow !== "all" && String(r[1]) !== state.flow) return false;
        if (state.products.size && !state.products.has(r[2])) return false;
        if (state.countries.size && !state.countries.has(r[3])) return false;
        return true;
      });
    }

    function computeGroups(rows, dims) {
      const map = new Map();
      for (const r of rows) {
        const parts = dims.map(d => DIMENSIONS[d].get(r));
        const key = parts.join("§");
        let entry = map.get(key);
        if (!entry) { entry = { parts, usd: 0, kg: 0, n: 0 }; map.set(key, entry); }
        entry.usd += r[5] || 0;
        entry.kg += r[6] || 0;
        entry.n++;
      }
      return [...map.values()];
    }

    // ---------- KPIs ----------
    function renderKpis() {
      const rows = filteredRows();
      const exp = rows.filter(r => r[1] === 0).reduce((s, r) => s + (r[5] || 0), 0);
      const imp = rows.filter(r => r[1] === 1).reduce((s, r) => s + (r[5] || 0), 0);
      const net = exp - imp;

      let yoyExp = null, yoyImp = null;
      if (state.year !== "all") {
        const prevYear = Number(state.year) - 1;
        const prevRows = RAW.filter(r => {
          if (r[0] !== prevYear) return false;
          if (state.flow !== "all" && String(r[1]) !== state.flow) return false;
          if (state.products.size && !state.products.has(r[2])) return false;
          if (state.countries.size && !state.countries.has(r[3])) return false;
          return true;
        });
        const prevExp = prevRows.filter(r => r[1] === 0).reduce((s, r) => s + (r[5] || 0), 0);
        const prevImp = prevRows.filter(r => r[1] === 1).reduce((s, r) => s + (r[5] || 0), 0);
        if (prevExp) yoyExp = ((exp - prevExp) / prevExp) * 100;
        if (prevImp) yoyImp = ((imp - prevImp) / prevImp) * 100;
      }

      const countries = new Set(rows.map(r => r[3])).size;
      const products = new Set(rows.map(r => r[2])).size;

      const tiles = [
        { label: "Toplam İhracat" + (state.year === "all" ? " (tüm yıllar)" : " (" + state.year + ")"), value: fmtUsd(exp), delta: yoyExp },
        { label: "Toplam İthalat" + (state.year === "all" ? " (tüm yıllar)" : " (" + state.year + ")"), value: fmtUsd(imp), delta: yoyImp },
        { label: "Net (İhracat − İthalat)", value: (net >= 0 ? "+" : "") + fmtUsd(net), delta: null },
        { label: "Kapsanan ülke", value: String(countries), delta: null },
        { label: "Kapsanan ürün", value: String(products), delta: null },
        { label: "Filtrelenen kayıt", value: rows.length.toLocaleString("tr-TR"), delta: null },
      ];

      const container = document.getElementById("kpi-row");
      container.textContent = "";
      for (const t of tiles) {
        const tile = document.createElement("div");
        tile.className = "stat-tile";
        const label = document.createElement("div");
        label.className = "label"; label.textContent = t.label;
        const value = document.createElement("div");
        value.className = "value num"; value.textContent = t.value;
        tile.appendChild(label); tile.appendChild(value);
        if (t.delta != null) {
          const d = document.createElement("div");
          const dir = t.delta > 0.05 ? "up" : t.delta < -0.05 ? "down" : "flat";
          d.className = "delta " + dir;
          d.textContent = (t.delta >= 0 ? "▲ " : "▼ ") + Math.abs(t.delta).toFixed(1) + "% YoY";
          tile.appendChild(d);
        }
        container.appendChild(tile);
      }
    }

    // ---------- filter controls ----------
    function buildYearSelect() {
      const sel = document.getElementById("year-select");
      sel.textContent = "";
      const optAll = document.createElement("option");
      optAll.value = "all"; optAll.textContent = "Tüm Yıllar (Toplam)";
      sel.appendChild(optAll);
      for (const y of allYears) {
        const opt = document.createElement("option");
        opt.value = String(y); opt.textContent = String(y);
        sel.appendChild(opt);
      }
      sel.value = state.year;
      sel.addEventListener("change", () => { state.year = sel.value; renderAll(); });
    }

    function buildFlowFilter() {
      const wrap = document.getElementById("flow-filter");
      wrap.querySelectorAll(".seg").forEach(btn => {
        btn.addEventListener("click", () => {
          state.flow = btn.dataset.value;
          wrap.querySelectorAll(".seg").forEach(b => b.classList.toggle("active", b === btn));
          renderAll();
        });
      });
    }

    function buildProductChips() {
      const wrap = document.getElementById("product-chips");
      wrap.textContent = "";
      allProducts.forEach((code, i) => {
        const chip = document.createElement("button");
        chip.className = "chip";
        chip.type = "button";
        const sw = document.createElement("span");
        sw.className = "swatch";
        sw.style.background = CAT_COLORS[i % CAT_COLORS.length];
        chip.appendChild(sw);
        chip.appendChild(document.createTextNode(GTIP_NAMES[code] || code));
        chip.addEventListener("click", () => {
          if (state.products.has(code)) state.products.delete(code); else state.products.add(code);
          chip.classList.toggle("active");
          renderAll();
        });
        wrap.appendChild(chip);
      });
    }

    function renderCountrySelected() {
      const wrap = document.getElementById("country-selected");
      wrap.textContent = "";
      [...state.countries].sort((a, b) => (countryNames[a] || "").localeCompare(countryNames[b] || "", "tr")).forEach(code => {
        const chip = document.createElement("button");
        chip.className = "chip active";
        chip.type = "button";
        chip.appendChild(document.createTextNode(countryNames[code] || code));
        const x = document.createElement("span");
        x.className = "x"; x.textContent = " ✕";
        chip.appendChild(x);
        chip.addEventListener("click", () => { state.countries.delete(code); renderAll(); });
        wrap.appendChild(chip);
      });
    }

    function buildCountrySearch() {
      const datalist = document.getElementById("country-datalist");
      datalist.textContent = "";
      allCountries.forEach(code => {
        const opt = document.createElement("option");
        opt.value = countryNames[code];
        datalist.appendChild(opt);
      });
      const input = document.getElementById("country-search");
      input.addEventListener("change", () => {
        const val = input.value.trim();
        const match = allCountries.find(c => countryNames[c].toLowerCase() === val.toLowerCase());
        if (match) { state.countries.add(match); input.value = ""; renderAll(); }
      });
    }

    function buildGroupControls() {
      const wrap = document.getElementById("group-controls");
      wrap.textContent = "";
      DIM_ORDER.forEach(dim => {
        const btn = document.createElement("button");
        btn.className = "dim-toggle" + (state.groupDims.has(dim) ? " active" : "");
        btn.type = "button";
        btn.textContent = DIMENSIONS[dim].label;
        btn.addEventListener("click", () => {
          if (state.groupDims.has(dim)) state.groupDims.delete(dim); else state.groupDims.add(dim);
          btn.classList.toggle("active");
          renderAll();
        });
        wrap.appendChild(btn);
      });
    }

    document.getElementById("reset-filters").addEventListener("click", () => {
      state.flow = "all"; state.year = String(maxYear);
      state.products.clear(); state.countries.clear();
      document.querySelectorAll("#flow-filter .seg").forEach(b => b.classList.toggle("active", b.dataset.value === "all"));
      document.getElementById("year-select").value = String(maxYear);
      document.querySelectorAll("#product-chips .chip").forEach(c => c.classList.remove("active"));
      renderAll();
    });

    // ---------- tooltip ----------
    function makeTooltip() {
      let el = document.querySelector(".tooltip");
      if (!el) { el = document.createElement("div"); el.className = "tooltip"; document.body.appendChild(el); }
      return el;
    }
    function showTooltip(evt, node) {
      const tip = makeTooltip();
      tip.textContent = ""; tip.appendChild(node);
      tip.style.opacity = "1";
      let x = evt.clientX + 14, y = evt.clientY + 14;
      tip.style.left = x + "px"; tip.style.top = y + "px";
      const rect = tip.getBoundingClientRect();
      if (rect.right > window.innerWidth) tip.style.left = (evt.clientX - rect.width - 14) + "px";
      if (rect.bottom > window.innerHeight) tip.style.top = (evt.clientY - rect.height - 14) + "px";
    }
    function hideTooltip() { const t = document.querySelector(".tooltip"); if (t) t.style.opacity = "0"; }

    // ---------- top-N bar chart ----------
    function renderTopChart() {
      const rows = filteredRows();
      const dims = [...state.groupDims].length ? [...state.groupDims] : ["product"];
      const groups = computeGroups(rows, dims).sort((a, b) => b.usd - a.usd).slice(0, 10);

      document.getElementById("top-chart-title").textContent =
        "İlk 10 — " + dims.map(d => DIMENSIONS[d].label).join(" × ") + (state.year === "all" ? " (tüm yıllar)" : " (" + state.year + ")");

      const svg = document.getElementById("top-chart");
      svg.textContent = "";
      if (!groups.length) {
        svg.setAttribute("viewBox", "0 0 520 60");
        const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
        t.setAttribute("x", 10); t.setAttribute("y", 30); t.setAttribute("class", "axis-label");
        t.textContent = "Bu filtrelerle veri yok.";
        svg.appendChild(t);
        return;
      }

      const twoLine = dims.length > 1;
      const rowH = twoLine ? 38 : 28, gap = 4, padL = 220, padR = 64, padTop = 6;
      const barH = 20;
      const width = 590;
      const height = groups.length * (rowH + gap) + padTop;
      svg.setAttribute("viewBox", "0 0 " + width + " " + height);

      const maxVal = Math.max(...groups.map(g => g.usd), 1);
      const barMax = width - padL - padR;

      function truncate(s, n) { return s.length > n ? s.slice(0, n - 2) + "…" : s; }

      groups.forEach((g, i) => {
        const y = padTop + i * (rowH + gap);
        const barW = Math.max(3, (g.usd / maxVal) * barMax);
        const parts = g.parts.map((p, j) => DIMENSIONS[dims[j]].display(p));
        const label = parts.join(" · ");

        if (twoLine) {
          // primary dimension (e.g. Ürün) on its own line, the rest (e.g. Ülke) below it —
          // a single truncated "Ürün · Ülke" string was hiding the second dimension entirely
          // whenever the first one alone was already long.
          const line1 = document.createElementNS("http://www.w3.org/2000/svg", "text");
          line1.setAttribute("x", padL - 10); line1.setAttribute("y", y + rowH / 2 - 5);
          line1.setAttribute("text-anchor", "end"); line1.setAttribute("class", "bar-label");
          line1.textContent = truncate(parts[0], 30);
          svg.appendChild(line1);

          const line2 = document.createElementNS("http://www.w3.org/2000/svg", "text");
          line2.setAttribute("x", padL - 10); line2.setAttribute("y", y + rowH / 2 + 10);
          line2.setAttribute("text-anchor", "end"); line2.setAttribute("class", "axis-label");
          line2.textContent = truncate(parts.slice(1).join(" · "), 30);
          svg.appendChild(line2);
        } else {
          const labelT = document.createElementNS("http://www.w3.org/2000/svg", "text");
          labelT.setAttribute("x", padL - 10); labelT.setAttribute("y", y + rowH / 2 + 4);
          labelT.setAttribute("text-anchor", "end"); labelT.setAttribute("class", "bar-label");
          labelT.textContent = truncate(label, 32);
          svg.appendChild(labelT);
        }

        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("x", padL); rect.setAttribute("y", y + (rowH - barH) / 2);
        rect.setAttribute("width", barW); rect.setAttribute("height", barH);
        rect.setAttribute("rx", 4); rect.setAttribute("fill", "var(--series-export)");
        rect.style.cursor = "pointer";
        rect.tabIndex = 0;
        const showFn = (evt) => {
          const wrap = document.createElement("div");
          const ttl = document.createElement("div"); ttl.className = "ttl"; ttl.textContent = label;
          wrap.appendChild(ttl);
          const row1 = document.createElement("div"); row1.className = "row";
          const v1 = document.createElement("span"); v1.className = "val"; v1.textContent = fmtUsdFull(g.usd);
          row1.appendChild(v1); row1.appendChild(document.createTextNode(" toplam değer"));
          wrap.appendChild(row1);
          const row2 = document.createElement("div"); row2.className = "row";
          const v2 = document.createElement("span"); v2.className = "val"; v2.textContent = fmtKg(g.kg);
          row2.appendChild(v2); row2.appendChild(document.createTextNode(" toplam miktar"));
          wrap.appendChild(row2);
          showTooltip(evt, wrap);
        };
        rect.addEventListener("pointermove", showFn);
        rect.addEventListener("focus", showFn);
        rect.addEventListener("pointerleave", hideTooltip);
        rect.addEventListener("blur", hideTooltip);
        svg.appendChild(rect);

        const valT = document.createElementNS("http://www.w3.org/2000/svg", "text");
        valT.setAttribute("x", padL + barW + 8); valT.setAttribute("y", y + rowH / 2 + 4);
        valT.setAttribute("class", "bar-value");
        valT.textContent = fmtUsd(g.usd);
        svg.appendChild(valT);
      });
    }

    // ---------- month trend line chart (zoomable: wheel to zoom, drag to select a range) ----------
    const TREND_W = 560, TREND_H = 220, TREND_PADL = 60, TREND_PADR = 16, TREND_PADT = 12, TREND_PADB = 26;
    const MONTH_ABBR = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
    const MONTH_FULL = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

    // period "key" = ay çözünürlüğünde tek bir sıralanabilir tamsayı (year*12 + monthIndex0).
    // Kaynak artık her satırda ay bilgisi veriyor (bkz. qlik_client.py); eski period_month
    // NULL bir satır sızarsa Ocak'a düşürülür ki eksene tek bir nokta olarak girsin.
    function periodKey(year, month) { return year * 12 + ((month || 1) - 1); }
    function periodFromKey(key) {
      const month = (((key % 12) + 12) % 12) + 1;
      return { year: (key - (month - 1)) / 12, month };
    }
    function periodLabelShort(key) { const p = periodFromKey(key); return MONTH_ABBR[p.month - 1] + " " + String(p.year).slice(2); }
    function periodLabelFull(key) { const p = periodFromKey(key); return MONTH_FULL[p.month - 1] + " " + p.year; }

    function trendPeriodsFull() {
      const keys = new Set();
      RAW.forEach(r => keys.add(periodKey(r[0], r[7])));
      return [...keys].sort((a, b) => a - b);
    }

    function trendVisiblePeriods() {
      const full = trendPeriodsFull();
      if (!state.trendZoom) return full;
      const [a, b] = state.trendZoom;
      const sliced = full.filter(k => k >= a && k <= b);
      return sliced.length >= 2 ? sliced : full;
    }

    function trendXStep(periods) {
      return periods.length > 1 ? (TREND_W - TREND_PADL - TREND_PADR) / (periods.length - 1) : 0;
    }

    function svgPoint(svg, evt) {
      const pt = svg.createSVGPoint();
      pt.x = evt.clientX; pt.y = evt.clientY;
      const ctm = svg.getScreenCTM();
      if (!ctm) return { x: 0, y: 0 };
      const loc = pt.matrixTransform(ctm.inverse());
      return { x: loc.x, y: loc.y };
    }

    function setTrendZoom(range) {
      const full = trendPeriodsFull();
      if (full.length < 2 || !range) {
        state.trendZoom = null;
      } else {
        const minKey = full[0], maxKey = full[full.length - 1];
        let [a, b] = range;
        if (a > b) { const t = a; a = b; b = t; }
        if (b - a < 2) { a = Math.max(minKey, b - 2); b = a + 2; }
        a = Math.max(minKey, Math.round(a)); b = Math.min(maxKey, Math.round(b));
        state.trendZoom = (a <= minKey && b >= maxKey) ? null : [a, b];
      }
      const btn = document.getElementById("trend-zoom-reset");
      if (btn) btn.style.display = state.trendZoom ? "inline-flex" : "none";
      renderTrendChart();
    }

    function renderTrendChart() {
      const rows = filteredRowsAllYears();
      const showBoth = state.flow === "all";
      const flowsToShow = showBoth ? [0, 1] : [Number(state.flow)];

      const legend = document.getElementById("trend-legend");
      legend.textContent = "";
      if (showBoth) {
        flowsToShow.forEach(f => {
          const key = document.createElement("span"); key.className = "key";
          const sw = document.createElement("span"); sw.className = "swatch-line";
          sw.style.background = FLOW_COLOR[f];
          key.appendChild(sw); key.appendChild(document.createTextNode(FLOW_LABEL[f]));
          legend.appendChild(key);
        });
      }

      const svg = document.getElementById("trend-chart");
      svg.textContent = "";
      svg.setAttribute("viewBox", "0 0 " + TREND_W + " " + TREND_H);

      const totalsByFlow = flowsToShow.map(f => {
        const m = new Map();
        rows.filter(r => r[1] === f).forEach(r => {
          const key = periodKey(r[0], r[7]);
          m.set(key, (m.get(key) || 0) + (r[5] || 0));
        });
        return m;
      });
      const periods = trendVisiblePeriods();
      const maxVal = Math.max(1, ...flowsToShow.map((f, fi) => Math.max(0, ...periods.map(k => totalsByFlow[fi].get(k) || 0))));
      const xStep = trendXStep(periods);
      const xScale = i => TREND_PADL + i * xStep;
      const yScale = v => TREND_H - TREND_PADB - (v / maxVal) * (TREND_H - TREND_PADB - TREND_PADT);

      for (let g = 0; g <= 3; g++) {
        const y = TREND_PADT + (g * (TREND_H - TREND_PADB - TREND_PADT)) / 3;
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("class", "gridline");
        line.setAttribute("x1", TREND_PADL); line.setAttribute("x2", TREND_W - TREND_PADR);
        line.setAttribute("y1", y); line.setAttribute("y2", y);
        svg.appendChild(line);
        const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
        t.setAttribute("x", TREND_PADL - 8); t.setAttribute("y", y + 3);
        t.setAttribute("text-anchor", "end"); t.setAttribute("class", "axis-label");
        t.textContent = fmtUsd(maxVal - (g * maxVal) / 3);
        svg.appendChild(t);
      }

      // zoomed out (>3 yıl görünürde): sadece Ocak ayı noktalarında yıl etiketi göster
      // (yıllık grafiğin eski, temiz görünümü); yakınlaşınca ay+yıl etiketine geçer.
      const showMonthTicks = periods.length <= 36;
      const tickEvery = Math.max(1, Math.ceil(periods.length / 8));
      periods.forEach((key, i) => {
        const p = periodFromKey(key);
        const isLast = i === periods.length - 1;
        const show = showMonthTicks ? (i % tickEvery === 0 || isLast) : (p.month === 1 || isLast);
        if (!show) return;
        const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
        t.setAttribute("x", xScale(i)); t.setAttribute("y", TREND_H - 6);
        t.setAttribute("text-anchor", "middle"); t.setAttribute("class", "axis-label");
        t.textContent = showMonthTicks ? periodLabelShort(key) : String(p.year);
        svg.appendChild(t);
      });

      const hoverLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
      hoverLine.setAttribute("class", "baseline");
      hoverLine.setAttribute("y1", TREND_PADT); hoverLine.setAttribute("y2", TREND_H - TREND_PADB);
      hoverLine.style.opacity = "0";
      svg.appendChild(hoverLine);

      flowsToShow.forEach((f, fi) => {
        const totals = totalsByFlow[fi];
        const pts = periods.map((k, i) => [xScale(i), yScale(totals.get(k) || 0)]);
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", pts.map((p, i) => (i === 0 ? "M" : "L") + p[0] + "," + p[1]).join(" "));
        path.setAttribute("stroke", FLOW_COLOR[f]); path.setAttribute("stroke-width", "2");
        path.setAttribute("fill", "none"); path.setAttribute("stroke-linejoin", "round"); path.setAttribute("stroke-linecap", "round");
        svg.appendChild(path);
      });

      const hitLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
      periods.forEach((key, i) => {
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        const hitW = Math.max(xStep, 6);
        rect.setAttribute("x", xScale(i) - hitW / 2); rect.setAttribute("y", TREND_PADT);
        rect.setAttribute("width", hitW); rect.setAttribute("height", TREND_H - TREND_PADB - TREND_PADT);
        rect.setAttribute("fill", "transparent"); rect.style.cursor = "crosshair";
        rect.tabIndex = 0;
        const showFn = evt => {
          if (trendDrag) return;
          hoverLine.setAttribute("x1", xScale(i)); hoverLine.setAttribute("x2", xScale(i));
          hoverLine.style.opacity = "1";
          const wrap = document.createElement("div");
          const ttl = document.createElement("div"); ttl.className = "ttl"; ttl.textContent = periodLabelFull(key);
          wrap.appendChild(ttl);
          flowsToShow.forEach((f, fi) => {
            const val = totalsByFlow[fi].get(key) || 0;
            const row = document.createElement("div"); row.className = "row";
            const keyLine = document.createElement("span"); keyLine.className = "key-line"; keyLine.style.background = FLOW_COLOR[f];
            const v = document.createElement("span"); v.className = "val"; v.textContent = fmtUsdFull(val);
            row.appendChild(keyLine); row.appendChild(v); row.appendChild(document.createTextNode(" " + FLOW_LABEL[f]));
            wrap.appendChild(row);
          });
          showTooltip(evt, wrap);
        };
        rect.addEventListener("pointermove", showFn);
        rect.addEventListener("focus", showFn);
        rect.addEventListener("pointerleave", () => { hoverLine.style.opacity = "0"; hideTooltip(); });
        rect.addEventListener("blur", () => { hoverLine.style.opacity = "0"; hideTooltip(); });
        hitLayer.appendChild(rect);
      });
      svg.appendChild(hitLayer);
    }

    // ---------- trend chart zoom interactions (wheel + drag-select) ----------
    let trendDrag = null;

    function onTrendWheel(evt) {
      const full = trendPeriodsFull();
      if (full.length < 2) return;
      evt.preventDefault();
      const minKey = full[0], maxKey = full[full.length - 1];
      const [curA, curB] = state.trendZoom || [minKey, maxKey];
      const svg = document.getElementById("trend-chart");
      const periods = trendVisiblePeriods();
      const xStep = trendXStep(periods);
      const pt = svgPoint(svg, evt);
      let idx = xStep ? Math.round((pt.x - TREND_PADL) / xStep) : 0;
      idx = Math.max(0, Math.min(periods.length - 1, idx));
      const centerKey = periods[idx] != null ? periods[idx] : curA;

      const factor = evt.deltaY < 0 ? 0.72 : 1 / 0.72;
      const curWidth = Math.max(2, curB - curA);
      const newWidth = Math.max(2, Math.min(maxKey - minKey, curWidth * factor));
      const ratio = curWidth ? (centerKey - curA) / curWidth : 0.5;
      const newA = Math.round(centerKey - newWidth * ratio);
      const newB = Math.round(newA + newWidth);
      setTrendZoom(newWidth >= maxKey - minKey ? null : [newA, newB]);
    }

    function onTrendMouseDown(evt) {
      if (evt.button !== 0) return;
      const svg = document.getElementById("trend-chart");
      const pt = svgPoint(svg, evt);
      if (pt.x < TREND_PADL || pt.x > TREND_W - TREND_PADR) return;
      trendDrag = { startX: pt.x, rect: null };
      hideTooltip();
    }

    function onTrendMouseMove(evt) {
      if (!trendDrag) return;
      const svg = document.getElementById("trend-chart");
      const pt = svgPoint(svg, evt);
      const x1 = Math.max(TREND_PADL, Math.min(trendDrag.startX, pt.x));
      const x2 = Math.min(TREND_W - TREND_PADR, Math.max(trendDrag.startX, pt.x));
      if (!trendDrag.rect) {
        trendDrag.rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        trendDrag.rect.setAttribute("class", "trend-brush");
        svg.appendChild(trendDrag.rect);
      }
      trendDrag.rect.setAttribute("x", x1);
      trendDrag.rect.setAttribute("y", TREND_PADT);
      trendDrag.rect.setAttribute("width", Math.max(0, x2 - x1));
      trendDrag.rect.setAttribute("height", TREND_H - TREND_PADT - TREND_PADB);
    }

    function onTrendMouseUp(evt) {
      if (!trendDrag) return;
      const svg = document.getElementById("trend-chart");
      const pt = svgPoint(svg, evt);
      const startX = trendDrag.startX;
      const hadRect = !!trendDrag.rect;
      if (trendDrag.rect) trendDrag.rect.remove();
      trendDrag = null;
      if (!hadRect || Math.abs(pt.x - startX) < 6) return;
      const periods = trendVisiblePeriods();
      const xStep = trendXStep(periods);
      if (!xStep || periods.length < 2) return;
      const idx1 = Math.round((Math.min(startX, pt.x) - TREND_PADL) / xStep);
      const idx2 = Math.round((Math.max(startX, pt.x) - TREND_PADL) / xStep);
      const a = periods[Math.max(0, Math.min(periods.length - 1, idx1))];
      const b = periods[Math.max(0, Math.min(periods.length - 1, idx2))];
      setTrendZoom([a, b]);
    }

    function setupTrendZoom() {
      const svg = document.getElementById("trend-chart");
      svg.addEventListener("wheel", onTrendWheel, { passive: false });
      svg.addEventListener("mousedown", onTrendMouseDown);
      svg.addEventListener("dblclick", () => setTrendZoom(null));
      window.addEventListener("mousemove", onTrendMouseMove);
      window.addEventListener("mouseup", onTrendMouseUp);
      document.getElementById("trend-zoom-reset").addEventListener("click", () => setTrendZoom(null));
    }

    // ---------- pivot table ----------
    function renderTable() {
      const rows = filteredRows();
      const dims = [...state.groupDims];
      let groups = computeGroups(rows, dims);
      const total = groups.reduce((s, g) => s + g.usd, 0) || 1;
      // standart birim fiyat: bu satırın toplam değeri / toplam miktarı (satırlar arası ortalama değil)
      groups.forEach(g => { g.unitPrice = g.kg ? (g.usd / g.kg) * 1000 : null; });

      if (state.tableSearch) {
        const q = state.tableSearch.toLowerCase();
        groups = groups.filter(g => dims.some((d, i) => DIMENSIONS[d].display(g.parts[i]).toLowerCase().includes(q)));
      }

      const sortKey = state.tableSort.key, sortDir = state.tableSort.dir;
      groups.sort((a, b) => {
        let av, bv;
        if (sortKey === "usd" || sortKey === "kg" || sortKey === "n" || sortKey === "unitPrice") {
          av = a[sortKey] ?? -Infinity; bv = b[sortKey] ?? -Infinity;
        }
        else { const di = dims.indexOf(sortKey); av = DIMENSIONS[dims[di]].display(a.parts[di]); bv = DIMENSIONS[dims[di]].display(b.parts[di]); }
        if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv, "tr") : bv.localeCompare(av, "tr");
        return sortDir === "asc" ? av - bv : bv - av;
      });

      const thead = document.getElementById("pivot-thead");
      thead.textContent = "";
      const cols = [{ key: "rank", label: "#", num: false }]
        .concat(dims.map(d => ({ key: d, label: DIMENSIONS[d].label, num: false })))
        .concat([
          { key: "usd", label: "Toplam Değer", num: true },
          { key: "kg", label: "Toplam Miktar", num: true },
          { key: "unitPrice", label: "Birim Fiyat", num: true },
          { key: "share", label: "Pay", num: true },
        ]);
      cols.forEach(c => {
        const th = document.createElement("th");
        if (c.num) th.classList.add("num-col");
        th.textContent = c.label;
        if (c.key !== "rank" && c.key !== "share") {
          if (state.tableSort.key === c.key) {
            const arrow = document.createElement("span");
            arrow.className = "arrow"; arrow.textContent = state.tableSort.dir === "asc" ? "↑" : "↓";
            th.appendChild(arrow);
          }
          th.addEventListener("click", () => {
            if (state.tableSort.key === c.key) state.tableSort.dir = state.tableSort.dir === "asc" ? "desc" : "asc";
            else state.tableSort = { key: c.key, dir: "desc" };
            renderTable();
          });
        }
        thead.appendChild(th);
      });

      const tbody = document.getElementById("pivot-tbody");
      tbody.textContent = "";
      groups.slice(0, 300).forEach((g, i) => {
        const tr = document.createElement("tr");
        const rankTd = document.createElement("td"); rankTd.className = "rank num"; rankTd.textContent = String(i + 1);
        tr.appendChild(rankTd);
        dims.forEach((d, di) => {
          const td = document.createElement("td");
          if (d === "flow") {
            const tag = document.createElement("span"); tag.className = "flow-tag";
            const dot = document.createElement("span"); dot.className = "dot"; dot.style.background = FLOW_COLOR[g.parts[di]];
            tag.appendChild(dot); tag.appendChild(document.createTextNode(FLOW_LABEL[g.parts[di]]));
            td.appendChild(tag);
          } else {
            td.textContent = DIMENSIONS[d].display(g.parts[di]);
          }
          tr.appendChild(td);
        });
        const usdTd = document.createElement("td"); usdTd.className = "num-col num"; usdTd.textContent = fmtUsdFull(g.usd);
        tr.appendChild(usdTd);
        const kgTd = document.createElement("td"); kgTd.className = "num-col num"; kgTd.textContent = fmtKg(g.kg);
        tr.appendChild(kgTd);
        const priceTd = document.createElement("td"); priceTd.className = "num-col num"; priceTd.textContent = fmtUnitPrice(g.unitPrice);
        tr.appendChild(priceTd);
        const shareTd = document.createElement("td"); shareTd.className = "num-col";
        const shareWrap = document.createElement("div"); shareWrap.className = "share-bar-wrap";
        const pct = Math.max(0, Math.min(100, (g.usd / total) * 100));
        const bar = document.createElement("div"); bar.className = "share-bar";
        const fill = document.createElement("span"); fill.style.width = pct + "%"; bar.appendChild(fill);
        const pctText = document.createElement("span"); pctText.className = "num"; pctText.style.fontSize = "12px";
        pctText.textContent = pct.toFixed(1) + "%";
        shareWrap.appendChild(bar); shareWrap.appendChild(pctText);
        shareTd.appendChild(shareWrap);
        tr.appendChild(shareTd);
        tbody.appendChild(tr);
      });

      document.getElementById("table-count").textContent =
        groups.length > 300 ? ("İlk 300 satır gösteriliyor · toplam " + groups.length.toLocaleString("tr-TR") + " satır")
                             : (groups.length.toLocaleString("tr-TR") + " satır");
      document.getElementById("table-total").textContent = "Toplam: " + fmtUsdFull(total);
    }

    document.getElementById("table-search").addEventListener("input", (e) => {
      state.tableSearch = e.target.value.trim();
      renderTable();
    });

    function renderUnitPriceBadge() {
      const rows = filteredRows();
      const usd = rows.reduce((s, r) => s + (r[5] || 0), 0);
      const kg = rows.reduce((s, r) => s + (r[6] || 0), 0);
      document.getElementById("unit-price-badge").textContent = fmtUnitPrice(kg ? (usd / kg) * 1000 : null);
    }

    function renderAll() {
      renderCountrySelected();
      renderKpis();
      renderUnitPriceBadge();
      renderTopChart();
      renderTrendChart();
      renderTable();
    }


    buildYearSelect();
    buildFlowFilter();
    buildProductChips();
    buildCountrySearch();
    buildGroupControls();
    setupTrendZoom();
    renderAll();
    renderReport(report);
  }

  fetchAllRows()
    .then(({ rows, report }) => {
      setStatus(`Canlı — ${rows.length.toLocaleString("tr-TR")} kayıt yüklendi — ${new Date().toLocaleString("tr-TR")}`, true);
      init(rows, report);
    })
    .catch(err => {
      console.error(err);
      setStatus("Veri çekilemedi — Supabase bağlantısını kontrol edin", false);
    });
})();
