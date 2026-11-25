import json
from playwright.sync_api import sync_playwright

URL = "https://tahaozkilinc.github.io/tuik-veri/"


def header_screenshot(page, path):
    page.query_selector("header.topbar").screenshot(path=path)


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1280, "height": 800})
    console_errors = []
    page_errors = []
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: page_errors.append(str(e)))

    page.goto(URL, wait_until="networkidle", timeout=60000)
    page.wait_for_timeout(1000)

    state_light = page.eval_on_selector_all(
        ".group-logo",
        "els => els.map(e => ({alt: e.alt, cls: e.className, visible: getComputedStyle(e).display !== 'none', src: e.currentSrc}))",
    )
    print("acik temada group-logo durumu:", json.dumps(state_light, ensure_ascii=False))
    header_screenshot(page, "/tmp/header_light.png")

    page.click("#theme-toggle")
    page.wait_for_timeout(400)
    state_dark = page.eval_on_selector_all(
        ".group-logo",
        "els => els.map(e => ({alt: e.alt, cls: e.className, visible: getComputedStyle(e).display !== 'none', src: e.currentSrc, bg: getComputedStyle(e).backgroundColor}))",
    )
    print("koyu temada group-logo durumu:", json.dumps(state_dark, ensure_ascii=False))
    header_screenshot(page, "/tmp/header_dark.png")

    print("=== konsol HATALARI ===")
    print(console_errors)
    print("=== sayfa (uncaught) HATALARI ===")
    print(page_errors)

    browser.close()
