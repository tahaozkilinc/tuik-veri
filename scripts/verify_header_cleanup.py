import json
from playwright.sync_api import sync_playwright

URL = "https://tahaozkilinc.github.io/tuik-veri/"

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1280, "height": 800})
    console_errors = []
    page_errors = []
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: page_errors.append(str(e)))

    page.goto(URL, wait_until="networkidle", timeout=60000)
    page.wait_for_timeout(1000)

    group_logos = page.query_selector_all(".group-logo")
    h1 = page.query_selector(".brand h1")
    brand_logo = page.eval_on_selector(".brand-logo", "e => ({h: getComputedStyle(e).height, naturalW: e.naturalWidth, naturalH: e.naturalHeight, src: e.currentSrc})")
    print("group-logo eleman sayisi (0 olmali):", len(group_logos))
    print("h1 var mi (None olmali):", h1)
    print("brand-logo:", json.dumps(brand_logo, ensure_ascii=False))

    page.query_selector("header.topbar").screenshot(path="/tmp/header_final.png")

    print("=== konsol HATALARI ===")
    print(console_errors)
    print("=== sayfa (uncaught) HATALARI ===")
    print(page_errors)

    browser.close()
