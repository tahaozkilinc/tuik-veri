from playwright.sync_api import sync_playwright

URL = "https://tahaozkilinc.github.io/tuik-veri/"

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1280, "height": 1000})
    errors = []
    page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
    page.on("console", lambda m: errors.append("console: " + m.text) if m.type == "error" else None)
    page.goto(URL, wait_until="networkidle", timeout=60000)
    page.click("#tab-exchange")
    page.wait_for_timeout(1500)

    page.click("#subtab-uztb")
    page.wait_for_timeout(3000)
    print("UZTB KPI:", page.eval_on_selector_all("#uztb-kpi-row .stat-tile", "els => els.map(e => e.innerText.replace(/\\n/g, ' = '))"))
    print("UZTB head:", page.eval_on_selector_all("#uztb-thead th", "els => els.map(e => e.textContent)"))
    print("UZTB row1:", page.eval_on_selector_all("#uztb-tbody tr:first-child td", "els => els.map(e => e.textContent)"))

    page.click("#subtab-ktb")
    page.wait_for_timeout(4000)
    chips = page.eval_on_selector_all("#ktb-class .chip", "els => els.map(e => e.textContent + (e.classList.contains('active') ? '*' : ''))")
    print("KTB group:", page.eval_on_selector_all("#ktb-product .chip.active", "els => els.map(e => e.textContent)"), "| classes:", chips)
    kpi_all = page.eval_on_selector_all("#ktb-kpi-row .value", "els => els.map(e => e.textContent)")
    if len(chips) > 1:
        page.click("#ktb-class .chip:nth-child(2)")
        page.wait_for_timeout(500)
    kpi_one = page.eval_on_selector_all("#ktb-kpi-row .value", "els => els.map(e => e.textContent)")
    print("KTB KPI Tümü:", kpi_all, "| ilk sınıf:", kpi_one, "|", page.text_content("#ktb-chart-title"))

    for pid in ["ctb", "ptb"]:
        page.click(f"#subtab-{pid}")
        page.wait_for_timeout(3000)
        g = page.locator(f"#{pid}-product-group").bounding_box()
        v = page.locator(f"#{pid}-product-picker").bounding_box()
        d = page.locator(f"#{pid}-date-start").bounding_box()
        groups = page.eval_on_selector_all(f"#{pid}-product-group .chip", "els => els.map(e => e.textContent + (e.classList.contains('active') ? '*' : ''))")
        variants = page.eval_on_selector_all(f"#{pid}-product-picker .chip", "els => els.map(e => e.textContent + (e.classList.contains('active') ? '*' : ''))")
        print(f"{pid}: grupY={g['y']:.0f} cesitY={v['y']:.0f} tarihY={d['y']:.0f} sira_dogru={g['y'] < v['y'] < d['y']}")
        print(f"   gruplar={groups}")
        print(f"   cesitler={variants}")

    print("HATALAR:", errors)
    browser.close()
