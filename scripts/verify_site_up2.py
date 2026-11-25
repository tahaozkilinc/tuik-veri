from playwright.sync_api import sync_playwright

URL = "https://tahaozkilinc.github.io/tuik-veri/"

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1280, "height": 800})
    console_errors = []
    page_errors = []
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: page_errors.append(str(e)))

    resp = page.goto(URL, wait_until="networkidle", timeout=60000)
    print("HTTP status:", resp.status if resp else None)
    print("final url:", page.url)
    page.wait_for_timeout(1500)

    print("title:", page.title())
    print("body text length:", len(page.inner_text("body")))
    kpis = page.query_selector_all(".stat-tile, .kpi-row")
    print("kpi/stat eleman sayisi:", len(kpis))

    page.screenshot(path="/tmp/site_status2.png", full_page=False)

    print("=== konsol HATALARI ===")
    print(console_errors)
    print("=== sayfa (uncaught) HATALARI ===")
    print(page_errors)

    browser.close()
