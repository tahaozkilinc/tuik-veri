import json
from playwright.sync_api import sync_playwright

URL = "https://tahaozkilinc.github.io/tuik-veri/"


def header_screenshot(page, path):
    header = page.query_selector("header.topbar")
    header.screenshot(path=path)


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
        "els => els.map(e => ({alt: e.alt, src: e.currentSrc || e.src, w: e.naturalWidth, h: e.naturalHeight, bg: getComputedStyle(e).backgroundColor}))",
    )
    print("group-logo (acik tema - ilk yukleme):", json.dumps(logos, ensure_ascii=False))

    links = page.eval_on_selector_all(
        ".brand a",
        "els => els.map(e => ({href: e.href, target: e.target, img_alt: e.querySelector('img')?.alt}))",
    )
    print("brand/group-logo linkleri:", json.dumps(links, ensure_ascii=False))

    header_screenshot(page, "/tmp/header_light.png")

    page.click("#theme-toggle")
    page.wait_for_timeout(400)
    theme = page.eval_on_selector("html", "el => el.getAttribute('data-theme')")
    logos_dark = page.eval_on_selector_all(
        ".group-logo",
        "els => els.map(e => ({alt: e.alt, bg: getComputedStyle(e).backgroundColor}))",
    )
    page_bg = page.eval_on_selector("body", "el => getComputedStyle(el).backgroundColor")
    print("data-theme:", theme, "| body bg:", page_bg)
    print("group-logo (koyu tema):", json.dumps(logos_dark, ensure_ascii=False))
    header_screenshot(page, "/tmp/header_dark.png")

    page.set_viewport_size({"width": 390, "height": 844})
    page.wait_for_timeout(300)
    header_screenshot(page, "/tmp/header_dark_mobile.png")

    print("=== konsol HATALARI ===")
    print(console_errors)
    print("=== sayfa (uncaught) HATALARI ===")
    print(page_errors)

    browser.close()
