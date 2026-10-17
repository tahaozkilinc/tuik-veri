"""temp: use Playwright to load the real UZTB page and capture ALL network API calls,
looking specifically for any historical/date-range endpoint we may have missed."""
import json
from playwright.sync_api import sync_playwright

calls = []

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()

    def on_request(req):
        if any(x in req.url for x in ["/api/", "/json/", ".asp", ".php"]):
            calls.append({"method": req.method, "url": req.url, "postData": req.post_data})

    def on_response(resp):
        for c in calls:
            if c["url"] == resp.url and "status" not in c:
                try:
                    body = resp.text()
                except Exception:
                    body = None
                c["status"] = resp.status
                c["body"] = (body or "")[:600]
                break

    page.on("request", on_request)
    page.on("response", on_response)

    page.goto("http://www.uzunkoprutb.org.tr/sayfa.asp?tur=ssdetay&urun=99992", wait_until="networkidle", timeout=30000)
    page.wait_for_timeout(2000)

    for text in ["Geçmiş", "Arşiv", "Tarih", "Aylık", "Yıllık"]:
        try:
            loc = page.get_by_text(text, exact=False)
            print(f"text match '{text}': {loc.count()}")
        except Exception as e:
            print(f"text match '{text}' error: {e}")

    browser.close()

print(f"\nTotal API-ish calls captured: {len(calls)}\n")
for c in calls:
    print("---")
    print(c.get("method"), c.get("url"))
    if c.get("postData"):
        print("POST DATA:", c["postData"][:300])
    print("STATUS:", c.get("status"))
    print("BODY:", c.get("body"))
