// ---------------------------------------------------------------------------
// localStorage önbelleği — her panel sekmesi açıldığında (hatta sayfa her
// yenilendiğinde) Supabase'den tam veri setini yeniden çekmek gereksiz ve
// yavaş: kaynaklar en hızlı 15 dakikada (Ticaret Borsası canlandığında),
// çoğu günde/ayda/haftada bir güncelleniyor. Her panel kendi verisini bir
// TTL ile önbelleğe alır; süre dolmadan önceki açılışlarda hiç ağ isteği
// atılmaz, sayfa anında önbellekten render olur.
window.__supaCache = (function () {
  const PREFIX = "tuik-dash-cache:";
  function get(key, ttlMs) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (!raw) return null;
      const entry = JSON.parse(raw);
      if (!entry || typeof entry.t !== "number" || Date.now() - entry.t > ttlMs) return null;
      return entry.v;
    } catch (e) {
      return null;
    }
  }
  function set(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify({ t: Date.now(), v: value }));
    } catch (e) {
      // kota dolu / gizli sekme — önbellek olmadan da sayfa normal çalışır
    }
  }
  function clearAll() {
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith(PREFIX))
        .forEach(k => localStorage.removeItem(k));
    } catch (e) {
      // yoksay
    }
  }
  return { get, set, clearAll };
})();

document.getElementById("refresh-data").addEventListener("click", () => {
  window.__supaCache.clearAll();
  location.reload();
});

(function () {
  "use strict";

  const cfg = window.TUIK_DASHBOARD_CONFIG;
  const DEFAULT_PRODUCT_CODE = "100590000019"; // Mısır — sistem bu ürün seçiliyken açılır
  // izlenen GTİP kodlarının kaynağı — "kod AD" biçimi artık hiçbir yerde
  // gösterilmiyor (ürün çiplerinde GTIP_SHORT_NAMES kullanılıyor).
  const GTIP_NAMES = {
    "100590000019": "1005.90.00.00.19 MISIR",
    "120190000000": "1201.90.00.00.00 SOYA FASULYESİ",
    "110430900011": "1104.30.90.00.11 MISIR ÖZÜ",
    "230400000000": "2304.00.00.00.00 SOYA KÜSPESİ",
    "120600990019": "1206.00.99.00.19 ÇEKİRDEK",
    "151211910000": "1512.11.91.00.00 AYÇİÇEK HAM",
    "151219900011": "1512.19.90.00.11 AYÇİÇEK RAFİNE",
    "150710900000": "1507.10.90.00.00 SOYA HAM",
    "150790900000": "1507.90.90.00.00 SOYA RAFİNE",
    "151521900000": "1515.21.90.00.00 MISIR HAM",
    "151529900000": "1515.29.90.00.00 MISIR RAFİNE",
  };
  // sade ürün adı — grafik, tablo ve rapordaki her yerde bu kullanılır.
  const GTIP_SHORT_NAMES = {
    "100590000019": "MISIR",
    "120190000000": "SOYA FASULYESİ",
    "110430900011": "MISIR ÖZÜ",
    "230400000000": "SOYA KÜSPESİ",
    "120600990019": "ÇEKİRDEK",
    "151211910000": "AYÇİÇEK HAM",
    "151219900011": "AYÇİÇEK RAFİNE",
    "150710900000": "SOYA HAM",
    "150790900000": "SOYA RAFİNE",
    "151521900000": "MISIR HAM",
    "151529900000": "MISIR RAFİNE",
  };
  const FLOW_LABEL = ["İhracat", "İthalat"];
  const FLOW_COLOR = ["var(--series-export)", "var(--series-import)"];
  const CAT_COLORS = [
    "var(--series-export)", "var(--series-import)", "var(--cat-3)", "var(--cat-4)", "var(--cat-5)",
    "var(--cat-6)", "var(--cat-7)", "var(--cat-8)", "var(--cat-9)", "var(--cat-10)", "var(--cat-11)",
  ];
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
  const CACHE_TTL_MS = 30 * 60 * 1000; // 30 dk — trade_stats günde bir güncelleniyor

  async function fetchAllRows() {
    const cached = window.__supaCache.get("trade", CACHE_TTL_MS);
    if (cached) return cached;

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
    const result = {
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
    };
    window.__supaCache.set("trade", result);
    return result;
  }

  // ---------- theme (works immediately, doesn't need data) ----------
  document.getElementById("theme-toggle").addEventListener("click", () => {
    const root = document.documentElement;
    const current = root.getAttribute("data-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const next = current === "dark" ? "light" : current === "light" ? (prefersDark ? "dark" : "light") : (prefersDark ? "light" : "dark");
    root.setAttribute("data-theme", next);
  });

  function init(RAW) {

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
      products: new Set([DEFAULT_PRODUCT_CODE]),
      countries: new Set(),
      groupDims: new Set(["product", "country"]),
      tableSort: { key: "kg", dir: "desc" },
      tableSearch: "",
    };

    const DIMENSIONS = {
      product: { label: "Ürün", get: r => r[2], display: v => GTIP_SHORT_NAMES[v] || v },
      country: { label: "Ülke", get: r => r[3], display: v => countryNames[v] || v },
      year: { label: "Yıl", get: r => r[0], display: v => String(v) },
      month: { label: "Ay", get: r => periodKey(r[0], r[7]), display: v => periodLabelFull(v) },
      flow: { label: "Yön", get: r => r[1], display: v => FLOW_LABEL[v] },
    };
    const DIM_ORDER = ["product", "country", "year", "month", "flow"];

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
      return (Math.round(v) || 0) + " kg";
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
        chip.className = "chip" + (state.products.has(code) ? " active" : "");
        chip.type = "button";
        const sw = document.createElement("span");
        sw.className = "swatch";
        sw.style.background = CAT_COLORS[i % CAT_COLORS.length];
        chip.appendChild(sw);
        chip.appendChild(document.createTextNode(GTIP_SHORT_NAMES[code] || code));
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
      state.products = new Set([DEFAULT_PRODUCT_CODE]); state.countries.clear();
      document.querySelectorAll("#flow-filter .seg").forEach(b => b.classList.toggle("active", b.dataset.value === "all"));
      buildProductChips();
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
          if (s.skey) { dot.setAttribute("class", "series-line"); dot.dataset.skey = s.skey; }
          svg.appendChild(dot);
          return;
        }
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", pts.map((p, i) => (i === 0 ? "M" : "L") + p[0] + "," + p[1]).join(" "));
        path.setAttribute("stroke", s.color); path.setAttribute("stroke-width", "2");
        path.setAttribute("fill", "none"); path.setAttribute("stroke-linejoin", "round"); path.setAttribute("stroke-linecap", "round");
        if (s.dashed) path.setAttribute("stroke-dasharray", "5,4");
        path.setAttribute("class", "series-line");
        if (s.skey) path.dataset.skey = s.skey;
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
            const keyLine = document.createElement("span"); keyLine.className = "key-line" + (s.dashed ? " dashed" : ""); keyLine.style.background = s.dashed ? "" : s.color; keyLine.style.borderColor = s.color;
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

    // ürün bazlı: her seçili GTİP kendi çizgisi — seçilmeyenler grafikten
    // çıkar, hiçbiri seçilmemişse (varsayılan) hepsi ayrı ayrı gösterilir.
    // Renkler ürün çiplerindeki renklerle birebir aynı (CAT_COLORS, aynı sıra).
    function trendProducts() {
      return allProducts.filter(code => !state.products.size || state.products.has(code));
    }
    function productColor(code) {
      return CAT_COLORS[allProducts.indexOf(code) % CAT_COLORS.length];
    }

    // her ürün × yön kombinasyonu kendi çizgisi: renk = ürün (çiplerle aynı),
    // çizgi stili = yön (düz = ihracat, kesikli = ithalat) — böylece ithalat
    // ve ihracat aynı anda, birbirinden ayırt edilerek görülebiliyor. Yön
    // filtresi tek bir yöne daraltılmışsa o tek çizgi düz çizilir.
    function trendFlows() {
      return state.flow === "all" ? [0, 1] : [Number(state.flow)];
    }

    function renderTrendChart() {
      updateTrendNav();
      const rows = filteredRows();
      const products = trendProducts();
      const flows = trendFlows();
      const showFlowSuffix = flows.length > 1;

      const legend = document.getElementById("trend-legend");
      legend.textContent = "";
      products.forEach(code => {
        flows.forEach(f => {
          const key = document.createElement("span"); key.className = "key"; key.dataset.skey = code + "::" + f;
          const sw = document.createElement("span"); sw.className = "swatch-line" + (f === 1 ? " dashed" : "");
          if (f === 1) sw.style.borderColor = productColor(code); else sw.style.background = productColor(code);
          key.appendChild(sw);
          key.appendChild(document.createTextNode((GTIP_SHORT_NAMES[code] || code) + (showFlowSuffix ? " · " + FLOW_LABEL[f] : "")));
          legend.appendChild(key);
        });
      });

      const periods = trendPeriods();
      const usdTotals = products.map(code => flows.map(f => {
        const m = new Map();
        rows.filter(r => r[2] === code && r[1] === f).forEach(r => {
          const key = periodKey(r[0], r[7]);
          m.set(key, (m.get(key) || 0) + (r[5] || 0));
        });
        return m;
      }));
      const kgTotals = products.map(code => flows.map(f => {
        const m = new Map();
        rows.filter(r => r[2] === code && r[1] === f).forEach(r => { const k = periodKey(r[0], r[7]); m.set(k, (m.get(k) || 0) + (r[6] || 0)); });
        return m;
      }));

      // üstteki grafik tonaj gösterir — toplam değer ($) zaten detay tabloda ve
      // alttaki birim fiyat grafiğinde var, burada tekrarlamak yerine miktarı gösteriyoruz.
      const tonnageSeries = [];
      products.forEach((code, pi) => flows.forEach((f, fi) => {
        tonnageSeries.push({
          totals: kgTotals[pi][fi], color: productColor(code), dashed: f === 1, skey: code + "::" + f,
          label: (GTIP_SHORT_NAMES[code] || code) + (showFlowSuffix ? " · " + FLOW_LABEL[f] : ""), fullFmt: fmtKg,
        });
      }));
      drawSeriesChart("trend-chart", periods, tonnageSeries, fmtKg, key => periodLabelFull(key));

      const priceSeries = [];
      products.forEach((code, pi) => flows.forEach((f, fi) => {
        const m = new Map();
        periods.forEach(k => {
          const kg = kgTotals[pi][fi].get(k);
          if (kg) m.set(k, (usdTotals[pi][fi].get(k) / kg) * 1000);
        });
        priceSeries.push({
          totals: m, color: productColor(code), dashed: f === 1, skey: code + "::" + f,
          label: (GTIP_SHORT_NAMES[code] || code) + (showFlowSuffix ? " · " + FLOW_LABEL[f] : ""), fullFmt: fmtUnitPrice,
        });
      }));
      drawSeriesChart("price-chart", periods, priceSeries, v => "$" + Math.round(v), key => periodLabelFull(key));
    }

    function setupTrendNav() {
      document.getElementById("trend-prev").addEventListener("click", () => panTrend(-1));
      document.getElementById("trend-next").addEventListener("click", () => panTrend(1));
    }

    // legend'daki bir seriye gelince ilgili çizgiyi öne çıkarıp diğerlerini
    // soldurur — çok çizgili grafiklerde tek bir seriyi takip etmeyi kolaylaştırır.
    function setupTrendHighlight() {
      function apply(skey) {
        document.querySelectorAll(".legend .key").forEach(k => k.classList.toggle("dim", k.dataset.skey !== skey));
        document.querySelectorAll("svg.chart .series-line").forEach(el => {
          const match = el.dataset.skey === skey;
          el.classList.toggle("dim", !match);
          el.classList.toggle("focus", match);
        });
      }
      function clear() {
        document.querySelectorAll(".legend .key, svg.chart .series-line").forEach(el => el.classList.remove("dim", "focus"));
      }
      const legend = document.getElementById("trend-legend");
      legend.addEventListener("pointerover", e => {
        const key = e.target.closest(".key");
        if (key && key.dataset.skey) apply(key.dataset.skey);
      });
      legend.addEventListener("pointerout", e => { if (e.target.closest(".key")) clear(); });
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
          { key: "kg", label: "Toplam Miktar", num: true },
          { key: "usd", label: "Toplam Değer", num: true },
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
        const kgTd = document.createElement("td"); kgTd.className = "num-col num"; kgTd.textContent = fmtKg(g.kg);
        tr.appendChild(kgTd);
        const usdTd = document.createElement("td"); usdTd.className = "num-col num"; usdTd.textContent = fmtUsdFull(g.usd);
        tr.appendChild(usdTd);
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
      document.getElementById("tonnage-badge").textContent = fmtKg(kg);
    }

    function renderAll() {
      renderCountrySelected();
      renderKpis();
      renderUnitPriceBadge();
      renderTopChart();
      renderTrendChart();
      renderTable();
    }


    buildPeriodControls();
    buildFlowFilter();
    buildProductChips();
    buildCountrySearch();
    buildGroupControls();
    setupTrendNav();
    setupTrendHighlight();
    renderAll();
  }

  fetchAllRows()
    .then(({ rows }) => {
      setStatus(`Canlı — ${rows.length.toLocaleString("tr-TR")} kayıt yüklendi — ${new Date().toLocaleString("tr-TR")}`, true);
      init(rows);
    })
    .catch(err => {
      console.error(err);
      setStatus("Veri çekilemedi — Supabase bağlantısını kontrol edin", false);
    });
})();

// ---------------------------------------------------------------------------
// Sekme yöneticisi — TÜİK / WASDE / Ticaret Borsası arasında geçişi tek yerden
// yönetir. Her sekme kendi IIFE'sinde register() ile kaydolur; sekmeye ilk
// tıklandığında onActivate çağrılır (lazy-fetch için kullanılıyor).
window.__tabManager = (function () {
  const tabs = [];
  function show(activeTabId) {
    tabs.forEach(t => {
      const isActive = t.tabId === activeTabId;
      document.getElementById(t.tabId).classList.toggle("active", isActive);
      document.getElementById(t.tabId).setAttribute("aria-selected", isActive ? "true" : "false");
      document.getElementById(t.panelId).hidden = !isActive;
      if (isActive && t.onActivate) t.onActivate();
    });
  }
  function register(tabId, panelId, onActivate) {
    tabs.push({ tabId, panelId, onActivate });
    document.getElementById(tabId).addEventListener("click", () => show(tabId));
  }
  register("tab-tuik", "tuik-panel");
  return { register };
})();

// ---------------------------------------------------------------------------
// WASDE (USDA) sekmesi — TÜİK'ten tamamen ayrı bir kaynak/veri modeli olduğu
// için kasıtlı olarak ayrı bir IIFE: kendi state'i, kendi fetch'i, kendi
// render'ı. Yalnızca sekmeye ilk tıklandığında veri çekilir (gereksiz istek
// yok), TÜİK panelindeki state'e hiç dokunmaz.
(function () {
  "use strict";

  const cfg = window.TUIK_DASHBOARD_CONFIG;

  const COMMODITIES = [
    { key: "corn", label: "Mısır" },
    { key: "soybeans", label: "Soya Fasulyesi" },
    { key: "soybean_meal", label: "Soya Küspesi" },
    { key: "soybean_oil", label: "Soya Yağı" },
  ];
  // Soya Yağı için WASDE'de sadece ABD tablosu var, Dünya tablosu yok.
  const WORLD_AVAILABLE = { corn: true, soybeans: true, soybean_meal: true, soybean_oil: false };
  const REGIONS = [
    { key: "world", label: "Dünya" },
    { key: "world_less_china", label: "Dünya (Çin Hariç)" },
    { key: "united_states", label: "ABD" },
    { key: "total_foreign", label: "ABD Dışı Toplam" },
    { key: "china", label: "Çin" },
  ];
  const MEASURE_ORDER = [
    "area_planted", "area_harvested", "yield_per_acre",
    "beginning_stocks", "production", "imports", "supply_total",
    "feed", "crush", "feed_and_residual", "food_seed_industrial", "ethanol_byproducts",
    "domestic_disappearance", "biofuel", "food_feed_other_industrial", "domestic_total",
    "seed", "residual", "exports", "use_total", "ending_stocks",
    "avg_price",
  ];
  const MONTH_ORDER = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
  const FEATURED_ORDER = ["ending_stocks", "production", "exports", "avg_price", "domestic_total"];

  function periodSortKey(label) {
    const my = label.slice(0, 7); // "2026/27"
    const m = /([A-Z][a-z]{2})\s*$/.exec(label);
    const monthIdx = m && MONTH_ORDER[m[1]] != null ? MONTH_ORDER[m[1]] : -1;
    return my + "_" + String(monthIdx + 1).padStart(2, "0");
  }

  function fmtWasdeValue(value, unitLabelTr) {
    if (value == null || isNaN(value)) return "—";
    const num = Math.abs(value) >= 100
      ? value.toLocaleString("tr-TR", { maximumFractionDigits: 0 })
      : value.toLocaleString("tr-TR", { maximumFractionDigits: 2 });
    return num + " " + unitLabelTr;
  }

  function fmtPct(value) {
    if (value == null || isNaN(value)) return null;
    return (value >= 0 ? "+" : "") + value.toFixed(1) + "%";
  }

  const CACHE_TTL_MS = 30 * 60 * 1000; // 30 dk — WASDE ayda bir güncelleniyor

  async function fetchWasdeRows() {
    const cached = window.__supaCache.get("wasde", CACHE_TTL_MS);
    if (cached) return cached;

    const headers = { apikey: cfg.SUPABASE_ANON_KEY, Authorization: `Bearer ${cfg.SUPABASE_ANON_KEY}` };
    const pageSize = 1000;
    let rows = [];
    let from = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const res = await fetch(
        `${cfg.SUPABASE_URL}/rest/v1/wasde_stats?select=report_date,release_number,commodity,scope,region,period_label,marketing_year,measure,measure_label_tr,value,unit,unit_label_tr&order=id.asc`,
        { headers: Object.assign({}, headers, { Range: `${from}-${from + pageSize - 1}` }) }
      );
      if (!res.ok) throw new Error(`Supabase istek hatası: ${res.status}`);
      const page = await res.json();
      rows = rows.concat(page);
      if (page.length < pageSize) break;
      from += pageSize;
    }
    window.__supaCache.set("wasde", rows);
    return rows;
  }

  function init(allRows) {
    if (!allRows.length) {
      document.getElementById("wasde-release-badge").textContent = "Henüz veri yok";
      document.getElementById("wasde-table-title").textContent = "Bilanço tablosu — henüz veri yüklenmedi";
      return;
    }

    const latestReportDate = allRows.reduce((max, r) => (r.report_date > max ? r.report_date : max), allRows[0].report_date);
    const rows = allRows.filter(r => r.report_date === latestReportDate);
    const latestRelease = rows[0].release_number;

    const badge = document.getElementById("wasde-release-badge");
    const d = new Date(latestReportDate + "T00:00:00");
    badge.textContent = `WASDE-${latestRelease} · ${d.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}`;

    const state = { commodity: "corn", scope: "us", region: "world" };

    function currentRows() {
      return rows.filter(r => {
        if (r.commodity !== state.commodity) return false;
        if (r.scope !== state.scope) return false;
        if (state.scope === "world" && r.region !== state.region) return false;
        return true;
      });
    }

    function periodsFor(rs) {
      const set = new Set(rs.map(r => r.period_label));
      return [...set].sort((a, b) => periodSortKey(a).localeCompare(periodSortKey(b)));
    }

    function buildCommodityControls() {
      const wrap = document.getElementById("wasde-commodity");
      wrap.textContent = "";
      COMMODITIES.forEach(c => {
        const btn = document.createElement("button");
        btn.className = "seg" + (state.commodity === c.key ? " active" : "");
        btn.type = "button";
        btn.textContent = c.label;
        btn.addEventListener("click", () => {
          state.commodity = c.key;
          if (state.scope === "world" && !WORLD_AVAILABLE[c.key]) {
            state.scope = "us";
            document.querySelectorAll("#wasde-scope .seg").forEach(b => b.classList.toggle("active", b.dataset.value === "us"));
          }
          wrap.querySelectorAll(".seg").forEach(b => b.classList.toggle("active", b === btn));
          renderAll();
        });
        wrap.appendChild(btn);
      });
    }

    function buildScopeControls() {
      const wrap = document.getElementById("wasde-scope");
      wrap.querySelectorAll(".seg").forEach(btn => {
        btn.addEventListener("click", () => {
          if (btn.dataset.value === "world" && !WORLD_AVAILABLE[state.commodity]) return;
          state.scope = btn.dataset.value;
          wrap.querySelectorAll(".seg").forEach(b => b.classList.toggle("active", b === btn));
          renderAll();
        });
      });
    }

    function buildRegionControls() {
      const wrap = document.getElementById("wasde-region");
      wrap.textContent = "";
      REGIONS.forEach(r => {
        const btn = document.createElement("button");
        btn.className = "seg" + (state.region === r.key ? " active" : "");
        btn.type = "button";
        btn.textContent = r.label;
        btn.addEventListener("click", () => {
          state.region = r.key;
          wrap.querySelectorAll(".seg").forEach(b => b.classList.toggle("active", b === btn));
          renderAll();
        });
        wrap.appendChild(btn);
      });
    }

    function renderRegionVisibility() {
      document.getElementById("wasde-region-group").style.display = state.scope === "world" ? "" : "none";
      const worldBtn = document.querySelector('#wasde-scope .seg[data-value="world"]');
      worldBtn.disabled = !WORLD_AVAILABLE[state.commodity];
      worldBtn.title = WORLD_AVAILABLE[state.commodity] ? "" : "WASDE bu ürün için Dünya tablosu yayınlamıyor (sadece ABD)";
    }

    function renderKpis() {
      const rs = currentRows();
      const periods = periodsFor(rs);
      const latestPeriod = periods[periods.length - 1];
      const byMeasure = {};
      rs.forEach(r => { (byMeasure[r.measure] = byMeasure[r.measure] || {})[r.period_label] = r; });

      const featured = FEATURED_ORDER.filter(m => byMeasure[m] && byMeasure[m][latestPeriod]).slice(0, 4);

      const container = document.getElementById("wasde-kpi-row");
      container.textContent = "";
      featured.forEach(measure => {
        const cell = byMeasure[measure][latestPeriod];
        const tile = document.createElement("div");
        tile.className = "stat-tile";
        const label = document.createElement("div");
        label.className = "label"; label.textContent = cell.measure_label_tr + " (" + latestPeriod + ")";
        const value = document.createElement("div");
        value.className = "value num"; value.textContent = fmtWasdeValue(cell.value, cell.unit_label_tr);
        tile.appendChild(label); tile.appendChild(value);

        if (measure === "ending_stocks") {
          const mom = byMeasure["ending_stocks_mom_change_pct"] && byMeasure["ending_stocks_mom_change_pct"][latestPeriod];
          const yoy = byMeasure["ending_stocks_yoy_change_pct"] && byMeasure["ending_stocks_yoy_change_pct"][latestPeriod];
          [["Önceki rapora göre", mom], ["Önceki yıla göre", yoy]].forEach(([suffix, r]) => {
            if (!r) return;
            const d2 = document.createElement("div");
            const dir = r.value > 0.05 ? "up" : r.value < -0.05 ? "down" : "flat";
            d2.className = "delta " + dir;
            d2.textContent = (r.value >= 0 ? "▲ " : "▼ ") + Math.abs(r.value).toFixed(1) + "% " + suffix;
            tile.appendChild(d2);
          });
        }
        container.appendChild(tile);
      });
    }

    function renderTable() {
      const rs = currentRows();
      const periods = periodsFor(rs);
      const byMeasure = new Map();
      rs.forEach(r => {
        if (r.measure.endsWith("_change_pct")) return;
        if (!byMeasure.has(r.measure)) byMeasure.set(r.measure, { label: r.measure_label_tr, unit: r.unit_label_tr, byPeriod: {} });
        byMeasure.get(r.measure).byPeriod[r.period_label] = r.value;
      });
      const momByPeriod = {}, yoyByPeriod = {};
      rs.forEach(r => {
        if (r.measure === "ending_stocks_mom_change_pct") momByPeriod[r.period_label] = r.value;
        if (r.measure === "ending_stocks_yoy_change_pct") yoyByPeriod[r.period_label] = r.value;
      });

      const measures = [...byMeasure.keys()].sort((a, b) => {
        const ia = MEASURE_ORDER.indexOf(a), ib = MEASURE_ORDER.indexOf(b);
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      });

      const commodityLabel = COMMODITIES.find(c => c.key === state.commodity).label;
      const scopeLabel = state.scope === "us" ? "ABD" : REGIONS.find(r => r.key === state.region).label;
      document.getElementById("wasde-table-title").textContent = `${commodityLabel} — ${scopeLabel} Arz-Talep Bilançosu`;

      const thead = document.getElementById("wasde-thead");
      thead.textContent = "";
      const headCols = ["Kalem"].concat(periods).concat(["Bir Önceki Rapora Göre", "Bir Önceki Yıla Göre"]);
      headCols.forEach(label => {
        const th = document.createElement("th");
        th.textContent = label;
        if (label !== "Kalem") th.classList.add("num-col");
        thead.appendChild(th);
      });

      const tbody = document.getElementById("wasde-tbody");
      tbody.textContent = "";
      if (!measures.length) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.textContent = "Bu kombinasyon için veri yok.";
        td.colSpan = headCols.length;
        tr.appendChild(td);
        tbody.appendChild(tr);
        return;
      }

      measures.forEach(measure => {
        const m = byMeasure.get(measure);
        const tr = document.createElement("tr");
        const labelTd = document.createElement("td");
        labelTd.textContent = m.label;
        tr.appendChild(labelTd);
        periods.forEach(p => {
          const td = document.createElement("td");
          td.className = "num-col num";
          td.textContent = m.byPeriod[p] != null ? fmtWasdeValue(m.byPeriod[p], m.unit) : "—";
          tr.appendChild(td);
        });
        [momByPeriod, yoyByPeriod].forEach(bucket => {
          const td = document.createElement("td");
          td.className = "num-col";
          if (measure === "ending_stocks" && bucket[periods[periods.length - 1]] != null) {
            const v = bucket[periods[periods.length - 1]];
            const pill = document.createElement("span");
            pill.className = "trend-pill " + (v > 0.05 ? "up" : v < -0.05 ? "down" : "flat");
            pill.textContent = fmtPct(v);
            td.appendChild(pill);
          } else {
            td.textContent = "—";
          }
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
    }

    function renderAll() {
      renderRegionVisibility();
      renderKpis();
      renderTable();
    }

    buildCommodityControls();
    buildScopeControls();
    buildRegionControls();
    renderAll();
  }

  let loaded = false;
  window.__tabManager.register("tab-wasde", "wasde-panel", () => {
    if (loaded) return;
    loaded = true;
    fetchWasdeRows()
      .then(rows => init(rows))
      .catch(err => {
        console.error(err);
        document.getElementById("wasde-release-badge").textContent = "Veri çekilemedi";
        document.getElementById("wasde-table-title").textContent = "Bilanço tablosu yüklenemedi — Supabase bağlantısını kontrol edin";
      });
  });
})();

// ---------------------------------------------------------------------------
// Ticaret Borsası sekmesi — 3-4 emtia borsasından 15 dakikada bir çekilen
// anlık fiyatlar. Kaynak (hangi borsa/API) henüz tanımlanmadı; bu yüzden
// exchange_prices tablosu şimdilik boş olabilir — sayfa buna göre net bir
// boş-durum gösteriyor, veri geldiğinde hiçbir kod değişikliği gerekmeden
// otomatik dolacak (borsa adları koda gömülü değil, veriden türetiliyor).
(function () {
  "use strict";

  const cfg = window.TUIK_DASHBOARD_CONFIG;
  const CAT_COLORS = [
    "var(--series-export)", "var(--series-import)", "var(--cat-3)", "var(--cat-4)", "var(--cat-5)",
    "var(--cat-6)", "var(--cat-7)", "var(--cat-8)", "var(--cat-9)", "var(--cat-10)", "var(--cat-11)",
  ];
  const CHART_W = 560, CHART_H = 150, PADL = 56, PADR = 14, PADT = 10, PADB = 22;

  function fmtPrice(value, currency, unit) {
    if (value == null || isNaN(value)) return "—";
    const num = Math.abs(value) >= 100
      ? value.toLocaleString("tr-TR", { maximumFractionDigits: 1 })
      : value.toLocaleString("tr-TR", { maximumFractionDigits: 2 });
    return num + " " + unit;
  }

  function fmtDateTime(iso) {
    const d = new Date(iso);
    return d.toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  const CACHE_TTL_MS = 5 * 60 * 1000; // 5 dk — borsa fiyatları 15 dk'da bir güncellenecek

  async function fetchExchangeRows() {
    const cached = window.__supaCache.get("exchange", CACHE_TTL_MS);
    if (cached) return cached;

    const headers = { apikey: cfg.SUPABASE_ANON_KEY, Authorization: `Bearer ${cfg.SUPABASE_ANON_KEY}` };
    const pageSize = 1000;
    let rows = [];
    let from = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const res = await fetch(
        `${cfg.SUPABASE_URL}/rest/v1/exchange_prices?select=exchange,exchange_label_tr,symbol,commodity_label_tr,price,currency,unit,change_pct,recorded_at,fetched_at&order=recorded_at.asc`,
        { headers: Object.assign({}, headers, { Range: `${from}-${from + pageSize - 1}` }) }
      );
      if (!res.ok) throw new Error(`Supabase istek hatası: ${res.status}`);
      const page = await res.json();
      rows = rows.concat(page);
      if (page.length < pageSize) break;
      from += pageSize;
    }
    window.__supaCache.set("exchange", rows);
    return rows;
  }

  function groupRows(rows) {
    const map = new Map();
    rows.forEach(r => {
      const key = r.exchange + "§" + r.symbol;
      if (!map.has(key)) {
        map.set(key, {
          exchange: r.exchange, symbol: r.symbol,
          exchangeLabel: r.exchange_label_tr, commodityLabel: r.commodity_label_tr,
          currency: r.currency, unit: r.unit, points: [],
        });
      }
      map.get(key).points.push({ price: r.price, changePct: r.change_pct, recordedAt: r.recorded_at, fetchedAt: r.fetched_at });
    });
    return [...map.values()];
  }

  function exportCsv(rows) {
    const cols = ["exchange", "exchange_label_tr", "symbol", "commodity_label_tr", "price", "currency", "unit", "change_pct", "recorded_at"];
    const esc = v => {
      const s = v == null ? "" : String(v);
      return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [cols.join(";")].concat(rows.map(r => cols.map(c => esc(r[c])).join(";")));
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ticaret-borsasi-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // ---------- küçük tooltip (WASDE/TÜİK panelleriyle aynı görünüm) ----------
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

  // tek seri, zaman damgalı basit çizgi grafiği — nokta sayısı kadar eşit
  // aralıklı x ekseni (borsa kapalıyken veri olmadığı için gerçek takvim
  // aralığı yerine ardışık gözlem bazlı, tipik bir işlem-seansı grafiği gibi).
  function drawPriceChart(svg, points, color) {
    svg.textContent = "";
    svg.setAttribute("viewBox", "0 0 " + CHART_W + " " + CHART_H);
    if (!points.length) {
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", PADL); t.setAttribute("y", CHART_H / 2); t.setAttribute("class", "axis-label");
      t.textContent = "Henüz veri yok.";
      svg.appendChild(t);
      return;
    }
    const xStep = points.length > 1 ? (CHART_W - PADL - PADR) / (points.length - 1) : 0;
    const xScale = i => points.length > 1 ? PADL + i * xStep : (PADL + (CHART_W - PADR)) / 2;
    const values = points.map(p => p.price);
    const minVal = Math.min(...values), maxVal = Math.max(...values);
    const span = maxVal - minVal || Math.abs(maxVal) || 1;
    const yPad = span * 0.1;
    const yScale = v => CHART_H - PADB - ((v - minVal + yPad) / (span + 2 * yPad)) * (CHART_H - PADB - PADT);

    for (let g = 0; g <= 3; g++) {
      const y = PADT + (g * (CHART_H - PADB - PADT)) / 3;
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("class", "gridline");
      line.setAttribute("x1", PADL); line.setAttribute("x2", CHART_W - PADR);
      line.setAttribute("y1", y); line.setAttribute("y2", y);
      svg.appendChild(line);
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", PADL - 8); t.setAttribute("y", y + 3);
      t.setAttribute("text-anchor", "end"); t.setAttribute("class", "axis-label");
      t.textContent = (maxVal + yPad - (g * (span + 2 * yPad)) / 3).toLocaleString("tr-TR", { maximumFractionDigits: 1 });
      svg.appendChild(t);
    }

    const minLabelGap = 56;
    const tickEvery = Math.max(1, Math.ceil(minLabelGap / Math.max(xStep, 1)));
    points.forEach((p, i) => {
      const isLast = i === points.length - 1;
      if (i % tickEvery !== 0 && !isLast) return;
      if (isLast && points.length > 1 && (points.length - 1) % tickEvery !== 0) {
        const prevShown = Math.floor((points.length - 1) / tickEvery) * tickEvery;
        if ((points.length - 1 - prevShown) * xStep < minLabelGap) return;
      }
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", xScale(i)); t.setAttribute("y", CHART_H - 5);
      t.setAttribute("text-anchor", "middle"); t.setAttribute("class", "axis-label");
      t.textContent = fmtDateTime(p.recordedAt).split(" ").slice(-1)[0];
      svg.appendChild(t);
    });

    const hoverLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
    hoverLine.setAttribute("class", "baseline");
    hoverLine.setAttribute("y1", PADT); hoverLine.setAttribute("y2", CHART_H - PADB);
    hoverLine.style.opacity = "0";
    svg.appendChild(hoverLine);

    const pts = points.map((p, i) => [xScale(i), yScale(p.price)]);
    if (pts.length === 1) {
      const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      dot.setAttribute("cx", pts[0][0]); dot.setAttribute("cy", pts[0][1]); dot.setAttribute("r", "4");
      dot.setAttribute("fill", color);
      svg.appendChild(dot);
    } else {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", pts.map((p, i) => (i === 0 ? "M" : "L") + p[0] + "," + p[1]).join(" "));
      path.setAttribute("stroke", color); path.setAttribute("stroke-width", "2");
      path.setAttribute("fill", "none"); path.setAttribute("stroke-linejoin", "round"); path.setAttribute("stroke-linecap", "round");
      svg.appendChild(path);
    }

    const hitLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    points.forEach((p, i) => {
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      const hitW = Math.max(xStep, 6);
      rect.setAttribute("x", xScale(i) - hitW / 2); rect.setAttribute("y", PADT);
      rect.setAttribute("width", hitW); rect.setAttribute("height", CHART_H - PADB - PADT);
      rect.setAttribute("fill", "transparent"); rect.style.cursor = "pointer";
      rect.tabIndex = 0;
      const showFn = evt => {
        hoverLine.setAttribute("x1", xScale(i)); hoverLine.setAttribute("x2", xScale(i));
        hoverLine.style.opacity = "1";
        const wrap = document.createElement("div");
        const ttl = document.createElement("div"); ttl.className = "ttl"; ttl.textContent = fmtDateTime(p.recordedAt);
        wrap.appendChild(ttl);
        const row = document.createElement("div"); row.className = "row";
        const v = document.createElement("span"); v.className = "val"; v.textContent = p.price.toLocaleString("tr-TR", { maximumFractionDigits: 2 });
        row.appendChild(v);
        wrap.appendChild(row);
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

  function render(allRows) {
    const badge = document.getElementById("exchange-asof-badge");
    const sectionsEl = document.getElementById("exchange-sections");
    const kpiEl = document.getElementById("exchange-kpi-row");
    sectionsEl.textContent = "";
    kpiEl.textContent = "";

    if (!allRows.length) {
      badge.textContent = "Veri yok";
      const empty = document.createElement("p");
      empty.style.color = "var(--text-muted)";
      empty.style.fontSize = "13px";
      empty.textContent = "Borsa kaynağı henüz tanımlanmadı — veri bekleniyor. Kaynaklar eklendiğinde bu sayfa otomatik dolacak, hiçbir ekran değişikliği gerekmeyecek.";
      sectionsEl.appendChild(empty);
      return;
    }

    const groups = groupRows(allRows);
    const latestFetch = allRows.reduce((max, r) => (r.fetched_at > max ? r.fetched_at : max), allRows[0].fetched_at);
    badge.textContent = "Son güncelleme: " + fmtDateTime(latestFetch);

    groups.forEach((g, i) => {
      const color = CAT_COLORS[i % CAT_COLORS.length];
      const last = g.points[g.points.length - 1];

      const tile = document.createElement("div");
      tile.className = "stat-tile";
      const label = document.createElement("div");
      label.className = "label"; label.textContent = g.exchangeLabel + " · " + g.commodityLabel;
      const value = document.createElement("div");
      value.className = "value num"; value.textContent = fmtPrice(last.price, g.currency, g.unit);
      tile.appendChild(label); tile.appendChild(value);
      if (last.changePct != null) {
        const d = document.createElement("div");
        const dir = last.changePct > 0.05 ? "up" : last.changePct < -0.05 ? "down" : "flat";
        d.className = "delta " + dir;
        d.textContent = (last.changePct >= 0 ? "▲ " : "▼ ") + Math.abs(last.changePct).toFixed(2) + "%";
        tile.appendChild(d);
      }
      kpiEl.appendChild(tile);

      const card = document.createElement("div");
      card.className = "card";
      card.style.marginTop = "14px";
      const head = document.createElement("div");
      head.className = "card-head";
      const h3 = document.createElement("h2");
      h3.textContent = g.exchangeLabel + " — " + g.commodityLabel + " (" + g.symbol + ")";
      head.appendChild(h3);
      const upd = document.createElement("span");
      upd.className = "trend-range-label";
      upd.textContent = fmtDateTime(last.recordedAt);
      head.appendChild(upd);
      card.appendChild(head);

      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "chart");
      svg.setAttribute("role", "img");
      svg.setAttribute("aria-label", g.commodityLabel + " fiyat eğilimi");
      card.appendChild(svg);
      drawPriceChart(svg, g.points, color);

      sectionsEl.appendChild(card);
    });
  }

  let loaded = false;
  let cachedRows = [];
  window.__tabManager.register("tab-exchange", "exchange-panel", () => {
    if (loaded) return;
    loaded = true;
    fetchExchangeRows()
      .then(rows => { cachedRows = rows; render(rows); })
      .catch(err => {
        console.error(err);
        document.getElementById("exchange-asof-badge").textContent = "Veri çekilemedi";
      });
  });

  document.getElementById("exchange-export-btn").addEventListener("click", () => {
    if (!cachedRows.length) return;
    exportCsv(cachedRows);
  });

  // ---------- Ticaret Borsası alt sekmesi: Canlı Kurlar / TÜRİB / UZTB ----------
  const EXCHANGE_SUBTABS = {
    live: { tabId: "subtab-live", sectionId: "exchange-live-section" },
    turib: { tabId: "subtab-turib", sectionId: "turib-section", onActivate: () => window.__turibTab && window.__turibTab.onActivate() },
    uztb: { tabId: "subtab-uztb", sectionId: "uztb-section", onActivate: () => window.__uztbTab && window.__uztbTab.onActivate() },
    ktb: { tabId: "subtab-ktb", sectionId: "ktb-section", onActivate: () => window.__ktbTab && window.__ktbTab.onActivate() },
  };
  Object.entries(EXCHANGE_SUBTABS).forEach(([key, cfgSub]) => {
    document.getElementById(cfgSub.tabId).addEventListener("click", () => showExchangeSubtab(key));
  });
  function showExchangeSubtab(which) {
    Object.entries(EXCHANGE_SUBTABS).forEach(([key, cfgSub]) => {
      const isActive = key === which;
      document.getElementById(cfgSub.tabId).classList.toggle("active", isActive);
      document.getElementById(cfgSub.tabId).setAttribute("aria-selected", String(isActive));
      document.getElementById(cfgSub.sectionId).hidden = !isActive;
      if (isActive && cfgSub.onActivate) cfgSub.onActivate();
    });
  }
})();

// ---------------------------------------------------------------------------
// TÜRİB (Türkiye Ürün İhtisas Borsası) alt sekmesi — Ticaret Borsası
// sekmesinin içinde ikinci bir kaynak: TÜİK/WASDE/ESR'den tamamen ayrı,
// günlük bülten kazınarak elde edilen GERÇEK elektronik ürün senedi (ELÜS)
// işlemleri (sadece Normal Seans). Varsayılan ürün filtresi "MISIR 1.SINIF".
(function () {
  "use strict";

  const cfg = window.TUIK_DASHBOARD_CONFIG;
  const LINE_COLOR = "var(--series-export)";
  const CHART_W = 960, CHART_H = 240, PADL = 70, PADR = 20, PADT = 16, PADB = 28;
  const DEFAULT_PRODUCT = "MISIR 1.SINIF";

  function fmtKg(v) {
    if (v == null || isNaN(v)) return "—";
    const a = Math.abs(v);
    if (a >= 1e6) return (v / 1e6).toFixed(2) + "M kg";
    if (a >= 1e3) return (v / 1e3).toFixed(1) + "K kg";
    return (Math.round(v) || 0) + " kg";
  }
  function fmtTl(v) {
    if (v == null || isNaN(v)) return "—";
    const a = Math.abs(v);
    if (a >= 1e6) return (v / 1e6).toFixed(2) + "M TL";
    if (a >= 1e3) return (v / 1e3).toFixed(1) + "K TL";
    return (Math.round(v) || 0) + " TL";
  }
  // v: TL/ton olarak ZATEN ölçeklenmiş değer bekler (dailyWeightedSeries/
  // overallWeightedAvg dönüşü) — ham DB değeri (TL/kg) veriliyorsa çağıran
  // taraf ×1000 yapmalı (bkz. tablo satırları).
  function fmtPriceTon(v) {
    if (v == null || isNaN(v)) return "—";
    return v.toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " TL/ton";
  }
  function fmtDateShort(iso) {
    return new Date(iso + "T00:00:00").toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
  }
  function fmtDateFull(iso) {
    return new Date(iso + "T00:00:00").toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  }

  const CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3 saat — veri günde bir (18:00) güncelleniyor

  async function fetchTuribRows() {
    const cached = window.__supaCache.get("turib", CACHE_TTL_MS);
    if (cached) return cached;

    const headers = { apikey: cfg.SUPABASE_ANON_KEY, Authorization: `Bearer ${cfg.SUPABASE_ANON_KEY}` };
    const pageSize = 1000;
    let rows = [];
    let from = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const res = await fetch(
        `${cfg.SUPABASE_URL}/rest/v1/turib_bulletin?select=trade_date,isin_kodu,enstruman_sinifi,agirlikli_ortalama_fiyat,en_dusuk,en_yuksek,islem_adedi,islem_miktari_kg,islem_hacmi_tl,lidas_adi,il,ilce&order=trade_date.asc`,
        { headers: Object.assign({}, headers, { Range: `${from}-${from + pageSize - 1}` }) }
      );
      if (!res.ok) throw new Error(`Supabase istek hatası: ${res.status}`);
      const page = await res.json();
      rows = rows.concat(page);
      if (page.length < pageSize) break;
      from += pageSize;
    }
    window.__supaCache.set("turib", rows);
    return rows;
  }

  // ---------- tooltip (diğer panellerle aynı görünüm) ----------
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

  let allRows = [];
  const state = { product: null, lidas: null, dateStart: null, dateEnd: null, tableSearch: "" };

  function productRows() {
    return allRows.filter(r => r.enstruman_sinifi === state.product);
  }
  function currentRows() {
    return productRows().filter(r => {
      if (state.lidas && r.lidas_adi !== state.lidas) return false;
      if (state.dateStart && r.trade_date < state.dateStart) return false;
      if (state.dateEnd && r.trade_date > state.dateEnd) return false;
      return true;
    });
  }

  // tarihe göre hacim-ağırlıklı ortalama fiyat: her satırın kendi
  // ağırlıklı ortalama fiyatını, o satırın işlem miktarıyla tartarak
  // birleştiriyoruz (tek bir ISIN'in günlük fiyatı zaten kendi içinde
  // ağırlıklı — burada sadece aynı güne ait birden çok ISIN/LİDAŞ'ı
  // doğru şekilde tek bir günlük fiyata indiriyoruz). En düşük/en yüksek
  // o günün tüm satırlarındaki en_dusuk/en_yuksek'in min/max'ı. Fiyatlar
  // TL/ton'a çevrilerek (×1000) döndürülüyor — DB TL/kg tutuyor.
  function dailyWeightedSeries(rows) {
    const byDate = new Map();
    rows.forEach(r => {
      if (r.agirlikli_ortalama_fiyat == null || r.islem_miktari_kg == null) return;
      const e = byDate.get(r.trade_date) || { sumPriceKg: 0, sumKg: 0, minPrice: null, maxPrice: null };
      e.sumPriceKg += r.agirlikli_ortalama_fiyat * r.islem_miktari_kg;
      e.sumKg += r.islem_miktari_kg;
      if (r.en_dusuk != null && r.en_dusuk > 0) e.minPrice = e.minPrice == null ? r.en_dusuk : Math.min(e.minPrice, r.en_dusuk);
      if (r.en_yuksek != null && r.en_yuksek > 0) e.maxPrice = e.maxPrice == null ? r.en_yuksek : Math.max(e.maxPrice, r.en_yuksek);
      byDate.set(r.trade_date, e);
    });
    return [...byDate.entries()]
      .map(([date, e]) => ({
        date,
        price: e.sumKg > 0 ? (e.sumPriceKg / e.sumKg) * 1000 : null,
        minPrice: e.minPrice != null ? e.minPrice * 1000 : null,
        maxPrice: e.maxPrice != null ? e.maxPrice * 1000 : null,
        kg: e.sumKg,
        ton: e.sumKg / 1000,
      }))
      .filter(p => p.price != null)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  function overallWeightedAvg(rows) {
    let sumPriceKg = 0, sumKg = 0;
    rows.forEach(r => {
      if (r.agirlikli_ortalama_fiyat == null || r.islem_miktari_kg == null) return;
      sumPriceKg += r.agirlikli_ortalama_fiyat * r.islem_miktari_kg;
      sumKg += r.islem_miktari_kg;
    });
    return sumKg > 0 ? (sumPriceKg / sumKg) * 1000 : null;
  }

  function renderPriceLegend() {
    const el = document.getElementById("turib-price-legend");
    el.textContent = "";
    [
      ["Ağırlıklı Ortalama", false],
      ["En Yüksek", true],
      ["En Düşük", true],
    ].forEach(([label, dashed]) => {
      const key = document.createElement("span");
      key.className = "key";
      const sw = document.createElement("span");
      sw.className = "swatch-line" + (dashed ? " dashed" : "");
      sw.style.background = dashed ? "none" : LINE_COLOR;
      sw.style.borderColor = LINE_COLOR;
      key.appendChild(sw);
      key.appendChild(document.createTextNode(label));
      el.appendChild(key);
    });
  }

  // sıçramalı (null) günlerde çizgiyi koparan, birden çok alt-yol içerebilen
  // path verisi üretir — min/max her gün dolu olmayabilir.
  function buildGappedPath(points, field, xScale, yScale) {
    let d = "";
    let drawing = false;
    points.forEach((p, i) => {
      const v = p[field];
      if (v == null) { drawing = false; return; }
      d += (drawing ? "L" : "M") + xScale(i) + "," + yScale(v) + " ";
      drawing = true;
    });
    return d.trim();
  }

  function drawPriceChart(points) {
    const svg = document.getElementById("turib-chart");
    svg.textContent = "";
    svg.setAttribute("viewBox", "0 0 " + CHART_W + " " + CHART_H);
    if (!points.length) {
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", PADL); t.setAttribute("y", CHART_H / 2); t.setAttribute("class", "axis-label");
      t.textContent = "Bu filtrede veri yok.";
      svg.appendChild(t);
      return;
    }
    const xStep = points.length > 1 ? (CHART_W - PADL - PADR) / (points.length - 1) : 0;
    const xScale = i => points.length > 1 ? PADL + i * xStep : (PADL + (CHART_W - PADR)) / 2;
    const allVals = points.flatMap(p => [p.price, p.minPrice, p.maxPrice]).filter(v => v != null);
    const minVal = Math.min(...allVals), maxVal = Math.max(...allVals);
    const span = maxVal - minVal || Math.abs(maxVal) || 1;
    const yPad = span * 0.1;
    const yScale = v => CHART_H - PADB - ((v - minVal + yPad) / (span + 2 * yPad)) * (CHART_H - PADB - PADT);

    for (let g = 0; g <= 3; g++) {
      const y = PADT + (g * (CHART_H - PADB - PADT)) / 3;
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("class", "gridline");
      line.setAttribute("x1", PADL); line.setAttribute("x2", CHART_W - PADR);
      line.setAttribute("y1", y); line.setAttribute("y2", y);
      svg.appendChild(line);
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", PADL - 8); t.setAttribute("y", y + 3);
      t.setAttribute("text-anchor", "end"); t.setAttribute("class", "axis-label");
      t.textContent = Math.round(maxVal + yPad - (g * (span + 2 * yPad)) / 3).toLocaleString("tr-TR");
      svg.appendChild(t);
    }

    const minLabelGap = 56;
    const tickEvery = Math.max(1, Math.ceil(minLabelGap / Math.max(xStep, 1)));
    points.forEach((p, i) => {
      const isLast = i === points.length - 1;
      if (i % tickEvery !== 0 && !isLast) return;
      if (isLast && points.length > 1 && (points.length - 1) % tickEvery !== 0) {
        const prevShown = Math.floor((points.length - 1) / tickEvery) * tickEvery;
        if ((points.length - 1 - prevShown) * xStep < minLabelGap) return;
      }
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", xScale(i)); t.setAttribute("y", CHART_H - 5);
      t.setAttribute("text-anchor", "middle"); t.setAttribute("class", "axis-label");
      t.textContent = fmtDateShort(p.date);
      svg.appendChild(t);
    });

    const hoverLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
    hoverLine.setAttribute("class", "baseline");
    hoverLine.setAttribute("y1", PADT); hoverLine.setAttribute("y2", CHART_H - PADB);
    hoverLine.style.opacity = "0";
    svg.appendChild(hoverLine);

    const avgPts = points.map((p, i) => [xScale(i), yScale(p.price)]);
    if (avgPts.length === 1) {
      const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      dot.setAttribute("cx", avgPts[0][0]); dot.setAttribute("cy", avgPts[0][1]); dot.setAttribute("r", "4");
      dot.setAttribute("fill", LINE_COLOR);
      svg.appendChild(dot);
    } else {
      const gradId = "turibAreaGradient";
      const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
      const grad = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
      grad.setAttribute("id", gradId);
      grad.setAttribute("x1", "0"); grad.setAttribute("y1", "0"); grad.setAttribute("x2", "0"); grad.setAttribute("y2", "1");
      const stop1 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
      stop1.setAttribute("offset", "0%"); stop1.setAttribute("stop-color", LINE_COLOR); stop1.setAttribute("stop-opacity", "0.18");
      const stop2 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
      stop2.setAttribute("offset", "100%"); stop2.setAttribute("stop-color", LINE_COLOR); stop2.setAttribute("stop-opacity", "0");
      grad.appendChild(stop1); grad.appendChild(stop2);
      defs.appendChild(grad);
      svg.appendChild(defs);

      const baseline = CHART_H - PADB;
      const areaD = "M" + avgPts[0][0] + "," + baseline + " " + avgPts.map(p => "L" + p[0] + "," + p[1]).join(" ") + " L" + avgPts[avgPts.length - 1][0] + "," + baseline + " Z";
      const area = document.createElementNS("http://www.w3.org/2000/svg", "path");
      area.setAttribute("d", areaD);
      area.setAttribute("fill", "url(#" + gradId + ")");
      area.setAttribute("stroke", "none");
      svg.appendChild(area);

      // kesikli en yüksek / en düşük çizgileri — ortalamanın altında kalsın
      ["maxPrice", "minPrice"].forEach(field => {
        const d = buildGappedPath(points, field, xScale, yScale);
        if (!d) return;
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", d);
        path.setAttribute("stroke", LINE_COLOR); path.setAttribute("stroke-width", "1.5");
        path.setAttribute("stroke-dasharray", "5 4"); path.setAttribute("opacity", "0.6");
        path.setAttribute("fill", "none"); path.setAttribute("stroke-linecap", "round");
        svg.appendChild(path);
      });

      // kalın ağırlıklı ortalama çizgisi — en üstte, en belirgin
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", avgPts.map((p, i) => (i === 0 ? "M" : "L") + p[0] + "," + p[1]).join(" "));
      path.setAttribute("stroke", LINE_COLOR); path.setAttribute("stroke-width", "3");
      path.setAttribute("fill", "none"); path.setAttribute("stroke-linejoin", "round"); path.setAttribute("stroke-linecap", "round");
      svg.appendChild(path);

      const lastPt = avgPts[avgPts.length - 1];
      const endDot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      endDot.setAttribute("cx", lastPt[0]); endDot.setAttribute("cy", lastPt[1]); endDot.setAttribute("r", "4.5");
      endDot.setAttribute("fill", "var(--surface-1)"); endDot.setAttribute("stroke", LINE_COLOR); endDot.setAttribute("stroke-width", "2.5");
      svg.appendChild(endDot);
    }

    const hitLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    points.forEach((p, i) => {
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      const hitW = Math.max(xStep, 6);
      rect.setAttribute("x", xScale(i) - hitW / 2); rect.setAttribute("y", PADT);
      rect.setAttribute("width", hitW); rect.setAttribute("height", CHART_H - PADB - PADT);
      rect.setAttribute("fill", "transparent"); rect.style.cursor = "pointer";
      rect.tabIndex = 0;
      const showFn = evt => {
        hoverLine.setAttribute("x1", xScale(i)); hoverLine.setAttribute("x2", xScale(i));
        hoverLine.style.opacity = "1";
        const wrap = document.createElement("div");
        const ttl = document.createElement("div"); ttl.className = "ttl"; ttl.textContent = fmtDateFull(p.date);
        wrap.appendChild(ttl);
        [["Ağırlıklı Ort.", p.price], ["En Yüksek", p.maxPrice], ["En Düşük", p.minPrice]].forEach(([label, val]) => {
          const row = document.createElement("div"); row.className = "row";
          const l = document.createElement("span"); l.textContent = label + ": ";
          const v = document.createElement("span"); v.className = "val"; v.textContent = fmtPriceTon(val);
          row.appendChild(l); row.appendChild(v);
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

  const TON_CHART_H = 110, TON_PADT = 10, TON_PADB = 24;

  function drawTonnageChart(points) {
    const svg = document.getElementById("turib-tonnage-chart");
    svg.textContent = "";
    svg.setAttribute("viewBox", "0 0 " + CHART_W + " " + TON_CHART_H);
    if (!points.length) {
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", PADL); t.setAttribute("y", TON_CHART_H / 2); t.setAttribute("class", "axis-label");
      t.textContent = "Bu filtrede veri yok.";
      svg.appendChild(t);
      return;
    }
    const xStep = points.length > 1 ? (CHART_W - PADL - PADR) / (points.length - 1) : 0;
    const xScale = i => points.length > 1 ? PADL + i * xStep : (PADL + (CHART_W - PADR)) / 2;
    const maxTon = Math.max(...points.map(p => p.ton), 1);
    const yScale = v => TON_CHART_H - TON_PADB - (v / maxTon) * (TON_CHART_H - TON_PADB - TON_PADT);

    [0, maxTon].forEach(val => {
      const y = yScale(val);
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("class", "gridline");
      line.setAttribute("x1", PADL); line.setAttribute("x2", CHART_W - PADR);
      line.setAttribute("y1", y); line.setAttribute("y2", y);
      svg.appendChild(line);
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", PADL - 8); t.setAttribute("y", y + 3);
      t.setAttribute("text-anchor", "end"); t.setAttribute("class", "axis-label");
      t.textContent = val.toLocaleString("tr-TR", { maximumFractionDigits: 1 }) + " ton";
      svg.appendChild(t);
    });

    const minLabelGap = 56;
    const tickEvery = Math.max(1, Math.ceil(minLabelGap / Math.max(xStep, 1)));
    points.forEach((p, i) => {
      const isLast = i === points.length - 1;
      if (i % tickEvery !== 0 && !isLast) return;
      if (isLast && points.length > 1 && (points.length - 1) % tickEvery !== 0) {
        const prevShown = Math.floor((points.length - 1) / tickEvery) * tickEvery;
        if ((points.length - 1 - prevShown) * xStep < minLabelGap) return;
      }
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", xScale(i)); t.setAttribute("y", TON_CHART_H - 5);
      t.setAttribute("text-anchor", "middle"); t.setAttribute("class", "axis-label");
      t.textContent = fmtDateShort(p.date);
      svg.appendChild(t);
    });

    const barW = Math.max(2, Math.min(xStep * 0.6, 14));
    const hitLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    points.forEach((p, i) => {
      const x = xScale(i);
      const y = yScale(p.ton);
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", x - barW / 2); rect.setAttribute("y", y);
      rect.setAttribute("width", barW); rect.setAttribute("height", Math.max(0, (TON_CHART_H - TON_PADB) - y));
      rect.setAttribute("fill", LINE_COLOR); rect.setAttribute("opacity", "0.55"); rect.setAttribute("rx", "1.5");
      svg.appendChild(rect);

      const hit = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      const hitW = Math.max(xStep, 6);
      hit.setAttribute("x", x - hitW / 2); hit.setAttribute("y", TON_PADT);
      hit.setAttribute("width", hitW); hit.setAttribute("height", TON_CHART_H - TON_PADB - TON_PADT);
      hit.setAttribute("fill", "transparent"); hit.style.cursor = "pointer";
      hit.tabIndex = 0;
      const showFn = evt => {
        const wrap = document.createElement("div");
        const ttl = document.createElement("div"); ttl.className = "ttl"; ttl.textContent = fmtDateFull(p.date);
        wrap.appendChild(ttl);
        const row = document.createElement("div"); row.className = "row";
        const v = document.createElement("span"); v.className = "val";
        v.textContent = p.ton.toLocaleString("tr-TR", { maximumFractionDigits: 1 }) + " ton";
        row.appendChild(v);
        wrap.appendChild(row);
        showTooltip(evt, wrap);
      };
      hit.addEventListener("pointermove", showFn);
      hit.addEventListener("focus", showFn);
      hit.addEventListener("pointerleave", hideTooltip);
      hit.addEventListener("blur", hideTooltip);
      hitLayer.appendChild(hit);
    });
    svg.appendChild(hitLayer);
  }

  function renderKpis(rows, series) {
    const el = document.getElementById("turib-kpi-row");
    el.textContent = "";
    const tiles = [
      ["Ağırlıklı ortalama fiyat (seçili dönem)", fmtPriceTon(overallWeightedAvg(rows))],
      ["Son fiyat", series.length ? fmtPriceTon(series[series.length - 1].price) : "—"],
      ["Toplam işlem hacmi", fmtKg(rows.reduce((s, r) => s + (r.islem_miktari_kg || 0), 0))],
      ["Toplam işlem değeri", fmtTl(rows.reduce((s, r) => s + (r.islem_hacmi_tl || 0), 0))],
    ];
    tiles.forEach(([label, value]) => {
      const tile = document.createElement("div");
      tile.className = "stat-tile";
      const l = document.createElement("div"); l.className = "label"; l.textContent = label;
      const v = document.createElement("div"); v.className = "value num"; v.textContent = value;
      tile.appendChild(l); tile.appendChild(v);
      el.appendChild(tile);
    });
  }

  const TABLE_ROW_LIMIT = 10;

  function renderTable(rows) {
    const thead = document.getElementById("turib-thead");
    const tbody = document.getElementById("turib-tbody");
    const foot = document.getElementById("turib-table-foot");
    thead.textContent = ""; tbody.textContent = ""; foot.textContent = "";
    const cols = ["Tarih", "LİDAŞ Adı", "İl", "İlçe", "Ağ. Ort. Fiyat", "İşlem Miktarı", "İşlem Hacmi", "İşlem Adedi"];
    cols.forEach(c => { const th = document.createElement("th"); th.textContent = c; thead.appendChild(th); });

    const q = state.tableSearch.toLocaleLowerCase("tr");
    const filtered = q
      ? rows.filter(r => [r.lidas_adi, r.il, r.ilce].some(v => v && v.toLocaleLowerCase("tr").includes(q)))
      : rows;
    const sorted = [...filtered].sort((a, b) => b.trade_date.localeCompare(a.trade_date) || (a.lidas_adi || "").localeCompare(b.lidas_adi || "", "tr"));
    document.getElementById("turib-table-title").textContent = "Günlük işlemler";
    sorted.slice(0, TABLE_ROW_LIMIT).forEach(r => {
      const tr = document.createElement("tr");
      const cells = [
        fmtDateFull(r.trade_date), r.lidas_adi || "—", r.il || "—", r.ilce || "—",
        fmtPriceTon(r.agirlikli_ortalama_fiyat != null ? r.agirlikli_ortalama_fiyat * 1000 : null), fmtKg(r.islem_miktari_kg), fmtTl(r.islem_hacmi_tl), String(r.islem_adedi ?? "—"),
      ];
      cells.forEach(c => { const td = document.createElement("td"); td.textContent = c; tr.appendChild(td); });
      tbody.appendChild(tr);
    });

    const countEl = document.createElement("span");
    countEl.textContent = sorted.length > TABLE_ROW_LIMIT
      ? `İlk ${TABLE_ROW_LIMIT} satır gösteriliyor — toplam ${sorted.length} satır. Tümü için ara/filtrele veya CSV olarak aktarın.`
      : `${sorted.length} satır`;
    foot.appendChild(countEl);
  }

  function exportTuribCsv(rows) {
    const cols = ["trade_date", "isin_kodu", "enstruman_sinifi", "agirlikli_ortalama_fiyat", "islem_adedi", "islem_miktari_kg", "islem_hacmi_tl", "lidas_adi", "il", "ilce"];
    const esc = v => {
      const s = v == null ? "" : String(v);
      return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [cols.join(";")].concat(rows.map(r => cols.map(c => esc(r[c])).join(";")));
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "turib-bulten-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function renderAll() {
    const rows = currentRows();
    const series = dailyWeightedSeries(rows);
    document.getElementById("turib-chart-title").textContent = "Fiyat eğilimi (TL/ton) — " + state.product + (state.lidas ? " · " + state.lidas : "");
    renderPriceLegend();
    drawPriceChart(series);
    drawTonnageChart(series);
    renderKpis(rows, series);
    renderTable(rows);
  }

  function buildDateControls() {
    const startInput = document.getElementById("turib-date-start");
    const endInput = document.getElementById("turib-date-end");
    if (!allRows.length) return;
    const allDates = allRows.map(r => r.trade_date).sort();
    const minDate = allDates[0], maxDate = allDates[allDates.length - 1];
    startInput.min = minDate; startInput.max = maxDate;
    endInput.min = minDate; endInput.max = maxDate;
    startInput.value = minDate; endInput.value = maxDate;

    function setActivePreset(btn) {
      document.querySelectorAll("#turib-period-presets .seg").forEach(b => b.classList.toggle("active", b === btn));
    }

    function applyPreset(preset) {
      if (preset === "all") {
        state.dateStart = null; state.dateEnd = null;
        startInput.value = minDate; endInput.value = maxDate;
      } else {
        const end = new Date(maxDate + "T00:00:00");
        const start = new Date(end);
        start.setDate(start.getDate() - Number(preset) + 1);
        const startIso = start.toISOString().slice(0, 10);
        state.dateStart = startIso < minDate ? minDate : startIso;
        state.dateEnd = maxDate;
        startInput.value = state.dateStart; endInput.value = state.dateEnd;
      }
      renderAll();
    }

    document.querySelectorAll("#turib-period-presets .seg").forEach(btn => {
      btn.addEventListener("click", () => { setActivePreset(btn); applyPreset(btn.dataset.preset); });
    });
    startInput.addEventListener("change", () => {
      state.dateStart = startInput.value || null;
      setActivePreset(null);
      renderAll();
    });
    endInput.addEventListener("change", () => {
      state.dateEnd = endInput.value || null;
      setActivePreset(null);
      renderAll();
    });

    setActivePreset(document.querySelector('#turib-period-presets .seg[data-preset="90"]'));
    applyPreset("90");
  }

  function buildProductControls() {
    const wrap = document.getElementById("turib-product");
    wrap.textContent = "";
    const products = [...new Set(allRows.map(r => r.enstruman_sinifi))].sort((a, b) => a.localeCompare(b, "tr"));
    if (!state.product || !products.includes(state.product)) {
      state.product = products.includes(DEFAULT_PRODUCT) ? DEFAULT_PRODUCT : (products[0] || null);
    }
    products.forEach(p => {
      const btn = document.createElement("button");
      btn.className = "chip" + (p === state.product ? " active" : "");
      btn.type = "button"; btn.textContent = p;
      btn.addEventListener("click", () => {
        state.product = p;
        wrap.querySelectorAll(".chip").forEach(b => b.classList.toggle("active", b === btn));
        renderAll();
      });
      wrap.appendChild(btn);
    });
  }

  function renderLidasSelected() {
    const wrap = document.getElementById("turib-lidas-selected");
    wrap.textContent = "";
    if (!state.lidas) return;
    const chip = document.createElement("button");
    chip.className = "chip active";
    chip.type = "button";
    chip.appendChild(document.createTextNode(state.lidas));
    const x = document.createElement("span");
    x.className = "x"; x.textContent = " ✕";
    chip.appendChild(x);
    chip.addEventListener("click", () => { state.lidas = null; renderLidasSelected(); renderAll(); });
    wrap.appendChild(chip);
  }

  function buildLidasSearch() {
    const input = document.getElementById("turib-lidas-search");
    const box = document.getElementById("turib-lidas-suggestions");
    function closeBox() { box.classList.remove("open"); box.textContent = ""; }
    function renderSuggestions() {
      const q = input.value.trim().toLocaleLowerCase("tr");
      const allNames = [...new Set(productRows().map(r => r.lidas_adi))].filter(Boolean).sort((a, b) => a.localeCompare(b, "tr"));
      const names = q ? allNames.filter(n => n.toLocaleLowerCase("tr").includes(q)) : allNames;
      box.textContent = "";
      if (!names.length) {
        const empty = document.createElement("div"); empty.className = "empty"; empty.textContent = "Sonuç yok";
        box.appendChild(empty);
      } else {
        names.forEach(name => {
          const btn = document.createElement("button");
          btn.type = "button"; btn.textContent = name;
          btn.addEventListener("mousedown", evt => {
            evt.preventDefault();
            input.value = "";
            closeBox();
            state.lidas = name;
            renderLidasSelected();
            renderAll();
          });
          box.appendChild(btn);
        });
      }
      box.classList.add("open");
    }
    input.addEventListener("input", renderSuggestions);
    input.addEventListener("focus", renderSuggestions);
    input.addEventListener("click", renderSuggestions);
    input.addEventListener("blur", () => setTimeout(closeBox, 120));
  }

  let loaded = false;
  window.__turibTab = {
    onActivate() {
      if (loaded) return;
      loaded = true;
      fetchTuribRows()
        .then(rows => {
          allRows = rows;
          document.getElementById("turib-asof-badge").textContent = rows.length
            ? "Son veri: " + fmtDateFull(rows.reduce((max, r) => (r.trade_date > max ? r.trade_date : max), rows[0].trade_date))
            : "Veri yok";
          buildProductControls();
          buildDateControls();
          renderAll();
        })
        .catch(err => {
          console.error(err);
          document.getElementById("turib-asof-badge").textContent = "Veri çekilemedi";
        });
    },
  };

  buildLidasSearch();

  document.getElementById("turib-table-search").addEventListener("input", (e) => {
    state.tableSearch = e.target.value.trim();
    renderTable(currentRows());
  });

  document.getElementById("turib-export-btn").addEventListener("click", () => {
    const rows = currentRows();
    if (!rows.length) return;
    exportTuribCsv(rows);
  });
})();

// ---------------------------------------------------------------------------
// UZTB (Uzunköprü Ticaret Borsası) alt sekmesi — Ticaret Borsası sekmesinin
// içinde üçüncü bir kaynak. TÜRİB'den farkı: kaynakta geçmiş veri için
// tarih parametreli bir API yok, bu yüzden DB zaten GÜNLÜK ÖZET satırları
// tutuyor (bir gün = bir satır: min/maks/ağırlıklı ortalama fiyat, toplam
// kilo, ortalama rutubet) — burada TÜRİB'deki gibi ayrıca günlük toplama
// yapmaya gerek yok, satırlar doğrudan grafik noktasına dönüşüyor.
(function () {
  "use strict";

  const cfg = window.TUIK_DASHBOARD_CONFIG;
  const LINE_COLOR = "var(--series-import)";
  const CHART_W = 960, CHART_H = 240, PADL = 70, PADR = 20, PADT = 16, PADB = 28;
  const TON_CHART_H = 110, TON_PADT = 10, TON_PADB = 24;
  const TABLE_ROW_LIMIT = 10;

  function fmtPriceTon(v) {
    if (v == null || isNaN(v)) return "—";
    return v.toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " TL/ton";
  }
  function fmtTon(v) {
    if (v == null || isNaN(v)) return "—";
    return v.toLocaleString("tr-TR", { maximumFractionDigits: 1 }) + " ton";
  }
  function fmtPct(v) {
    if (v == null || isNaN(v)) return "—";
    return "%" + v.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtDateShort(iso) {
    return new Date(iso + "T00:00:00").toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
  }
  function fmtDateFull(iso) {
    return new Date(iso + "T00:00:00").toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  }

  const CACHE_TTL_MS = 3 * 60 * 60 * 1000;

  async function fetchUztbRows() {
    const cached = window.__supaCache.get("uztb", CACHE_TTL_MS);
    if (cached) return cached;
    const headers = { apikey: cfg.SUPABASE_ANON_KEY, Authorization: `Bearer ${cfg.SUPABASE_ANON_KEY}` };
    const res = await fetch(
      `${cfg.SUPABASE_URL}/rest/v1/uztb_fiyat?select=trade_date,urun_adi,min_fiyat,max_fiyat,ort_fiyat,toplam_kilo,islem_adet,ort_rutubet&order=trade_date.asc`,
      { headers }
    );
    if (!res.ok) throw new Error(`Supabase istek hatası: ${res.status}`);
    const rows = await res.json();
    window.__supaCache.set("uztb", rows);
    return rows;
  }

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

  let allRows = [];
  const state = { dateStart: null, dateEnd: null };

  function currentRows() {
    return allRows.filter(r => {
      if (state.dateStart && r.trade_date < state.dateStart) return false;
      if (state.dateEnd && r.trade_date > state.dateEnd) return false;
      return true;
    });
  }

  // DB zaten günlük özet tuttuğu için satır = grafik noktası; sadece
  // alan adlarını çeviriyoruz (kg->ton, TL/kg->TL/ton), ayrıca toplama yapmıyoruz.
  function toSeries(rows) {
    return [...rows]
      .sort((a, b) => a.trade_date.localeCompare(b.trade_date))
      .map(r => ({
        date: r.trade_date,
        price: r.ort_fiyat != null ? r.ort_fiyat * 1000 : null,
        minPrice: r.min_fiyat != null ? r.min_fiyat * 1000 : null,
        maxPrice: r.max_fiyat != null ? r.max_fiyat * 1000 : null,
        ton: (r.toplam_kilo || 0) / 1000,
      }));
  }

  function overallWeightedAvg(rows) {
    let sumPriceKg = 0, sumKg = 0;
    rows.forEach(r => {
      if (r.ort_fiyat == null || r.toplam_kilo == null) return;
      sumPriceKg += r.ort_fiyat * r.toplam_kilo;
      sumKg += r.toplam_kilo;
    });
    return sumKg > 0 ? (sumPriceKg / sumKg) * 1000 : null;
  }

  function renderPriceLegend() {
    const el = document.getElementById("uztb-price-legend");
    el.textContent = "";
    [["Ağırlıklı Ortalama", false], ["En Yüksek", true], ["En Düşük", true]].forEach(([label, dashed]) => {
      const key = document.createElement("span");
      key.className = "key";
      const sw = document.createElement("span");
      sw.className = "swatch-line" + (dashed ? " dashed" : "");
      sw.style.background = dashed ? "none" : LINE_COLOR;
      sw.style.borderColor = LINE_COLOR;
      key.appendChild(sw);
      key.appendChild(document.createTextNode(label));
      el.appendChild(key);
    });
  }

  function buildGappedPath(points, field, xScale, yScale) {
    let d = "";
    let drawing = false;
    points.forEach((p, i) => {
      const v = p[field];
      if (v == null) { drawing = false; return; }
      d += (drawing ? "L" : "M") + xScale(i) + "," + yScale(v) + " ";
      drawing = true;
    });
    return d.trim();
  }

  function drawPriceChart(points) {
    const svg = document.getElementById("uztb-chart");
    svg.textContent = "";
    svg.setAttribute("viewBox", "0 0 " + CHART_W + " " + CHART_H);
    if (!points.length) {
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", PADL); t.setAttribute("y", CHART_H / 2); t.setAttribute("class", "axis-label");
      t.textContent = "Bu filtrede veri yok.";
      svg.appendChild(t);
      return;
    }
    const xStep = points.length > 1 ? (CHART_W - PADL - PADR) / (points.length - 1) : 0;
    const xScale = i => points.length > 1 ? PADL + i * xStep : (PADL + (CHART_W - PADR)) / 2;
    const allVals = points.flatMap(p => [p.price, p.minPrice, p.maxPrice]).filter(v => v != null);
    const minVal = Math.min(...allVals), maxVal = Math.max(...allVals);
    const span = maxVal - minVal || Math.abs(maxVal) || 1;
    const yPad = span * 0.1;
    const yScale = v => CHART_H - PADB - ((v - minVal + yPad) / (span + 2 * yPad)) * (CHART_H - PADB - PADT);

    for (let g = 0; g <= 3; g++) {
      const y = PADT + (g * (CHART_H - PADB - PADT)) / 3;
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("class", "gridline");
      line.setAttribute("x1", PADL); line.setAttribute("x2", CHART_W - PADR);
      line.setAttribute("y1", y); line.setAttribute("y2", y);
      svg.appendChild(line);
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", PADL - 8); t.setAttribute("y", y + 3);
      t.setAttribute("text-anchor", "end"); t.setAttribute("class", "axis-label");
      t.textContent = Math.round(maxVal + yPad - (g * (span + 2 * yPad)) / 3).toLocaleString("tr-TR");
      svg.appendChild(t);
    }

    const minLabelGap = 56;
    const tickEvery = Math.max(1, Math.ceil(minLabelGap / Math.max(xStep, 1)));
    points.forEach((p, i) => {
      const isLast = i === points.length - 1;
      if (i % tickEvery !== 0 && !isLast) return;
      if (isLast && points.length > 1 && (points.length - 1) % tickEvery !== 0) {
        const prevShown = Math.floor((points.length - 1) / tickEvery) * tickEvery;
        if ((points.length - 1 - prevShown) * xStep < minLabelGap) return;
      }
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", xScale(i)); t.setAttribute("y", CHART_H - 5);
      t.setAttribute("text-anchor", "middle"); t.setAttribute("class", "axis-label");
      t.textContent = fmtDateShort(p.date);
      svg.appendChild(t);
    });

    const hoverLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
    hoverLine.setAttribute("class", "baseline");
    hoverLine.setAttribute("y1", PADT); hoverLine.setAttribute("y2", CHART_H - PADB);
    hoverLine.style.opacity = "0";
    svg.appendChild(hoverLine);

    const avgPts = points.map((p, i) => [xScale(i), yScale(p.price)]);
    if (avgPts.length === 1) {
      const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      dot.setAttribute("cx", avgPts[0][0]); dot.setAttribute("cy", avgPts[0][1]); dot.setAttribute("r", "4");
      dot.setAttribute("fill", LINE_COLOR);
      svg.appendChild(dot);
    } else {
      const gradId = "uztbAreaGradient";
      const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
      const grad = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
      grad.setAttribute("id", gradId);
      grad.setAttribute("x1", "0"); grad.setAttribute("y1", "0"); grad.setAttribute("x2", "0"); grad.setAttribute("y2", "1");
      const stop1 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
      stop1.setAttribute("offset", "0%"); stop1.setAttribute("stop-color", LINE_COLOR); stop1.setAttribute("stop-opacity", "0.18");
      const stop2 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
      stop2.setAttribute("offset", "100%"); stop2.setAttribute("stop-color", LINE_COLOR); stop2.setAttribute("stop-opacity", "0");
      grad.appendChild(stop1); grad.appendChild(stop2);
      defs.appendChild(grad);
      svg.appendChild(defs);

      const baseline = CHART_H - PADB;
      const areaD = "M" + avgPts[0][0] + "," + baseline + " " + avgPts.map(p => "L" + p[0] + "," + p[1]).join(" ") + " L" + avgPts[avgPts.length - 1][0] + "," + baseline + " Z";
      const area = document.createElementNS("http://www.w3.org/2000/svg", "path");
      area.setAttribute("d", areaD);
      area.setAttribute("fill", "url(#" + gradId + ")");
      area.setAttribute("stroke", "none");
      svg.appendChild(area);

      ["maxPrice", "minPrice"].forEach(field => {
        const d = buildGappedPath(points, field, xScale, yScale);
        if (!d) return;
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", d);
        path.setAttribute("stroke", LINE_COLOR); path.setAttribute("stroke-width", "1.5");
        path.setAttribute("stroke-dasharray", "5 4"); path.setAttribute("opacity", "0.6");
        path.setAttribute("fill", "none"); path.setAttribute("stroke-linecap", "round");
        svg.appendChild(path);
      });

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", avgPts.map((p, i) => (i === 0 ? "M" : "L") + p[0] + "," + p[1]).join(" "));
      path.setAttribute("stroke", LINE_COLOR); path.setAttribute("stroke-width", "3");
      path.setAttribute("fill", "none"); path.setAttribute("stroke-linejoin", "round"); path.setAttribute("stroke-linecap", "round");
      svg.appendChild(path);

      const lastPt = avgPts[avgPts.length - 1];
      const endDot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      endDot.setAttribute("cx", lastPt[0]); endDot.setAttribute("cy", lastPt[1]); endDot.setAttribute("r", "4.5");
      endDot.setAttribute("fill", "var(--surface-1)"); endDot.setAttribute("stroke", LINE_COLOR); endDot.setAttribute("stroke-width", "2.5");
      svg.appendChild(endDot);
    }

    const hitLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    points.forEach((p, i) => {
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      const hitW = Math.max(xStep, 6);
      rect.setAttribute("x", xScale(i) - hitW / 2); rect.setAttribute("y", PADT);
      rect.setAttribute("width", hitW); rect.setAttribute("height", CHART_H - PADB - PADT);
      rect.setAttribute("fill", "transparent"); rect.style.cursor = "pointer";
      rect.tabIndex = 0;
      const showFn = evt => {
        hoverLine.setAttribute("x1", xScale(i)); hoverLine.setAttribute("x2", xScale(i));
        hoverLine.style.opacity = "1";
        const wrap = document.createElement("div");
        const ttl = document.createElement("div"); ttl.className = "ttl"; ttl.textContent = fmtDateFull(p.date);
        wrap.appendChild(ttl);
        [["Ağırlıklı Ort.", p.price], ["En Yüksek", p.maxPrice], ["En Düşük", p.minPrice]].forEach(([label, val]) => {
          const row = document.createElement("div"); row.className = "row";
          const l = document.createElement("span"); l.textContent = label + ": ";
          const v = document.createElement("span"); v.className = "val"; v.textContent = fmtPriceTon(val);
          row.appendChild(l); row.appendChild(v);
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

  function drawTonnageChart(points) {
    const svg = document.getElementById("uztb-tonnage-chart");
    svg.textContent = "";
    svg.setAttribute("viewBox", "0 0 " + CHART_W + " " + TON_CHART_H);
    if (!points.length) {
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", PADL); t.setAttribute("y", TON_CHART_H / 2); t.setAttribute("class", "axis-label");
      t.textContent = "Bu filtrede veri yok.";
      svg.appendChild(t);
      return;
    }
    const xStep = points.length > 1 ? (CHART_W - PADL - PADR) / (points.length - 1) : 0;
    const xScale = i => points.length > 1 ? PADL + i * xStep : (PADL + (CHART_W - PADR)) / 2;
    const maxTon = Math.max(...points.map(p => p.ton), 1);
    const yScale = v => TON_CHART_H - TON_PADB - (v / maxTon) * (TON_CHART_H - TON_PADB - TON_PADT);

    [0, maxTon].forEach(val => {
      const y = yScale(val);
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("class", "gridline");
      line.setAttribute("x1", PADL); line.setAttribute("x2", CHART_W - PADR);
      line.setAttribute("y1", y); line.setAttribute("y2", y);
      svg.appendChild(line);
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", PADL - 8); t.setAttribute("y", y + 3);
      t.setAttribute("text-anchor", "end"); t.setAttribute("class", "axis-label");
      t.textContent = fmtTon(val);
      svg.appendChild(t);
    });

    const minLabelGap = 56;
    const tickEvery = Math.max(1, Math.ceil(minLabelGap / Math.max(xStep, 1)));
    points.forEach((p, i) => {
      const isLast = i === points.length - 1;
      if (i % tickEvery !== 0 && !isLast) return;
      if (isLast && points.length > 1 && (points.length - 1) % tickEvery !== 0) {
        const prevShown = Math.floor((points.length - 1) / tickEvery) * tickEvery;
        if ((points.length - 1 - prevShown) * xStep < minLabelGap) return;
      }
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", xScale(i)); t.setAttribute("y", TON_CHART_H - 5);
      t.setAttribute("text-anchor", "middle"); t.setAttribute("class", "axis-label");
      t.textContent = fmtDateShort(p.date);
      svg.appendChild(t);
    });

    const barW = Math.max(2, Math.min(xStep * 0.6, 14));
    const hitLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    points.forEach((p, i) => {
      const x = xScale(i);
      const y = yScale(p.ton);
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", x - barW / 2); rect.setAttribute("y", y);
      rect.setAttribute("width", barW); rect.setAttribute("height", Math.max(0, (TON_CHART_H - TON_PADB) - y));
      rect.setAttribute("fill", LINE_COLOR); rect.setAttribute("opacity", "0.55"); rect.setAttribute("rx", "1.5");
      svg.appendChild(rect);

      const hit = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      const hitW = Math.max(xStep, 6);
      hit.setAttribute("x", x - hitW / 2); hit.setAttribute("y", TON_PADT);
      hit.setAttribute("width", hitW); hit.setAttribute("height", TON_CHART_H - TON_PADB - TON_PADT);
      hit.setAttribute("fill", "transparent"); hit.style.cursor = "pointer";
      hit.tabIndex = 0;
      const showFn = evt => {
        const wrap = document.createElement("div");
        const ttl = document.createElement("div"); ttl.className = "ttl"; ttl.textContent = fmtDateFull(p.date);
        wrap.appendChild(ttl);
        const row = document.createElement("div"); row.className = "row";
        const v = document.createElement("span"); v.className = "val"; v.textContent = fmtTon(p.ton);
        row.appendChild(v);
        wrap.appendChild(row);
        showTooltip(evt, wrap);
      };
      hit.addEventListener("pointermove", showFn);
      hit.addEventListener("focus", showFn);
      hit.addEventListener("pointerleave", hideTooltip);
      hit.addEventListener("blur", hideTooltip);
      hitLayer.appendChild(hit);
    });
    svg.appendChild(hitLayer);
  }

  function renderKpis(rows, series) {
    const el = document.getElementById("uztb-kpi-row");
    el.textContent = "";
    const rutubetVals = rows.filter(r => r.ort_rutubet != null);
    const avgRutubet = rutubetVals.length
      ? rutubetVals.reduce((s, r) => s + r.ort_rutubet, 0) / rutubetVals.length
      : null;
    const tiles = [
      ["Ağırlıklı ortalama fiyat (seçili dönem)", fmtPriceTon(overallWeightedAvg(rows))],
      ["Son fiyat", series.length ? fmtPriceTon(series[series.length - 1].price) : "—"],
      ["Toplam işlem hacmi", fmtTon(rows.reduce((s, r) => s + (r.toplam_kilo || 0) / 1000, 0))],
      ["Ortalama rutubet", fmtPct(avgRutubet)],
    ];
    tiles.forEach(([label, value]) => {
      const tile = document.createElement("div");
      tile.className = "stat-tile";
      const l = document.createElement("div"); l.className = "label"; l.textContent = label;
      const v = document.createElement("div"); v.className = "value num"; v.textContent = value;
      tile.appendChild(l); tile.appendChild(v);
      el.appendChild(tile);
    });
  }

  function renderTable(rows) {
    const thead = document.getElementById("uztb-thead");
    const tbody = document.getElementById("uztb-tbody");
    const foot = document.getElementById("uztb-table-foot");
    thead.textContent = ""; tbody.textContent = ""; foot.textContent = "";
    const cols = ["Tarih", "En Düşük", "En Yüksek", "Ağ. Ort. Fiyat", "Toplam Miktar", "İşlem Adedi", "Ort. Rutubet"];
    cols.forEach(c => { const th = document.createElement("th"); th.textContent = c; thead.appendChild(th); });

    const sorted = [...rows].sort((a, b) => b.trade_date.localeCompare(a.trade_date));
    sorted.slice(0, TABLE_ROW_LIMIT).forEach(r => {
      const tr = document.createElement("tr");
      const cells = [
        fmtDateFull(r.trade_date),
        fmtPriceTon(r.min_fiyat != null ? r.min_fiyat * 1000 : null),
        fmtPriceTon(r.max_fiyat != null ? r.max_fiyat * 1000 : null),
        fmtPriceTon(r.ort_fiyat != null ? r.ort_fiyat * 1000 : null),
        fmtTon((r.toplam_kilo || 0) / 1000), String(r.islem_adet ?? "—"), fmtPct(r.ort_rutubet),
      ];
      cells.forEach(c => { const td = document.createElement("td"); td.textContent = c; tr.appendChild(td); });
      tbody.appendChild(tr);
    });

    const countEl = document.createElement("span");
    countEl.textContent = sorted.length > TABLE_ROW_LIMIT
      ? `İlk ${TABLE_ROW_LIMIT} satır gösteriliyor — toplam ${sorted.length} satır. Tümü için CSV olarak aktarın.`
      : `${sorted.length} satır`;
    foot.appendChild(countEl);
  }

  function exportUztbCsv(rows) {
    const cols = ["trade_date", "urun_adi", "min_fiyat", "max_fiyat", "ort_fiyat", "toplam_kilo", "islem_adet", "ort_rutubet"];
    const esc = v => {
      const s = v == null ? "" : String(v);
      return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [cols.join(";")].concat(rows.map(r => cols.map(c => esc(r[c])).join(";")));
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "uztb-gunluk-ozet-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function renderAll() {
    const rows = currentRows();
    const series = toSeries(rows);
    renderPriceLegend();
    drawPriceChart(series);
    drawTonnageChart(series);
    renderKpis(rows, series);
    renderTable(rows);
  }

  function buildDateControls() {
    const startInput = document.getElementById("uztb-date-start");
    const endInput = document.getElementById("uztb-date-end");
    if (!allRows.length) return;
    const allDates = allRows.map(r => r.trade_date).sort();
    const minDate = allDates[0], maxDate = allDates[allDates.length - 1];
    startInput.min = minDate; startInput.max = maxDate;
    endInput.min = minDate; endInput.max = maxDate;
    startInput.value = minDate; endInput.value = maxDate;

    function setActivePreset(btn) {
      document.querySelectorAll("#uztb-period-presets .seg").forEach(b => b.classList.toggle("active", b === btn));
    }
    function applyPreset(preset) {
      if (preset === "all") {
        state.dateStart = null; state.dateEnd = null;
        startInput.value = minDate; endInput.value = maxDate;
      } else {
        const end = new Date(maxDate + "T00:00:00");
        const start = new Date(end);
        start.setDate(start.getDate() - Number(preset) + 1);
        const startIso = start.toISOString().slice(0, 10);
        state.dateStart = startIso < minDate ? minDate : startIso;
        state.dateEnd = maxDate;
        startInput.value = state.dateStart; endInput.value = state.dateEnd;
      }
      renderAll();
    }
    document.querySelectorAll("#uztb-period-presets .seg").forEach(btn => {
      btn.addEventListener("click", () => { setActivePreset(btn); applyPreset(btn.dataset.preset); });
    });
    startInput.addEventListener("change", () => { state.dateStart = startInput.value || null; setActivePreset(null); renderAll(); });
    endInput.addEventListener("change", () => { state.dateEnd = endInput.value || null; setActivePreset(null); renderAll(); });

    setActivePreset(document.querySelector('#uztb-period-presets .seg[data-preset="90"]'));
    applyPreset("90");
  }

  let loaded = false;
  window.__uztbTab = {
    onActivate() {
      if (loaded) return;
      loaded = true;
      fetchUztbRows()
        .then(rows => {
          allRows = rows;
          document.getElementById("uztb-asof-badge").textContent = rows.length
            ? "Son veri: " + fmtDateFull(rows.reduce((max, r) => (r.trade_date > max ? r.trade_date : max), rows[0].trade_date))
            : "Veri yok";
          buildDateControls();
          renderAll();
        })
        .catch(err => {
          console.error(err);
          document.getElementById("uztb-asof-badge").textContent = "Veri çekilemedi";
        });
    },
  };

  document.getElementById("uztb-export-btn").addEventListener("click", () => {
    const rows = currentRows();
    if (!rows.length) return;
    exportUztbCsv(rows);
  });
})();

// ---------------------------------------------------------------------------
// KTB (Konya Ticaret Borsası) alt sekmesi — Ticaret Borsası sekmesinin
// içinde dördüncü bir kaynak. TÜRİB gibi gerçek 1 yıllık geçmiş API'si var
// (GetGunlukBulten/{tarih}), DB'de satırlar (tarih, ürün grubu, sınıf)
// kırılımında — her satır o sınıfın günlük min/ort/max fiyatı + miktarı,
// ayrıca aynı günün GRUP genelindeki (tüm sınıflar) min/ort/max fiyatı da
// taşıyor (kaynağın kendi response şekli). Grafik bu grup-geneli alanları
// kullanıyor (TÜRİB'deki gibi ayrıca ağırlıklı toplama gerekmiyor), KPI'daki
// "seçili dönem ağırlıklı ortalaması" ise sınıf satırlarının miktar ile
// tartılmasıyla hesaplanıyor (daha ince taneli, dönem bazlı doğru ortalama).
(function () {
  "use strict";

  const cfg = window.TUIK_DASHBOARD_CONFIG;
  const LINE_COLOR = "var(--series-export)";
  const CHART_W = 960, CHART_H = 240, PADL = 70, PADR = 20, PADT = 16, PADB = 28;
  const TON_CHART_H = 110, TON_PADT = 10, TON_PADB = 24;
  const TABLE_ROW_LIMIT = 10;
  const DEFAULT_PRODUCT = "Mısır";

  function fmtPriceTon(v) {
    if (v == null || isNaN(v)) return "—";
    return v.toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " TL/ton";
  }
  function fmtTon(v) {
    if (v == null || isNaN(v)) return "—";
    return v.toLocaleString("tr-TR", { maximumFractionDigits: 1 }) + " ton";
  }
  function fmtDateShort(iso) {
    return new Date(iso + "T00:00:00").toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
  }
  function fmtDateFull(iso) {
    return new Date(iso + "T00:00:00").toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  }

  const CACHE_TTL_MS = 3 * 60 * 60 * 1000;

  async function fetchKtbRows() {
    const cached = window.__supaCache.get("ktb", CACHE_TTL_MS);
    if (cached) return cached;
    const headers = { apikey: cfg.SUPABASE_ANON_KEY, Authorization: `Bearer ${cfg.SUPABASE_ANON_KEY}` };
    const pageSize = 1000;
    let rows = [];
    let from = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const res = await fetch(
        `${cfg.SUPABASE_URL}/rest/v1/ktb_bulletin?select=trade_date,grup_kodu,grup_adi,sinif_adi,min_fiyat,ort_fiyat,max_fiyat,miktar,islem_sayisi,grup_min_fiyat,grup_ort_fiyat,grup_max_fiyat&order=trade_date.asc`,
        { headers: Object.assign({}, headers, { Range: `${from}-${from + pageSize - 1}` }) }
      );
      if (!res.ok) throw new Error(`Supabase istek hatası: ${res.status}`);
      const page = await res.json();
      rows = rows.concat(page);
      if (page.length < pageSize) break;
      from += pageSize;
    }
    window.__supaCache.set("ktb", rows);
    return rows;
  }

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

  let allRows = [];
  const state = { product: null, dateStart: null, dateEnd: null };

  function productRows() {
    return allRows.filter(r => r.grup_adi === state.product);
  }
  function currentRows() {
    return productRows().filter(r => {
      if (state.dateStart && r.trade_date < state.dateStart) return false;
      if (state.dateEnd && r.trade_date > state.dateEnd) return false;
      return true;
    });
  }

  // Grafik için: aynı (tarih, grup) satırlarının hepsinde grup_min/ort/max_fiyat
  // zaten aynı değeri taşıyor (kaynağın kendi günlük grup özeti) — burada
  // sadece tekilleştirip TL/ton'a çeviriyoruz. Tonaj o günün tüm sınıf
  // satırlarındaki miktarın toplamı.
  function dailyWeightedSeries(rows) {
    const byDate = new Map();
    rows.forEach(r => {
      const e = byDate.get(r.trade_date) || { kg: 0, price: null, minPrice: null, maxPrice: null };
      e.kg += (r.miktar || 0);
      if (r.grup_ort_fiyat != null) e.price = r.grup_ort_fiyat;
      if (r.grup_min_fiyat != null) e.minPrice = r.grup_min_fiyat;
      if (r.grup_max_fiyat != null) e.maxPrice = r.grup_max_fiyat;
      byDate.set(r.trade_date, e);
    });
    return [...byDate.entries()]
      .map(([date, e]) => ({
        date,
        price: e.price != null ? e.price * 1000 : null,
        minPrice: e.minPrice != null ? e.minPrice * 1000 : null,
        maxPrice: e.maxPrice != null ? e.maxPrice * 1000 : null,
        ton: e.kg / 1000,
      }))
      .filter(p => p.price != null)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  // KPI'daki dönem ağırlıklı ortalaması: sınıf satırlarının kendi fiyatını
  // kendi miktarıyla tartarak (daha ince taneli, seçili TÜM dönem için doğru
  // hacim ağırlıklı ortalama — grup_ort_fiyat günlük bazda zaten doğru ama
  // birden çok günü basitçe ortalamak hacmi görmezden gelir).
  function overallWeightedAvg(rows) {
    let sumPriceKg = 0, sumKg = 0;
    rows.forEach(r => {
      if (r.ort_fiyat == null || r.miktar == null) return;
      sumPriceKg += r.ort_fiyat * r.miktar;
      sumKg += r.miktar;
    });
    return sumKg > 0 ? (sumPriceKg / sumKg) * 1000 : null;
  }

  function renderPriceLegend() {
    const el = document.getElementById("ktb-price-legend");
    el.textContent = "";
    [
      ["Ağırlıklı Ortalama", false],
      ["En Yüksek", true],
      ["En Düşük", true],
    ].forEach(([label, dashed]) => {
      const key = document.createElement("span");
      key.className = "key";
      const sw = document.createElement("span");
      sw.className = "swatch-line" + (dashed ? " dashed" : "");
      sw.style.background = dashed ? "none" : LINE_COLOR;
      sw.style.borderColor = LINE_COLOR;
      key.appendChild(sw);
      key.appendChild(document.createTextNode(label));
      el.appendChild(key);
    });
  }

  function buildGappedPath(points, field, xScale, yScale) {
    let d = "";
    let drawing = false;
    points.forEach((p, i) => {
      const v = p[field];
      if (v == null) { drawing = false; return; }
      d += (drawing ? "L" : "M") + xScale(i) + "," + yScale(v) + " ";
      drawing = true;
    });
    return d.trim();
  }

  function drawPriceChart(points) {
    const svg = document.getElementById("ktb-chart");
    svg.textContent = "";
    svg.setAttribute("viewBox", "0 0 " + CHART_W + " " + CHART_H);
    if (!points.length) {
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", PADL); t.setAttribute("y", CHART_H / 2); t.setAttribute("class", "axis-label");
      t.textContent = "Bu filtrede veri yok.";
      svg.appendChild(t);
      return;
    }
    const xStep = points.length > 1 ? (CHART_W - PADL - PADR) / (points.length - 1) : 0;
    const xScale = i => points.length > 1 ? PADL + i * xStep : (PADL + (CHART_W - PADR)) / 2;
    const allVals = points.flatMap(p => [p.price, p.minPrice, p.maxPrice]).filter(v => v != null);
    const minVal = Math.min(...allVals), maxVal = Math.max(...allVals);
    const span = maxVal - minVal || Math.abs(maxVal) || 1;
    const yPad = span * 0.1;
    const yScale = v => CHART_H - PADB - ((v - minVal + yPad) / (span + 2 * yPad)) * (CHART_H - PADB - PADT);

    for (let g = 0; g <= 3; g++) {
      const y = PADT + (g * (CHART_H - PADB - PADT)) / 3;
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("class", "gridline");
      line.setAttribute("x1", PADL); line.setAttribute("x2", CHART_W - PADR);
      line.setAttribute("y1", y); line.setAttribute("y2", y);
      svg.appendChild(line);
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", PADL - 8); t.setAttribute("y", y + 3);
      t.setAttribute("text-anchor", "end"); t.setAttribute("class", "axis-label");
      t.textContent = Math.round(maxVal + yPad - (g * (span + 2 * yPad)) / 3).toLocaleString("tr-TR");
      svg.appendChild(t);
    }

    const minLabelGap = 56;
    const tickEvery = Math.max(1, Math.ceil(minLabelGap / Math.max(xStep, 1)));
    points.forEach((p, i) => {
      const isLast = i === points.length - 1;
      if (i % tickEvery !== 0 && !isLast) return;
      if (isLast && points.length > 1 && (points.length - 1) % tickEvery !== 0) {
        const prevShown = Math.floor((points.length - 1) / tickEvery) * tickEvery;
        if ((points.length - 1 - prevShown) * xStep < minLabelGap) return;
      }
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", xScale(i)); t.setAttribute("y", CHART_H - 5);
      t.setAttribute("text-anchor", "middle"); t.setAttribute("class", "axis-label");
      t.textContent = fmtDateShort(p.date);
      svg.appendChild(t);
    });

    const hoverLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
    hoverLine.setAttribute("class", "baseline");
    hoverLine.setAttribute("y1", PADT); hoverLine.setAttribute("y2", CHART_H - PADB);
    hoverLine.style.opacity = "0";
    svg.appendChild(hoverLine);

    const avgPts = points.map((p, i) => [xScale(i), yScale(p.price)]);
    if (avgPts.length === 1) {
      const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      dot.setAttribute("cx", avgPts[0][0]); dot.setAttribute("cy", avgPts[0][1]); dot.setAttribute("r", "4");
      dot.setAttribute("fill", LINE_COLOR);
      svg.appendChild(dot);
    } else {
      const gradId = "ktbAreaGradient";
      const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
      const grad = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
      grad.setAttribute("id", gradId);
      grad.setAttribute("x1", "0"); grad.setAttribute("y1", "0"); grad.setAttribute("x2", "0"); grad.setAttribute("y2", "1");
      const stop1 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
      stop1.setAttribute("offset", "0%"); stop1.setAttribute("stop-color", LINE_COLOR); stop1.setAttribute("stop-opacity", "0.18");
      const stop2 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
      stop2.setAttribute("offset", "100%"); stop2.setAttribute("stop-color", LINE_COLOR); stop2.setAttribute("stop-opacity", "0");
      grad.appendChild(stop1); grad.appendChild(stop2);
      defs.appendChild(grad);
      svg.appendChild(defs);

      const baseline = CHART_H - PADB;
      const areaD = "M" + avgPts[0][0] + "," + baseline + " " + avgPts.map(p => "L" + p[0] + "," + p[1]).join(" ") + " L" + avgPts[avgPts.length - 1][0] + "," + baseline + " Z";
      const area = document.createElementNS("http://www.w3.org/2000/svg", "path");
      area.setAttribute("d", areaD);
      area.setAttribute("fill", "url(#" + gradId + ")");
      area.setAttribute("stroke", "none");
      svg.appendChild(area);

      ["maxPrice", "minPrice"].forEach(field => {
        const d = buildGappedPath(points, field, xScale, yScale);
        if (!d) return;
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", d);
        path.setAttribute("stroke", LINE_COLOR); path.setAttribute("stroke-width", "1.5");
        path.setAttribute("stroke-dasharray", "5 4"); path.setAttribute("opacity", "0.6");
        path.setAttribute("fill", "none"); path.setAttribute("stroke-linecap", "round");
        svg.appendChild(path);
      });

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", avgPts.map((p, i) => (i === 0 ? "M" : "L") + p[0] + "," + p[1]).join(" "));
      path.setAttribute("stroke", LINE_COLOR); path.setAttribute("stroke-width", "3");
      path.setAttribute("fill", "none"); path.setAttribute("stroke-linejoin", "round"); path.setAttribute("stroke-linecap", "round");
      svg.appendChild(path);

      const lastPt = avgPts[avgPts.length - 1];
      const endDot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      endDot.setAttribute("cx", lastPt[0]); endDot.setAttribute("cy", lastPt[1]); endDot.setAttribute("r", "4.5");
      endDot.setAttribute("fill", "var(--surface-1)"); endDot.setAttribute("stroke", LINE_COLOR); endDot.setAttribute("stroke-width", "2.5");
      svg.appendChild(endDot);
    }

    const hitLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    points.forEach((p, i) => {
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      const hitW = Math.max(xStep, 6);
      rect.setAttribute("x", xScale(i) - hitW / 2); rect.setAttribute("y", PADT);
      rect.setAttribute("width", hitW); rect.setAttribute("height", CHART_H - PADB - PADT);
      rect.setAttribute("fill", "transparent"); rect.style.cursor = "pointer";
      rect.tabIndex = 0;
      const showFn = evt => {
        hoverLine.setAttribute("x1", xScale(i)); hoverLine.setAttribute("x2", xScale(i));
        hoverLine.style.opacity = "1";
        const wrap = document.createElement("div");
        const ttl = document.createElement("div"); ttl.className = "ttl"; ttl.textContent = fmtDateFull(p.date);
        wrap.appendChild(ttl);
        [["Ağırlıklı Ort.", p.price], ["En Yüksek", p.maxPrice], ["En Düşük", p.minPrice]].forEach(([label, val]) => {
          const row = document.createElement("div"); row.className = "row";
          const l = document.createElement("span"); l.textContent = label + ": ";
          const v = document.createElement("span"); v.className = "val"; v.textContent = fmtPriceTon(val);
          row.appendChild(l); row.appendChild(v);
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

  function drawTonnageChart(points) {
    const svg = document.getElementById("ktb-tonnage-chart");
    svg.textContent = "";
    svg.setAttribute("viewBox", "0 0 " + CHART_W + " " + TON_CHART_H);
    if (!points.length) {
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", PADL); t.setAttribute("y", TON_CHART_H / 2); t.setAttribute("class", "axis-label");
      t.textContent = "Bu filtrede veri yok.";
      svg.appendChild(t);
      return;
    }
    const xStep = points.length > 1 ? (CHART_W - PADL - PADR) / (points.length - 1) : 0;
    const xScale = i => points.length > 1 ? PADL + i * xStep : (PADL + (CHART_W - PADR)) / 2;
    const maxTon = Math.max(...points.map(p => p.ton), 1);
    const yScale = v => TON_CHART_H - TON_PADB - (v / maxTon) * (TON_CHART_H - TON_PADB - TON_PADT);

    [0, maxTon].forEach(val => {
      const y = yScale(val);
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("class", "gridline");
      line.setAttribute("x1", PADL); line.setAttribute("x2", CHART_W - PADR);
      line.setAttribute("y1", y); line.setAttribute("y2", y);
      svg.appendChild(line);
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", PADL - 8); t.setAttribute("y", y + 3);
      t.setAttribute("text-anchor", "end"); t.setAttribute("class", "axis-label");
      t.textContent = val.toLocaleString("tr-TR", { maximumFractionDigits: 1 }) + " ton";
      svg.appendChild(t);
    });

    const minLabelGap = 56;
    const tickEvery = Math.max(1, Math.ceil(minLabelGap / Math.max(xStep, 1)));
    points.forEach((p, i) => {
      const isLast = i === points.length - 1;
      if (i % tickEvery !== 0 && !isLast) return;
      if (isLast && points.length > 1 && (points.length - 1) % tickEvery !== 0) {
        const prevShown = Math.floor((points.length - 1) / tickEvery) * tickEvery;
        if ((points.length - 1 - prevShown) * xStep < minLabelGap) return;
      }
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", xScale(i)); t.setAttribute("y", TON_CHART_H - 5);
      t.setAttribute("text-anchor", "middle"); t.setAttribute("class", "axis-label");
      t.textContent = fmtDateShort(p.date);
      svg.appendChild(t);
    });

    const barW = Math.max(2, Math.min(xStep * 0.6, 14));
    const hitLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    points.forEach((p, i) => {
      const x = xScale(i);
      const y = yScale(p.ton);
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", x - barW / 2); rect.setAttribute("y", y);
      rect.setAttribute("width", barW); rect.setAttribute("height", Math.max(0, (TON_CHART_H - TON_PADB) - y));
      rect.setAttribute("fill", LINE_COLOR); rect.setAttribute("opacity", "0.55"); rect.setAttribute("rx", "1.5");
      svg.appendChild(rect);

      const hit = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      const hitW = Math.max(xStep, 6);
      hit.setAttribute("x", x - hitW / 2); hit.setAttribute("y", TON_PADT);
      hit.setAttribute("width", hitW); hit.setAttribute("height", TON_CHART_H - TON_PADB - TON_PADT);
      hit.setAttribute("fill", "transparent"); hit.style.cursor = "pointer";
      hit.tabIndex = 0;
      const showFn = evt => {
        const wrap = document.createElement("div");
        const ttl = document.createElement("div"); ttl.className = "ttl"; ttl.textContent = fmtDateFull(p.date);
        wrap.appendChild(ttl);
        const row = document.createElement("div"); row.className = "row";
        const v = document.createElement("span"); v.className = "val"; v.textContent = fmtTon(p.ton);
        row.appendChild(v);
        wrap.appendChild(row);
        showTooltip(evt, wrap);
      };
      hit.addEventListener("pointermove", showFn);
      hit.addEventListener("focus", showFn);
      hit.addEventListener("pointerleave", hideTooltip);
      hit.addEventListener("blur", hideTooltip);
      hitLayer.appendChild(hit);
    });
    svg.appendChild(hitLayer);
  }

  function renderKpis(rows, series) {
    const el = document.getElementById("ktb-kpi-row");
    el.textContent = "";
    const tiles = [
      ["Ağırlıklı ortalama fiyat (seçili dönem)", fmtPriceTon(overallWeightedAvg(rows))],
      ["Son fiyat", series.length ? fmtPriceTon(series[series.length - 1].price) : "—"],
      ["Toplam işlem hacmi", fmtTon(rows.reduce((s, r) => s + (r.miktar || 0) / 1000, 0))],
      ["Toplam işlem sayısı", String(rows.reduce((s, r) => s + (r.islem_sayisi || 0), 0))],
    ];
    tiles.forEach(([label, value]) => {
      const tile = document.createElement("div");
      tile.className = "stat-tile";
      const l = document.createElement("div"); l.className = "label"; l.textContent = label;
      const v = document.createElement("div"); v.className = "value num"; v.textContent = value;
      tile.appendChild(l); tile.appendChild(v);
      el.appendChild(tile);
    });
  }

  function renderTable(rows) {
    const thead = document.getElementById("ktb-thead");
    const tbody = document.getElementById("ktb-tbody");
    const foot = document.getElementById("ktb-table-foot");
    thead.textContent = ""; tbody.textContent = ""; foot.textContent = "";
    const cols = ["Tarih", "Sınıf", "En Düşük", "En Yüksek", "Ort. Fiyat", "Miktar", "İşlem Sayısı"];
    cols.forEach(c => { const th = document.createElement("th"); th.textContent = c; thead.appendChild(th); });

    const sorted = [...rows].sort((a, b) => b.trade_date.localeCompare(a.trade_date) || (a.sinif_adi || "").localeCompare(b.sinif_adi || "", "tr"));
    sorted.slice(0, TABLE_ROW_LIMIT).forEach(r => {
      const tr = document.createElement("tr");
      const cells = [
        fmtDateFull(r.trade_date), r.sinif_adi || "—",
        fmtPriceTon(r.min_fiyat != null ? r.min_fiyat * 1000 : null),
        fmtPriceTon(r.max_fiyat != null ? r.max_fiyat * 1000 : null),
        fmtPriceTon(r.ort_fiyat != null ? r.ort_fiyat * 1000 : null),
        fmtTon((r.miktar || 0) / 1000), String(r.islem_sayisi ?? "—"),
      ];
      cells.forEach(c => { const td = document.createElement("td"); td.textContent = c; tr.appendChild(td); });
      tbody.appendChild(tr);
    });

    const countEl = document.createElement("span");
    countEl.textContent = sorted.length > TABLE_ROW_LIMIT
      ? `İlk ${TABLE_ROW_LIMIT} satır gösteriliyor — toplam ${sorted.length} satır. Tümü için CSV olarak aktarın.`
      : `${sorted.length} satır`;
    foot.appendChild(countEl);
  }

  function exportKtbCsv(rows) {
    const cols = ["trade_date", "grup_kodu", "grup_adi", "sinif_adi", "min_fiyat", "ort_fiyat", "max_fiyat", "miktar", "islem_sayisi"];
    const esc = v => {
      const s = v == null ? "" : String(v);
      return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [cols.join(";")].concat(rows.map(r => cols.map(c => esc(r[c])).join(";")));
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ktb-bulten-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function renderAll() {
    const rows = currentRows();
    const series = dailyWeightedSeries(rows);
    document.getElementById("ktb-chart-title").textContent = "Fiyat eğilimi (TL/ton) — " + (state.product || "");
    renderPriceLegend();
    drawPriceChart(series);
    drawTonnageChart(series);
    renderKpis(rows, series);
    renderTable(rows);
  }

  function buildDateControls() {
    const startInput = document.getElementById("ktb-date-start");
    const endInput = document.getElementById("ktb-date-end");
    if (!allRows.length) return;
    const allDates = allRows.map(r => r.trade_date).sort();
    const minDate = allDates[0], maxDate = allDates[allDates.length - 1];
    startInput.min = minDate; startInput.max = maxDate;
    endInput.min = minDate; endInput.max = maxDate;
    startInput.value = minDate; endInput.value = maxDate;

    function setActivePreset(btn) {
      document.querySelectorAll("#ktb-period-presets .seg").forEach(b => b.classList.toggle("active", b === btn));
    }

    function applyPreset(preset) {
      if (preset === "all") {
        state.dateStart = null; state.dateEnd = null;
        startInput.value = minDate; endInput.value = maxDate;
      } else {
        const end = new Date(maxDate + "T00:00:00");
        const start = new Date(end);
        start.setDate(start.getDate() - Number(preset) + 1);
        const startIso = start.toISOString().slice(0, 10);
        state.dateStart = startIso < minDate ? minDate : startIso;
        state.dateEnd = maxDate;
        startInput.value = state.dateStart; endInput.value = state.dateEnd;
      }
      renderAll();
    }

    document.querySelectorAll("#ktb-period-presets .seg").forEach(btn => {
      btn.addEventListener("click", () => { setActivePreset(btn); applyPreset(btn.dataset.preset); });
    });
    startInput.addEventListener("change", () => {
      state.dateStart = startInput.value || null;
      setActivePreset(null);
      renderAll();
    });
    endInput.addEventListener("change", () => {
      state.dateEnd = endInput.value || null;
      setActivePreset(null);
      renderAll();
    });

    setActivePreset(document.querySelector('#ktb-period-presets .seg[data-preset="90"]'));
    applyPreset("90");
  }

  function buildProductControls() {
    const wrap = document.getElementById("ktb-product");
    wrap.textContent = "";
    const products = [...new Set(allRows.map(r => r.grup_adi))].sort((a, b) => a.localeCompare(b, "tr"));
    if (!state.product || !products.includes(state.product)) {
      state.product = products.includes(DEFAULT_PRODUCT) ? DEFAULT_PRODUCT : (products[0] || null);
    }
    products.forEach(p => {
      const btn = document.createElement("button");
      btn.className = "chip" + (p === state.product ? " active" : "");
      btn.type = "button"; btn.textContent = p;
      btn.addEventListener("click", () => {
        state.product = p;
        wrap.querySelectorAll(".chip").forEach(b => b.classList.toggle("active", b === btn));
        buildDateControls();
        renderAll();
      });
      wrap.appendChild(btn);
    });
  }

  let loaded = false;
  window.__ktbTab = {
    onActivate() {
      if (loaded) return;
      loaded = true;
      fetchKtbRows()
        .then(rows => {
          allRows = rows;
          document.getElementById("ktb-asof-badge").textContent = rows.length
            ? "Son veri: " + fmtDateFull(rows.reduce((max, r) => (r.trade_date > max ? r.trade_date : max), rows[0].trade_date))
            : "Veri yok";
          buildProductControls();
          buildDateControls();
          renderAll();
        })
        .catch(err => {
          console.error(err);
          document.getElementById("ktb-asof-badge").textContent = "Veri çekilemedi";
        });
    },
  };

  document.getElementById("ktb-export-btn").addEventListener("click", () => {
    const rows = currentRows();
    if (!rows.length) return;
    exportKtbCsv(rows);
  });
})();

// ---------------------------------------------------------------------------
// ABD İhracat Satışları (USDA ESR) sekmesi — TÜİK'ten (Türkiye'nin gerçek
// gümrük verisi) ve WASDE'den (tahmin) ayrı, üçüncü bir kaynak: ABD'li
// ihracatçıların haftalık bildirdiği GERÇEK satış sözleşmeleri. Türkiye'ye
// özgü değil (ABD'nin dünya geneline sattığı), ama "Türkiye" tek tıkla
// seçilebilen bir alıcı ülke olarak bu dashboard'da öne çıkarılıyor.
(function () {
  "use strict";

  const cfg = window.TUIK_DASHBOARD_CONFIG;
  const COMMODITIES = [
    { code: 401, label: "Mısır" },
    { code: 801, label: "Soya Fasulyesi" },
    { code: 901, label: "Soya Küspesi" },
    { code: 902, label: "Soya Yağı" },
    { code: 1110, label: "Ayçiçek Yağı" },
  ];
  // USDA ESR ülke listesindeki Türkiye kodu — metinden pozisyonel olarak
  // çıkarılan bir etiket değil, API'nin kendi kararlı sayısal kimliği
  // (GTİP kodu gibi), bu yüzden burada sabit tutmak güvenli.
  const TURKEY_COUNTRY_CODE = 4890;
  const UNKNOWN_COUNTRY_CODE = 9990;
  const CHART_W = 640, CHART_H = 190, PADL = 64, PADR = 16, PADT = 10, PADB = 24;

  function fmtTon(v) {
    if (v == null || isNaN(v)) return "—";
    const a = Math.abs(v);
    if (a >= 1e6) return (v / 1e6).toFixed(2) + "M ton";
    if (a >= 1e3) return (v / 1e3).toFixed(1) + "K ton";
    return (Math.round(v) || 0) + " ton";
  }

  function fmtDateShort(isoDate) {
    const d = new Date(isoDate + "T00:00:00");
    return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
  }

  function fmtDateFull(isoDate) {
    const d = new Date(isoDate + "T00:00:00");
    return d.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  }

  const CACHE_TTL_MS = 30 * 60 * 1000; // 30 dk — ESR haftada bir güncelleniyor, ~4-5 sayfalık en ağır çekim

  async function fetchEsrRows() {
    const cached = window.__supaCache.get("esr", CACHE_TTL_MS);
    if (cached) return cached;

    const headers = { apikey: cfg.SUPABASE_ANON_KEY, Authorization: `Bearer ${cfg.SUPABASE_ANON_KEY}` };
    const pageSize = 1000;
    let rows = [];
    let from = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const res = await fetch(
        `${cfg.SUPABASE_URL}/rest/v1/export_sales_stats?select=week_ending,commodity_code,commodity_name_tr,marketing_year,country_code,country_name,weekly_exports_ton,accumulated_exports_ton,outstanding_sales_ton,gross_new_sales_ton,current_my_net_sales_ton,current_my_total_commitment_ton,next_my_outstanding_sales_ton,next_my_net_sales_ton&order=week_ending.asc`,
        { headers: Object.assign({}, headers, { Range: `${from}-${from + pageSize - 1}` }) }
      );
      if (!res.ok) throw new Error(`Supabase istek hatası: ${res.status}`);
      const page = await res.json();
      rows = rows.concat(page);
      if (page.length < pageSize) break;
      from += pageSize;
    }
    window.__supaCache.set("esr", rows);
    return rows;
  }

  // ---------- tooltip (diğer panellerle aynı görünüm, her panel kendi kopyasını taşır) ----------
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

  function exportEsrCsv(rows, commodityLabel, buyerLabel) {
    const cols = [
      ["week_ending", "Hafta"], ["weekly_exports_ton", "Haftalık Sevkiyat (ton)"],
      ["accumulated_exports_ton", "Toplam Sevkiyat (ton)"], ["outstanding_sales_ton", "Bekleyen Satış (ton)"],
      ["gross_new_sales_ton", "Brüt Yeni Satış (ton)"], ["current_my_net_sales_ton", "Net Satış (ton)"],
      ["current_my_total_commitment_ton", "Toplam Taahhüt (ton)"],
      ["next_my_outstanding_sales_ton", "Gelecek PY Bekleyen Satış (ton)"], ["next_my_net_sales_ton", "Gelecek PY Net Satış (ton)"],
    ];
    const esc = v => {
      const s = v == null ? "" : String(v);
      return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [cols.map(c => c[1]).join(";")].concat(rows.map(r => cols.map(c => esc(r[c[0]])).join(";")));
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ihracat-satislari-" + commodityLabel + "-" + buyerLabel + "-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function drawEsrChart(rows) {
    const svg = document.getElementById("esr-chart");
    const legend = document.getElementById("esr-legend");
    svg.textContent = "";
    legend.textContent = "";
    svg.setAttribute("viewBox", "0 0 " + CHART_W + " " + CHART_H);
    if (!rows.length) {
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", PADL); t.setAttribute("y", CHART_H / 2); t.setAttribute("class", "axis-label");
      t.textContent = "Bu kombinasyon için veri yok.";
      svg.appendChild(t);
      return;
    }

    const series = [
      { key: "accumulated_exports_ton", label: "Toplam Sevkiyat", color: "var(--series-export)" },
      { key: "outstanding_sales_ton", label: "Bekleyen Satış", color: "var(--series-import)" },
    ];
    series.forEach(s => {
      const key = document.createElement("span"); key.className = "key";
      const sw = document.createElement("span"); sw.className = "swatch-line"; sw.style.background = s.color;
      key.appendChild(sw); key.appendChild(document.createTextNode(s.label));
      legend.appendChild(key);
    });

    const xStep = rows.length > 1 ? (CHART_W - PADL - PADR) / (rows.length - 1) : 0;
    const xScale = i => rows.length > 1 ? PADL + i * xStep : (PADL + (CHART_W - PADR)) / 2;
    const maxVal = Math.max(1, ...series.flatMap(s => rows.map(r => r[s.key] || 0)));
    const yScale = v => CHART_H - PADB - (v / maxVal) * (CHART_H - PADB - PADT);

    for (let g = 0; g <= 3; g++) {
      const y = PADT + (g * (CHART_H - PADB - PADT)) / 3;
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("class", "gridline");
      line.setAttribute("x1", PADL); line.setAttribute("x2", CHART_W - PADR);
      line.setAttribute("y1", y); line.setAttribute("y2", y);
      svg.appendChild(line);
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", PADL - 8); t.setAttribute("y", y + 3);
      t.setAttribute("text-anchor", "end"); t.setAttribute("class", "axis-label");
      t.textContent = fmtTon(maxVal - (g * maxVal) / 3);
      svg.appendChild(t);
    }

    const minLabelGap = 50;
    const tickEvery = Math.max(1, Math.ceil(minLabelGap / Math.max(xStep, 1)));
    rows.forEach((r, i) => {
      const isLast = i === rows.length - 1;
      if (i % tickEvery !== 0 && !isLast) return;
      if (isLast && rows.length > 1 && (rows.length - 1) % tickEvery !== 0) {
        const prevShown = Math.floor((rows.length - 1) / tickEvery) * tickEvery;
        if ((rows.length - 1 - prevShown) * xStep < minLabelGap) return;
      }
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", xScale(i)); t.setAttribute("y", CHART_H - 6);
      t.setAttribute("text-anchor", "middle"); t.setAttribute("class", "axis-label");
      t.textContent = fmtDateShort(r.week_ending);
      svg.appendChild(t);
    });

    const hoverLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
    hoverLine.setAttribute("class", "baseline");
    hoverLine.setAttribute("y1", PADT); hoverLine.setAttribute("y2", CHART_H - PADB);
    hoverLine.style.opacity = "0";
    svg.appendChild(hoverLine);

    series.forEach(s => {
      const pts = rows.map((r, i) => [xScale(i), yScale(r[s.key] || 0)]);
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
    rows.forEach((r, i) => {
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      const hitW = Math.max(xStep, 6);
      rect.setAttribute("x", xScale(i) - hitW / 2); rect.setAttribute("y", PADT);
      rect.setAttribute("width", hitW); rect.setAttribute("height", CHART_H - PADB - PADT);
      rect.setAttribute("fill", "transparent"); rect.style.cursor = "pointer"; rect.tabIndex = 0;
      const showFn = evt => {
        hoverLine.setAttribute("x1", xScale(i)); hoverLine.setAttribute("x2", xScale(i));
        hoverLine.style.opacity = "1";
        const wrap = document.createElement("div");
        const ttl = document.createElement("div"); ttl.className = "ttl"; ttl.textContent = fmtDateFull(r.week_ending);
        wrap.appendChild(ttl);
        series.forEach(s => {
          const row = document.createElement("div"); row.className = "row";
          const kl = document.createElement("span"); kl.className = "key-line"; kl.style.background = s.color;
          const v = document.createElement("span"); v.className = "val"; v.textContent = fmtTon(r[s.key]);
          row.appendChild(kl); row.appendChild(v); row.appendChild(document.createTextNode(" " + s.label));
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

  function init(allRows) {
    if (!allRows.length) {
      document.getElementById("esr-release-badge").textContent = "Henüz veri yok";
      document.getElementById("esr-table-title").textContent = "Haftalık detay — henüz veri yüklenmedi";
      return;
    }

    const latestWeek = allRows.reduce((max, r) => (r.week_ending > max ? r.week_ending : max), allRows[0].week_ending);
    document.getElementById("esr-release-badge").textContent = "Veri " + fmtDateFull(latestWeek) + " haftasına kadar güncel";

    const state = { commodity: 401, countryMode: "world", customCountry: null };
    let currentSeriesRows = [];

    function currentCommodityRows() {
      return allRows.filter(r => r.commodity_code === state.commodity);
    }

    // Dünya toplamı: aynı hafta için tüm ülkelerin satırlarını toplar.
    // UNKNOWN (USDA'nın alıcı ülkeyi bildirmediği satışlar) dahil — bu
    // ABD'nin kendi resmi toplamının bir parçası, dışarıda bırakmak
    // "toplam sevkiyat" rakamını gerçek resmi toplamdan düşük gösterirdi.
    function aggregateByWeek(rows) {
      const map = new Map();
      const keys = [
        "weekly_exports_ton", "accumulated_exports_ton", "outstanding_sales_ton", "gross_new_sales_ton",
        "current_my_net_sales_ton", "current_my_total_commitment_ton", "next_my_outstanding_sales_ton", "next_my_net_sales_ton",
      ];
      rows.forEach(r => {
        let cur = map.get(r.week_ending);
        if (!cur) { cur = { week_ending: r.week_ending }; keys.forEach(k => { cur[k] = 0; }); map.set(r.week_ending, cur); }
        keys.forEach(k => { cur[k] += r[k] || 0; });
      });
      return [...map.values()].sort((a, b) => a.week_ending.localeCompare(b.week_ending));
    }

    function currentSeries() {
      const rows = currentCommodityRows();
      if (state.countryMode === "turkey") {
        return { rows: rows.filter(r => r.country_code === TURKEY_COUNTRY_CODE).sort((a, b) => a.week_ending.localeCompare(b.week_ending)), label: "Türkiye" };
      }
      if (state.countryMode === "custom" && state.customCountry) {
        return { rows: rows.filter(r => r.country_code === state.customCountry.code).sort((a, b) => a.week_ending.localeCompare(b.week_ending)), label: state.customCountry.name };
      }
      return { rows: aggregateByWeek(rows), label: "Dünya Toplamı" };
    }

    function topBuyers(rows) {
      const latestByCountry = new Map();
      rows.forEach(r => {
        if (r.country_code === UNKNOWN_COUNTRY_CODE) return;
        const cur = latestByCountry.get(r.country_code);
        if (!cur || r.week_ending > cur.week_ending) latestByCountry.set(r.country_code, r);
      });
      return [...latestByCountry.values()].sort((a, b) => b.accumulated_exports_ton - a.accumulated_exports_ton).slice(0, 8);
    }

    function buildCommodityControls() {
      const wrap = document.getElementById("esr-commodity");
      wrap.textContent = "";
      COMMODITIES.forEach(c => {
        const btn = document.createElement("button");
        btn.className = "seg" + (state.commodity === c.code ? " active" : "");
        btn.type = "button";
        btn.textContent = c.label;
        btn.addEventListener("click", () => {
          state.commodity = c.code;
          wrap.querySelectorAll(".seg").forEach(b => b.classList.toggle("active", b === btn));
          renderAll();
        });
        wrap.appendChild(btn);
      });
    }

    function setCountryMode(mode, custom) {
      state.countryMode = mode;
      state.customCountry = custom || null;
      document.querySelectorAll("#esr-country-mode .seg").forEach(b => b.classList.toggle("active", mode !== "custom" && b.dataset.value === mode));
      renderAll();
    }

    function buildCountryModeControls() {
      document.querySelectorAll("#esr-country-mode .seg").forEach(btn => {
        btn.addEventListener("click", () => setCountryMode(btn.dataset.value));
      });
    }

    function buildCountrySearch() {
      const input = document.getElementById("esr-country-search");
      const box = document.getElementById("esr-country-suggestions");
      function closeBox() { box.classList.remove("open"); box.textContent = ""; }
      function renderSuggestions() {
        const q = input.value.trim().toLowerCase();
        if (!q) { closeBox(); return; }
        const names = new Map();
        currentCommodityRows().forEach(r => {
          if (r.country_code !== UNKNOWN_COUNTRY_CODE && !names.has(r.country_code)) names.set(r.country_code, r.country_name);
        });
        const matches = [...names.entries()].filter(([, name]) => name.toLowerCase().includes(q)).slice(0, 8);
        box.textContent = "";
        if (!matches.length) {
          const empty = document.createElement("div"); empty.className = "empty"; empty.textContent = "Sonuç yok";
          box.appendChild(empty);
        } else {
          matches.forEach(([code, name]) => {
            const btn = document.createElement("button");
            btn.type = "button"; btn.textContent = name;
            btn.addEventListener("mousedown", evt => { evt.preventDefault(); input.value = ""; closeBox(); setCountryMode("custom", { code, name }); });
            box.appendChild(btn);
          });
        }
        box.classList.add("open");
      }
      input.addEventListener("input", renderSuggestions);
      input.addEventListener("focus", () => { if (input.value.trim()) renderSuggestions(); });
      input.addEventListener("blur", () => setTimeout(closeBox, 120));
    }

    function renderTopBuyers() {
      const wrap = document.getElementById("esr-top-buyers");
      wrap.textContent = "";
      topBuyers(currentCommodityRows()).forEach(b => {
        const chip = document.createElement("button");
        chip.type = "button";
        const isActive = state.countryMode === "custom" && state.customCountry && state.customCountry.code === b.country_code;
        chip.className = "chip" + (isActive ? " active" : "");
        chip.textContent = b.country_name;
        chip.addEventListener("click", () => setCountryMode("custom", { code: b.country_code, name: b.country_name }));
        wrap.appendChild(chip);
      });
    }

    function renderKpis(series) {
      const wrap = document.getElementById("esr-kpi-row");
      wrap.textContent = "";
      const last = series.rows[series.rows.length - 1];
      if (!last) {
        const p = document.createElement("p"); p.style.color = "var(--text-muted)"; p.style.fontSize = "13px";
        p.textContent = "Bu kombinasyon için veri yok.";
        wrap.appendChild(p);
        return;
      }
      [
        ["Toplam Sevkiyat (PY başından)", last.accumulated_exports_ton],
        ["Bekleyen Satış (Sevk Edilmemiş)", last.outstanding_sales_ton],
        ["Bu Hafta Net Satış", last.current_my_net_sales_ton],
        ["Toplam Taahhüt", last.current_my_total_commitment_ton],
        ["Gelecek PY Bekleyen Satış", last.next_my_outstanding_sales_ton],
      ].forEach(([label, value]) => {
        const tile = document.createElement("div"); tile.className = "stat-tile";
        const l = document.createElement("div"); l.className = "label"; l.textContent = label;
        const v = document.createElement("div"); v.className = "value num"; v.textContent = fmtTon(value);
        tile.appendChild(l); tile.appendChild(v);
        wrap.appendChild(tile);
      });
    }

    function renderTable(rows) {
      const thead = document.getElementById("esr-thead");
      const tbody = document.getElementById("esr-tbody");
      thead.textContent = ""; tbody.textContent = "";
      const cols = [
        ["Hafta", r => fmtDateFull(r.week_ending), false],
        ["Haftalık Sevkiyat", r => fmtTon(r.weekly_exports_ton), true],
        ["Toplam Sevkiyat", r => fmtTon(r.accumulated_exports_ton), true],
        ["Bekleyen Satış", r => fmtTon(r.outstanding_sales_ton), true],
        ["Net Satış", r => fmtTon(r.current_my_net_sales_ton), true],
        ["Toplam Taahhüt", r => fmtTon(r.current_my_total_commitment_ton), true],
      ];
      cols.forEach(([label, , isNum]) => {
        const th = document.createElement("th"); th.textContent = label;
        if (isNum) th.classList.add("num-col");
        thead.appendChild(th);
      });
      if (!rows.length) {
        const tr = document.createElement("tr");
        const td = document.createElement("td"); td.colSpan = cols.length; td.textContent = "Bu kombinasyon için veri yok.";
        tr.appendChild(td); tbody.appendChild(tr);
        return;
      }
      [...rows].reverse().forEach(r => {
        const tr = document.createElement("tr");
        cols.forEach(([, get, isNum]) => {
          const td = document.createElement("td");
          if (isNum) td.classList.add("num-col", "num");
          td.textContent = get(r);
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
    }

    function renderAll() {
      const series = currentSeries();
      currentSeriesRows = series.rows;
      const commodityLabel = COMMODITIES.find(c => c.code === state.commodity).label;
      document.getElementById("esr-chart-title").textContent = "Haftalık eğilim — " + commodityLabel + " · " + series.label;
      document.getElementById("esr-table-title").textContent = "Haftalık detay — " + commodityLabel + " · " + series.label;
      renderKpis(series);
      drawEsrChart(series.rows);
      renderTable(series.rows);
      renderTopBuyers();
    }

    document.getElementById("esr-export-btn").addEventListener("click", () => {
      if (!currentSeriesRows.length) return;
      const commodityLabel = COMMODITIES.find(c => c.code === state.commodity).label;
      const buyerLabel = state.countryMode === "turkey" ? "Turkiye" : state.countryMode === "custom" && state.customCountry ? state.customCountry.name.trim() : "Dunya";
      exportEsrCsv(currentSeriesRows, commodityLabel, buyerLabel);
    });

    buildCommodityControls();
    buildCountryModeControls();
    buildCountrySearch();
    renderAll();
  }

  let loaded = false;
  window.__tabManager.register("tab-esr", "esr-panel", () => {
    if (loaded) return;
    loaded = true;
    fetchEsrRows()
      .then(rows => init(rows))
      .catch(err => {
        console.error(err);
        document.getElementById("esr-release-badge").textContent = "Veri çekilemedi";
        document.getElementById("esr-table-title").textContent = "Haftalık detay yüklenemedi — Supabase bağlantısını kontrol edin";
      });
  });
})();
