import json
from playwright.sync_api import sync_playwright

URL = "https://tahaozkilinc.github.io/tuik-veri/"

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1280, "height": 800})
    redirects = []
    page.on("response", lambda r: redirects.append({"url": r.url, "status": r.status}) if r.url == URL or "sunarmisir" in r.url else None)

    resp = page.goto(URL, wait_until="networkidle", timeout=60000)
    print("HTTP status:", resp.status if resp else None)
    print("final url:", page.url)
    print("response chain for main URL / any sunarmisir hit:", json.dumps(redirects, ensure_ascii=False))

    page.wait_for_timeout(1000)
    print("title:", page.title())
    print("kpi/stat eleman sayisi:", len(page.query_selector_all(".stat-tile, .kpi-row")))

    brand = page.eval_on_selector(".brand-logo", "e => e.getBoundingClientRect()")
    chips = page.eval_on_selector_all(
        ".group-logo",
        "els => els.filter(e => getComputedStyle(e).display !== 'none').map(e => ({rect: e.getBoundingClientRect(), border: getComputedStyle(e).borderStyle}))",
    )
    print("brand-logo rect:", json.dumps(brand))
    print("group-logo rects/border:", json.dumps(chips))

    page.query_selector("header.topbar").screenshot(path="/tmp/header_final2.png")

    browser.close()
