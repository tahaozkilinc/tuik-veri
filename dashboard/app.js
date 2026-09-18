(function () {
  "use strict";

  const GTIP_NAMES = {
    "100590000019": "1005.90.00.00.19 MISIR",
    "120190000000": "1201.90.00.00.00 SOYA FASULYESİ",
    "110430900011": "1104.30.90.00.11 MISIR ÖZÜ",
    "230400000000": "2304.00.00.00.00 SOYA KÜSPESİ",
    "120600990019": "1206.00.99.00.19 ÇEKİRDEK",
  };
  function gtipLabel(code) {
    return GTIP_NAMES[code] || code;
  }

  const cfg = window.TUIK_DASHBOARD_CONFIG;
  const restUrl = (path) => `${cfg.SUPABASE_URL}/rest/v1/${path}`;
  const headers = {
    apikey: cfg.SUPABASE_ANON_KEY,
    Authorization: `Bearer ${cfg.SUPABASE_ANON_KEY}`,
  };

  const state = {
    rows: [],
    flow: "export",
    currentYear: new Date().getFullYear(),
  };

  async function fetchJson(path) {
    const res = await fetch(restUrl(path), { headers });
    if (!res.ok) throw new Error(`Supabase istek hatası: ${res.status}`);
    return res.json();
  }

  async function loadData() {
    const minYear = new Date().getFullYear() - 5;
    const rows = await fetchJson(
      `trade_stats?select=*&period_year=gte.${minYear}&order=period_year.asc`
    );
    state.rows = rows;

    const reports = await fetchJson(
      "daily_reports?select=*&order=report_date.desc&limit=1"
    );
    renderReport(reports[0]);

    render();
    setStatus(true, rows.length);
  }

  function setStatus(ok, rowCount) {
    const el = document.getElementById("status-text");
    const dot = document.querySelector(".status .dot");
    if (ok) {
      el.textContent = `Canlı — ${rowCount} kayıt yüklendi — ${new Date().toLocaleString("tr-TR")}`;
      dot.style.background = "var(--success)";
    } else {
      el.textContent = "Veri çekilemedi — Supabase bağlantısını kontrol edin";
      dot.style.background = "var(--danger)";
    }
  }

  function fmtUsd(v) {
    if (v == null) return "—";
    if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
    if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
    if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
    return `$${v.toFixed(0)}`;
  }

  function sumBy(rows, keyFn) {
    const totals = new Map();
    for (const r of rows) {
      const k = keyFn(r);
      totals.set(k, (totals.get(k) || 0) + (r.value_usd || 0));
    }
    return totals;
  }

  function render() {
    renderKpis();
    renderYearChart();
    renderTopBar("gtip_code", "top-gtip-chart", "GTİP", gtipLabel);
    renderTopBar("country_name", "top-country-chart", "Ülke");
    renderTable();
  }

  function renderKpis() {
    const container = document.getElementById("kpi-row");
    container.textContent = "";

    for (const [flow, label] of [["export", "İhracat"], ["import", "İthalat"]]) {
      const curRows = state.rows.filter((r) => r.flow === flow && r.period_year === state.currentYear);
      const prevRows = state.rows.filter((r) => r.flow === flow && r.period_year === state.currentYear - 1);
      const cur = curRows.reduce((s, r) => s + (r.value_usd || 0), 0);
      const prev = prevRows.reduce((s, r) => s + (r.value_usd || 0), 0);
      const yoy = prev ? ((cur - prev) / prev) * 100 : null;

      const tile = document.createElement("div");
      tile.className = "stat-tile";

      const labelEl = document.createElement("div");
      labelEl.className = "label";
      labelEl.textContent = `Toplam ${label} (${state.currentYear})`;
      tile.appendChild(labelEl);

      const valueEl = document.createElement("div");
      valueEl.className = "value";
      valueEl.textContent = fmtUsd(cur);
      tile.appendChild(valueEl);

      if (yoy != null) {
        const deltaEl = document.createElement("div");
        deltaEl.className = `delta ${yoy >= 0 ? "up" : "down"}`;
        deltaEl.textContent = `${yoy >= 0 ? "▲" : "▼"} ${yoy.toFixed(1)}% YoY`;
        tile.appendChild(deltaEl);
      }

      container.appendChild(tile);
    }
  }

  function makeTooltip() {
    let el = document.querySelector(".tooltip");
    if (!el) {
      el = document.createElement("div");
      el.className = "tooltip";
      document.body.appendChild(el);
    }
    return el;
  }

  function showTooltip(evt, html) {
    const tip = makeTooltip();
    tip.textContent = "";
    tip.appendChild(html);
    tip.style.opacity = "1";
    tip.style.left = `${evt.pageX + 12}px`;
    tip.style.top = `${evt.pageY + 12}px`;
  }

  function hideTooltip() {
    const tip = document.querySelector(".tooltip");
    if (tip) tip.style.opacity = "0";
  }

  function renderYearChart() {
    const svgEl = document.getElementById("year-chart");
    svgEl.textContent = "";

    const years = [...new Set(state.rows.map((r) => r.period_year))].sort();
    const exportTotals = sumBy(state.rows.filter((r) => r.flow === "export"), (r) => r.period_year);
    const importTotals = sumBy(state.rows.filter((r) => r.flow === "import"), (r) => r.period_year);

    const width = 720;
    const height = 220;
    const padL = 56;
    const padB = 24;
    const padT = 12;
    const padR = 12;
    svgEl.setAttribute("viewBox", `0 0 ${width} ${height}`);

    const maxVal = Math.max(1, ...years.map((y) => Math.max(exportTotals.get(y) || 0, importTotals.get(y) || 0)));
    const xStep = years.length > 1 ? (width - padL - padR) / (years.length - 1) : 0;
    const yScale = (v) => height - padB - (v / maxVal) * (height - padB - padT);
    const xScale = (i) => padL + i * xStep;

    // gridlines
    for (let g = 0; g <= 4; g++) {
      const y = padT + (g * (height - padB - padT)) / 4;
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("class", "gridline");
      line.setAttribute("x1", padL);
      line.setAttribute("x2", width - padR);
      line.setAttribute("y1", y);
      line.setAttribute("y2", y);
      svgEl.appendChild(line);
    }

    function drawLine(years, totals, color) {
      const pts = years.map((y, i) => [xScale(i), yScale(totals.get(y) || 0)]);
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0]},${p[1]}`).join(" "));
      path.setAttribute("stroke", color);
      path.setAttribute("stroke-width", "2");
      path.setAttribute("fill", "none");
      path.setAttribute("stroke-linejoin", "round");
      path.setAttribute("stroke-linecap", "round");
      svgEl.appendChild(path);

      pts.forEach(([x, y], i) => {
        const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        dot.setAttribute("cx", x);
        dot.setAttribute("cy", y);
        dot.setAttribute("r", "4");
        dot.setAttribute("fill", color);
        dot.setAttribute("stroke", "var(--surface-1)");
        dot.setAttribute("stroke-width", "2");
        dot.style.cursor = "pointer";
        dot.tabIndex = 0;
        const val = totals.get(years[i]) || 0;
        const showFn = (evt) => {
          const wrap = document.createElement("div");
          const row = document.createElement("div");
          const strong = document.createElement("span");
          strong.className = "val";
          strong.textContent = fmtUsd(val);
          row.appendChild(strong);
          row.appendChild(document.createTextNode(` — ${years[i]}`));
          wrap.appendChild(row);
          showTooltip(evt, wrap);
        };
        dot.addEventListener("pointermove", showFn);
        dot.addEventListener("focus", showFn);
        dot.addEventListener("pointerleave", hideTooltip);
        dot.addEventListener("blur", hideTooltip);
        svgEl.appendChild(dot);
      });
    }

    drawLine(years, exportTotals, "var(--series-1)");
    drawLine(years, importTotals, "var(--series-2)");

    years.forEach((y, i) => {
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", xScale(i));
      t.setAttribute("y", height - 6);
      t.setAttribute("text-anchor", "middle");
      t.textContent = y;
      svgEl.appendChild(t);
    });
  }

  function renderTopBar(key, elId, keyLabel, labelFmt) {
    const svgEl = document.getElementById(elId);
    svgEl.textContent = "";

    const rows = state.rows.filter((r) => r.flow === state.flow && r.period_year === state.currentYear);
    const totals = sumBy(rows, (r) => r[key] || "bilinmiyor");
    const top = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

    const width = 720;
    const rowH = 32;
    const height = top.length * rowH + 20;
    const padL = 210;
    const padR = 60;
    svgEl.setAttribute("viewBox", `0 0 ${width} ${height}`);

    const maxVal = Math.max(1, ...top.map(([, v]) => v));
    const barMax = width - padL - padR;

    top.forEach(([rawLabel, value], i) => {
      const y = i * rowH + 8;
      const barW = Math.max(2, (value / maxVal) * barMax);
      const label = labelFmt ? labelFmt(rawLabel) : rawLabel;

      const labelT = document.createElementNS("http://www.w3.org/2000/svg", "text");
      labelT.setAttribute("x", padL - 10);
      labelT.setAttribute("y", y + 14);
      labelT.setAttribute("text-anchor", "end");
      labelT.textContent = String(label).length > 30 ? String(label).slice(0, 28) + "…" : label;
      svgEl.appendChild(labelT);

      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("class", "bar-mark");
      rect.setAttribute("x", padL);
      rect.setAttribute("y", y);
      rect.setAttribute("width", barW);
      rect.setAttribute("height", 18);
      rect.setAttribute("rx", 4);
      rect.setAttribute("fill", "var(--series-1)");
      rect.tabIndex = 0;
      const showFn = (evt) => {
        const wrap = document.createElement("div");
        const row = document.createElement("div");
        const strong = document.createElement("span");
        strong.className = "val";
        strong.textContent = fmtUsd(value);
        row.appendChild(strong);
        row.appendChild(document.createTextNode(` — ${keyLabel}: ${label}`));
        wrap.appendChild(row);
        showTooltip(evt, wrap);
      };
      rect.addEventListener("pointermove", showFn);
      rect.addEventListener("focus", showFn);
      rect.addEventListener("pointerleave", hideTooltip);
      rect.addEventListener("blur", hideTooltip);
      svgEl.appendChild(rect);

      const valT = document.createElementNS("http://www.w3.org/2000/svg", "text");
      valT.setAttribute("x", padL + barW + 8);
      valT.setAttribute("y", y + 14);
      valT.textContent = fmtUsd(value);
      svgEl.appendChild(valT);
    });
  }

  function renderTable() {
    const tbody = document.getElementById("data-table-body");
    tbody.textContent = "";
    const rows = state.rows
      .filter((r) => r.flow === state.flow && r.period_year === state.currentYear)
      .sort((a, b) => (b.value_usd || 0) - (a.value_usd || 0))
      .slice(0, 50);

    for (const r of rows) {
      const tr = document.createElement("tr");
      for (const val of [r.period_year, gtipLabel(r.gtip_code), r.country_name, fmtUsd(r.value_usd)]) {
        const td = document.createElement("td");
        td.textContent = val == null ? "—" : val;
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
  }

  function renderReport(report) {
    const el = document.getElementById("report-body");
    if (!report) {
      el.textContent = "Henüz rapor üretilmedi.";
      return;
    }
    el.textContent = "";
    for (const line of report.summary_md.split("\n")) {
      const p = document.createElement("div");
      p.textContent = line;
      el.appendChild(p);
    }
  }

  function wireControls() {
    document.querySelectorAll(".flow-toggle").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.flow = btn.dataset.flow;
        document.querySelectorAll(".flow-toggle").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
        render();
      });
    });

    document.getElementById("theme-toggle").addEventListener("click", () => {
      const root = document.documentElement;
      const current = root.getAttribute("data-theme");
      root.setAttribute("data-theme", current === "dark" ? "light" : "dark");
    });
  }

  wireControls();
  loadData().catch((err) => {
    console.error(err);
    setStatus(false, 0);
  });
})();
