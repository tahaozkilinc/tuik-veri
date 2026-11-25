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

    state = page.eval_on_selector_all(
        ".group-logo",
        "els => els.map(e => ({alt: e.alt, cls: e.className, visible: getComputedStyle(e).display !== 'none'}))",
    )
    print("group-logo durumu (acik tema):", json.dumps(state, ensure_ascii=False))

    links = page.eval_on_selector_all(
        ".brand a",
        "els => els.map(e => ({href: e.href, img_alt: e.querySelector('img')?.alt}))",
    )
    print("brand/group-logo linkleri:", json.dumps(links, ensure_ascii=False))

    page.query_selector("header.topbar").screenshot(path="/tmp/header_restored.png")

    print("=== konsol HATALARI ===")
    print(console_errors)
    print("=== sayfa (uncaught) HATALARI ===")
    print(page_errors)

    browser.close()
