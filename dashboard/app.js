(function () {
  "use strict";

  const cfg = window.TUIK_DASHBOARD_CONFIG;
  // "kod AD" — sadece en üstteki ürün seçim çiplerinde gösterilir.
  const GTIP_NAMES = {
    "100590000019": "1005.90.00.00.19 MISIR",
    "120190000000": "1201.90.00.00.00 SOYA FASULYESİ",
    "110430900011": "1104.30.90.00.11 MISIR ÖZÜ",
    "230400000000": "2304.00.00.00.00 SOYA KÜSPESİ",
    "120600990019": "1206.00.99.00.19 ÇEKİRDEK",
  };
  // sade ürün adı — grafik, tablo ve rapordaki her yerde bu kullanılır.
  const GTIP_SHORT_NAMES = {
    "100590000019": "MISIR",
    "120190000000": "SOYA FASULYESİ",
    "110430900011": "MISIR ÖZÜ",
    "230400000000": "SOYA KÜSPESİ",
    "120600990019": "ÇEKİRDEK",
  };
  const FLOW_LABEL = ["İhracat", "İthalat"];
  const FLOW_COLOR = ["var(--series-export)", "var(--series-import)"];
  const CAT_COLORS = ["var(--series-export)", "var(--series-import)", "var(--cat-3)", "var(--cat-4)", "var(--cat-5)"];
  const MONTH_ABBR = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
  const MONTH_FULL = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

  // period "key" = ay çözünürlüğünde tek bir sıralanabilir tamsayı (year*12 + monthIndex0).
  function periodKey(year, month) { return year * 12 + ((month || 1) - 1); }
  function periodFromKey(key) {
    const month = (((key % 12) + 12) % 12) + 1;
    return { year: (key - (month - 1)) / 12, month };
  }
  function periodLabelShort(key) { const p = periodFromKey(key); return MONTH_ABBR[p.month - 1] + " " + String(p.year).slice(2); }
  function periodLabelFull(key) { const p = periodFromKey(key); return MONTH_FULL[p.month - 1] + " " + p.year; }
  function monthInputToKey(str) {
    if (!str) return null;
    const [y, m] = str.split("-").map(Number);
    return periodKey(y, m);
  }
  function keyToMonthInput(key) {
    const p = periodFromKey(key);
    return p.year + "-" + String(p.month).padStart(2, "0");
  }

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
      const line = raw.replace(/\b(\d{12})\b/g, code => GTIP_SHORT_NAMES[code] || code);
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

    const allPeriodKeys = [...new Set(RAW.map(r => periodKey(r[0], r[7])))].sort((a, b) => a - b);
    const minPeriodKey = allPeriodKeys[0];
    const maxPeriodKey = allPeriodKeys[allPeriodKeys.length - 1];
    // varsayılan: filtre konmamışsa yıl başından (Ocak) bugüne kadarki veri
    const ytdStartKey = periodKey(periodFromKey(maxPeriodKey).year, 1);

    const state = {
      flow: "all",
      periodStart: ytdStartKey,
      periodEnd: maxPeriodKey,
      products: new Set(),
      countries: new Set(),
      groupDims: new Set(["product", "country"]),
      tableSort: { key: "usd", dir: "desc" },
      tableSearch: "",
    };

    const DIMENSIONS = {
      product: { label: "Ürün", get: r => r[2], display: v => GTIP_SHORT_NAMES[v] || v },
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
    // tüm kartlar (KPI, grafikler, tablo) aynı Dönem filtresine göre çalışır —
    // "neye göre veri alıyorsun" belirsizliği kalmasın diye tek bir kaynak.
    function filteredRows() {
      return RAW.filter(r => {
        if (state.flow !== "all" && String(r[1]) !== state.flow) return false;
        const key = periodKey(r[0], r[7]);
        if (key < state.periodStart || key > state.periodEnd) return false;
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
    function periodRangeLabel() {
      return state.periodStart === state.periodEnd
        ? periodLabelFull(state.periodStart)
        : periodLabelShort(state.periodStart) + " – " + periodLabelShort(state.periodEnd);
    }

    function renderKpis() {
      const rows = filteredRows();
      const exp = rows.filter(r => r[1] === 0).reduce((s, r) => s + (r[5] || 0), 0);
      const imp = rows.filter(r => r[1] === 1).reduce((s, r) => s + (r[5] || 0), 0);
      const kg = rows.reduce((s, r) => s + (r[6] || 0), 0);
      const net = exp - imp;

      // aynı uzunlukta bir önceki dönemle (12 ay öncesiyle) kıyasla
      const prevStart = state.periodStart - 12, prevEnd = state.periodEnd - 12;
      const prevRows = RAW.filter(r => {
        const key = periodKey(r[0], r[7]);
        if (key < prevStart || key > prevEnd) return false;
        if (state.flow !== "all" && String(r[1]) !== state.flow) return false;
        if (state.products.size && !state.products.has(r[2])) return false;
        if (state.countries.size && !state.countries.has(r[3])) return false;
        return true;
      });
      const prevExp = prevRows.filter(r => r[1] === 0).reduce((s, r) => s + (r[5] || 0), 0);
      const prevImp = prevRows.filter(r => r[1] === 1).reduce((s, r) => s + (r[5] || 0), 0);
      const yoyExp = prevExp ? ((exp - prevExp) / prevExp) * 100 : null;
      const yoyImp = prevImp ? ((imp - prevImp) / prevImp) * 100 : null;

      const countries = new Set(rows.map(r => r[3])).size;
      const products = new Set(rows.map(r => r[2])).size;
      const rangeLabel = " (" + periodRangeLabel() + ")";

      const tiles = [
        { label: "Toplam İhracat" + rangeLabel, value: fmtUsd(exp), delta: yoyExp },
        { label: "Toplam İthalat" + rangeLabel, value: fmtUsd(imp), delta: yoyImp },
        { label: "Net (İhracat − İthalat)", value: (net >= 0 ? "+" : "") + fmtUsd(net), delta: null },
        { label: "Kapsanan ülke", value: String(countries), delta: null },
        { label: "Kapsanan ürün", value: String(products), delta: null },
        { label: "Toplam Tonaj", value: fmtKg(kg), delta: null },
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
    function setPeriodInputs() {
      document.getElementById("period-start").value = keyToMonthInput(state.periodStart);
      document.getElementById("period-end").value = keyToMonthInput(state.periodEnd);
    }

    function setPeriod(startKey, endKey, presetName) {
      if (startKey > endKey) { const t = startKey; startKey = endKey; endKey = t; }
      state.periodStart = Math.max(minPeriodKey, startKey);
      state.periodEnd = Math.min(maxPeriodKey, endKey);
      setPeriodInputs();
      document.querySelectorAll("#period-presets .seg").forEach(b => b.classList.toggle("active", b.dataset.preset === presetName));
      renderAll();
    }

    function buildPeriodControls() {
      const startInput = document.getElementById("period-start");
      const endInput = document.getElementById("period-end");
      startInput.min = endInput.min = keyToMonthInput(minPeriodKey);
      startInput.max = endInput.max = keyToMonthInput(maxPeriodKey);
      setPeriodInputs();

      const onManualChange = () => {
        const s = monthInputToKey(startInput.value) ?? state.periodStart;
        const e = monthInputToKey(endInput.value) ?? state.periodEnd;
        document.querySelectorAll("#period-presets .seg").forEach(b => b.classList.remove("active"));
        setPeriod(s, e, null);
      };
      startInput.addEventListener("change", onManualChange);
      endInput.addEventListener("change", onManualChange);

      document.querySelectorAll("#period-presets .seg").forEach(btn => {
        btn.addEventListener("click", () => {
          const preset = btn.dataset.preset;
          if (preset === "ytd") setPeriod(ytdStartKey, maxPeriodKey, "ytd");
          else if (preset === "12m") setPeriod(maxPeriodKey - 11, maxPeriodKey, "12m");
          else if (preset === "all") setPeriod(minPeriodKey, maxPeriodKey, "all");
        });
      });
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
      const input = document.getElementById("country-search");
      const box = document.getElementById("country-suggestions");
      let activeIndex = -1;
      let currentMatches = [];

      function closeSuggestions() {
        box.classList.remove("open");
        box.textContent = "";
        activeIndex = -1;
        currentMatches = [];
      }

      function pick(code) {
        state.countries.add(code);
        input.value = "";
        closeSuggestions();
        renderAll();
        input.focus();
      }

      function renderSuggestions() {
        const q = input.value.trim().toLowerCase();
        box.textContent = "";
        if (!q) { closeSuggestions(); return; }
        currentMatches = allCountries
          .filter(c => !state.countries.has(c) && countryNames[c].toLowerCase().includes(q))
          .slice(0, 30);
        if (!currentMatches.length) {
          const empty = document.createElement("div");
          empty.className = "empty";
          empty.textContent = "Eşleşen ülke yok";
          box.appendChild(empty);
          box.classList.add("open");
          activeIndex = -1;
          return;
        }
        currentMatches.forEach((code, i) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.textContent = countryNames[code];
          if (i === activeIndex) btn.classList.add("active-option");
          btn.addEventListener("mousedown", evt => { evt.preventDefault(); pick(code); });
          box.appendChild(btn);
        });
        box.classList.add("open");
      }

      input.addEventListener("input", () => { activeIndex = -1; renderSuggestions(); });
      input.addEventListener("focus", () => { if (input.value.trim()) renderSuggestions(); });
      input.addEventListener("blur", () => { closeSuggestions(); });
      input.addEventListener("keydown", evt => {
        if (!currentMatches.length) return;
        if (evt.key === "ArrowDown") { evt.preventDefault(); activeIndex = Math.min(currentMatches.length - 1, activeIndex + 1); renderSuggestions(); }
        else if (evt.key === "ArrowUp") { evt.preventDefault(); activeIndex = Math.max(0, activeIndex - 1); renderSuggestions(); }
        else if (evt.key === "Enter") { evt.preventDefault(); pick(currentMatches[activeIndex >= 0 ? activeIndex : 0]); }
        else if (evt.key === "Escape") { closeSuggestions(); }
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
      state.flow = "all";
      state.products.clear(); state.countries.clear();
      document.querySelectorAll("#flow-filter .seg").forEach(b => b.classList.toggle("active", b.dataset.value === "all"));
      document.querySelectorAll("#product-chips .chip").forEach(c => c.classList.remove("active"));
      document.getElementById("country-search").value = "";
      setPeriod(ytdStartKey, maxPeriodKey, "ytd");
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
        "İlk 10 — " + dims.map(d => DIMENSIONS[d].label).join(" × ") + " (" + periodRangeLabel() + ")";

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

    // ---------- month trend charts (value + unit price) — driven by the Dönem filter ----------
    // No separate chart-only zoom/pan math anymore: the visible window is exactly
    // [state.periodStart, state.periodEnd], the same range the KPIs/table use, so
    // "what basis is this data on" always has one visible, unambiguous answer.
    // Panning moves that shared range; ◀ ▶ shift it by its own width.
    const TREND_W = 560, TREND_H = 170, TREND_PADL = 60, TREND_PADR = 16, TREND_PADT = 10, TREND_PADB = 24;

    function trendPeriods() {
      const periods = [];
      for (let k = state.periodStart; k <= state.periodEnd; k++) periods.push(k);
      return periods;
    }

    function updateTrendNav() {
      document.getElementById("trend-range-label").textContent = periodRangeLabel();
      const span = state.periodEnd - state.periodStart;
      document.getElementById("trend-prev").disabled = state.periodStart - span - 1 < minPeriodKey;
      document.getElementById("trend-next").disabled = state.periodEnd + span + 1 > maxPeriodKey;
    }

    function panTrend(direction) {
      const span = state.periodEnd - state.periodStart;
      const shift = (span + 1) * direction;
      let newStart = state.periodStart + shift;
      let newEnd = state.periodEnd + shift;
      if (newStart < minPeriodKey) { newStart = minPeriodKey; newEnd = newStart + span; }
      if (newEnd > maxPeriodKey) { newEnd = maxPeriodKey; newStart = newEnd - span; }
      setPeriod(newStart, newEnd, null);
    }

    // ortak eksen/gridline/hover-crosshair çizici — değer ve birim fiyat grafikleri
    // aynı ay eksenini paylaştığı için tek bir çizici fonksiyon kullanılıyor.
    function drawSeriesChart(svgId, periods, series, valueFmt, tooltipTitle) {
      const svg = document.getElementById(svgId);
      svg.textContent = "";
      svg.setAttribute("viewBox", "0 0 " + TREND_W + " " + TREND_H);
      if (periods.length < 1) {
        const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
        t.setAttribute("x", TREND_PADL); t.setAttribute("y", TREND_H / 2); t.setAttribute("class", "axis-label");
        t.textContent = "Bu dönemde veri yok.";
        svg.appendChild(t);
        return;
      }

      // tek aylık bir aralıkta çizgi çizilemez (bölme hatasına yol açar) — nokta ortalanır.
      const xStep = periods.length > 1 ? (TREND_W - TREND_PADL - TREND_PADR) / (periods.length - 1) : 0;
      const xScale = i => periods.length > 1 ? TREND_PADL + i * xStep : (TREND_PADL + (TREND_W - TREND_PADR)) / 2;
      const maxVal = Math.max(1, ...series.map(s => Math.max(0, ...periods.map(k => s.totals.get(k) || 0))));
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
        t.textContent = valueFmt(maxVal - (g * maxVal) / 3);
        svg.appendChild(t);
      }

      // etiketler asla üst üste binmesin diye piksel cinsinden minimum aralık uygulanır
      const minLabelGap = 34;
      const tickEvery = Math.max(1, Math.ceil((minLabelGap) / Math.max(xStep, 1)));
      periods.forEach((key, i) => {
        const isLast = i === periods.length - 1;
        if (i % tickEvery !== 0 && !isLast) return;
        if (isLast && periods.length > 1 && (periods.length - 1) % tickEvery !== 0) {
          const prevShown = Math.floor((periods.length - 1) / tickEvery) * tickEvery;
          if ((periods.length - 1 - prevShown) * xStep < minLabelGap) return;
        }
        const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
        t.setAttribute("x", xScale(i)); t.setAttribute("y", TREND_H - 6);
        t.setAttribute("text-anchor", "middle"); t.setAttribute("class", "axis-label");
        t.textContent = periodLabelShort(key);
        svg.appendChild(t);
      });

      const hoverLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
      hoverLine.setAttribute("class", "baseline");
      hoverLine.setAttribute("y1", TREND_PADT); hoverLine.setAttribute("y2", TREND_H - TREND_PADB);
      hoverLine.style.opacity = "0";
      svg.appendChild(hoverLine);

      series.forEach(s => {
        const pts = periods.map((k, i) => [xScale(i), yScale(s.totals.get(k) || 0)]);
        if (pts.length === 1) {
          const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
          dot.setAttribute("cx", pts[0][0]); dot.setAttribute("cy", pts[0][1]); dot.setAttribute("r", "4");
          dot.setAttribute("fill", s.color);
          svg.appendChild(dot);
          return;
        }
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", pts.map((p, i) => (i === 0 ? "M" : "L") + p[0] + "," + p[1]).join(" "));
        path.setAttribute("stroke", s.color); path.setAttribute("stroke-width", "2");
        path.setAttribute("fill", "none"); path.setAttribute("stroke-linejoin", "round"); path.setAttribute("stroke-linecap", "round");
        svg.appendChild(path);
      });

      const hitLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
      periods.forEach((key, i) => {
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        const hitW = Math.max(xStep, 6);
        rect.setAttribute("x", xScale(i) - hitW / 2); rect.setAttribute("y", TREND_PADT);
        rect.setAttribute("width", hitW); rect.setAttribute("height", TREND_H - TREND_PADB - TREND_PADT);
        rect.setAttribute("fill", "transparent"); rect.style.cursor = "pointer";
        rect.tabIndex = 0;
        const showFn = evt => {
          hoverLine.setAttribute("x1", xScale(i)); hoverLine.setAttribute("x2", xScale(i));
          hoverLine.style.opacity = "1";
          const wrap = document.createElement("div");
          const ttl = document.createElement("div"); ttl.className = "ttl"; ttl.textContent = tooltipTitle(key);
          wrap.appendChild(ttl);
          series.forEach(s => {
            const val = s.totals.get(key);
            if (val == null) return;
            const row = document.createElement("div"); row.className = "row";
            const keyLine = document.createElement("span"); keyLine.className = "key-line"; keyLine.style.background = s.color;
            const v = document.createElement("span"); v.className = "val"; v.textContent = s.fullFmt(val);
            row.appendChild(keyLine); row.appendChild(v); row.appendChild(document.createTextNode(" " + s.label));
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

    function renderTrendChart() {
      updateTrendNav();
      const rows = filteredRows();
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

      const periods = trendPeriods();
      const valueTotals = flowsToShow.map(f => {
        const m = new Map();
        rows.filter(r => r[1] === f).forEach(r => {
          const key = periodKey(r[0], r[7]);
          m.set(key, (m.get(key) || 0) + (r[5] || 0));
        });
        return m;
      });
      drawSeriesChart(
        "trend-chart", periods,
        flowsToShow.map((f, fi) => ({ totals: valueTotals[fi], color: FLOW_COLOR[f], label: FLOW_LABEL[f], fullFmt: fmtUsdFull })),
        fmtUsd, key => periodLabelFull(key)
      );

      const usdTotals = flowsToShow.map(f => {
        const m = new Map();
        rows.filter(r => r[1] === f).forEach(r => { const k = periodKey(r[0], r[7]); m.set(k, (m.get(k) || 0) + (r[5] || 0)); });
        return m;
      });
      const kgTotals = flowsToShow.map(f => {
        const m = new Map();
        rows.filter(r => r[1] === f).forEach(r => { const k = periodKey(r[0], r[7]); m.set(k, (m.get(k) || 0) + (r[6] || 0)); });
        return m;
      });
      const priceTotals = flowsToShow.map((f, fi) => {
        const m = new Map();
        periods.forEach(k => {
          const kg = kgTotals[fi].get(k);
          if (kg) m.set(k, (usdTotals[fi].get(k) / kg) * 1000);
        });
        return m;
      });
      drawSeriesChart(
        "price-chart", periods,
        flowsToShow.map((f, fi) => ({ totals: priceTotals[fi], color: FLOW_COLOR[f], label: FLOW_LABEL[f], fullFmt: fmtUnitPrice })),
        v => "$" + Math.round(v), key => periodLabelFull(key)
      );
    }

    function setupTrendNav() {
      document.getElementById("trend-prev").addEventListener("click", () => panTrend(-1));
      document.getElementById("trend-next").addEventListener("click", () => panTrend(1));
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


    document.getElementById("asof-badge").textContent = "Veri " + periodLabelFull(maxPeriodKey) + " dönemine kadar güncel";

    buildPeriodControls();
    buildFlowFilter();
    buildProductChips();
    buildCountrySearch();
    buildGroupControls();
    setupTrendNav();
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
