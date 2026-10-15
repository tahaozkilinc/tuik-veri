"""temp: use Playwright to load the real KTB gunlukfiyat page and capture ALL network API calls it makes."""
import json
from playwright.sync_api import sync_playwright

calls = []

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()

    def on_request(req):
        if "/api/" in req.url:
            calls.append({"method": req.method, "url": req.url, "postData": req.post_data})

    def on_response(resp):
        if "/api/" in resp.url:
            try:
                body = resp.text()
            except Exception:
                body = None
            for c in calls:
                if c["url"] == resp.url and "status" not in c:
                    c["status"] = resp.status
                    c["body"] = (body or "")[:800]
                    break

    page.on("request", on_request)
    page.on("response", on_response)

    page.goto("https://www.ktb.org.tr/gunlukfiyat", wait_until="networkidle", timeout=30000)
    page.wait_for_timeout(3000)

    # try to find and click any "geçmiş" / date range / history-related UI
    try:
        # look for buttons/links containing history-related Turkish text
        for text in ["Geçmiş", "Tarih", "geçmiş işlem", "Arşiv"]:
            loc = page.get_by_text(text, exact=False)
            if loc.count() > 0:
                print(f"Found clickable text matching '{text}': {loc.count()} matches")
    except Exception as e:
        print("UI probe error:", e)

    # click on first product group row if present, to trigger a detail/history call
    try:
        rows = page.locator("table tr, .grup-item, .urun-item")
        print("candidate rows:", rows.count())
        if rows.count() > 1:
            rows.nth(1).click(timeout=3000)
            page.wait_for_timeout(2000)
    except Exception as e:
        print("row click error:", e)

    browser.close()

print(f"\nTotal API calls captured: {len(calls)}\n")
for c in calls:
    print("---")
    print(c.get("method"), c.get("url"))
    if c.get("postData"):
        print("POST DATA:", c["postData"][:300])
    print("STATUS:", c.get("status"))
    print("BODY:", c.get("body"))
