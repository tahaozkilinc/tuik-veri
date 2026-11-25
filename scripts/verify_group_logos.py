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
    page.wait_for_timeout(1500)

    logos = page.eval_on_selector_all(
        ".group-logo",
        "els => els.map(e => ({alt: e.alt, src: e.currentSrc || e.src, w: e.naturalWidth, h: e.naturalHeight}))",
    )
    print("group-logo elementleri:", json.dumps(logos, ensure_ascii=False))

    page.screenshot(path="/tmp/header_desktop.png")

    page.set_viewport_size({"width": 390, "height": 844})
    page.wait_for_timeout(300)
    page.screenshot(path="/tmp/header_mobile.png")

    print("=== konsol HATALARI ===")
    print(console_errors)
    print("=== sayfa (uncaught) HATALARI ===")
    print(page_errors)

    browser.close()
