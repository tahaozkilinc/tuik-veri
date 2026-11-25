import json
from playwright.sync_api import sync_playwright

URL = "https://tahaozkilinc.github.io/tuik-veri/"

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1280, "height": 800})
    page.goto(URL, wait_until="networkidle", timeout=60000)
    page.wait_for_timeout(1000)

    brand = page.eval_on_selector(".brand-logo", "e => e.getBoundingClientRect()")
    print("brand-logo rect:", json.dumps(brand))

    chips = page.eval_on_selector_all(
        ".group-logo",
        "els => els.filter(e => getComputedStyle(e).display !== 'none').map(e => e.closest('a').getBoundingClientRect())",
    )
    print("group-logo link kutu boyutlari:", json.dumps(chips))

    page.query_selector("header.topbar").screenshot(path="/tmp/header_sizes.png")
    browser.close()
