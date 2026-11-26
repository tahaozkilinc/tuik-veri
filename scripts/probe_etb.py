"""Geçici: canlı sitede ETB/EDTB sekmeleri ve Özet tablolarını doğrular."""
from playwright.sync_api import sync_playwright

URL = "https://tahaozkilinc.github.io/tuik-veri/"
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1280, "height": 1000})
    errors = []
    pg.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
    pg.on("console", lambda m: errors.append("console: " + m.text) if m.type == "error" else None)
    pg.goto(URL, wait_until="networkidle", timeout=90000)
    pg.click("#tab-exchange"); pg.wait_for_timeout(5000)
    tiles = lambda sel: pg.eval_on_selector_all(sel, "els => els.map(e => e.innerText.replace(/\\n/g, ' = '))")
    cells = lambda sel: pg.eval_on_selector_all(sel, "els => els.map(e => e.textContent)")
    print("MISIR KPI:", tiles("#exchange-summary-kpi-row .stat-tile"))
    print("MISIR rows:")
    for i in range(1, 6):
        print("  ", cells(f"#exchange-summary-tbody tr:nth-child({i}) td"))
    pg.click('#exchange-summary-commodity-toggle .seg[data-commodity="aycicek"]'); pg.wait_for_timeout(3000)
    print("AYC KPI:", tiles("#exchange-summary-aycicek-kpi-row .stat-tile"))
    for i in range(1, 6):
        print("  ", cells(f"#exchange-summary-aycicek-tbody tr:nth-child({i}) td"))
    pg.click("#subtab-etb"); pg.wait_for_timeout(6000)
    print("ETB badge:", pg.text_content("#etb-asof-badge"))
    print("ETB groups:", cells("#etb-product-group .chip"))
    print("ETB variants:", cells("#etb-product-picker .chip"))
    print("ETB KPI:", tiles("#etb-kpi-row .stat-tile"))
    print("ETB row1:", cells("#etb-tbody tr:first-child td"))
    pg.click("#etb-period-presets .seg[data-preset='all']"); pg.wait_for_timeout(800)
    print("ETB ALL KPI:", tiles("#etb-kpi-row .stat-tile"), "| start:", pg.input_value("#etb-date-start"))
    pg.click("#subtab-edtb"); pg.wait_for_timeout(5000)
    print("EDTB badge:", pg.text_content("#edtb-asof-badge"))
    print("EDTB KPI:", tiles("#edtb-kpi-row .stat-tile"))
    print("EDTB row1:", cells("#edtb-tbody tr:first-child td"))
    pg.click("#edtb-period-presets .seg[data-preset='all']"); pg.wait_for_timeout(800)
    print("EDTB start:", pg.input_value("#edtb-date-start"))
    pg.click("#subtab-ktb"); pg.wait_for_timeout(4000)
    print("KTB groups:", cells("#ktb-product .chip"))
    print("HATALAR:", errors)
    b.close()
