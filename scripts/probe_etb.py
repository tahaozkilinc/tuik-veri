import json
from playwright.sync_api import sync_playwright

URL = "https://online.etb.org.tr/online-bulten?grupKodu=AYC&sinifKodu=-&tarih=-"
calls = []

def on_response(resp):
    req = resp.request
    if "/api/" not in req.url:
        return
    try:
        body = resp.text()
    except Exception as e:
        body = f"<err {e}>"
    calls.append({
        "method": req.method, "url": req.url, "status": resp.status,
        "req_headers": {k: v for k, v in req.headers.items() if k.lower() in ("authorization", "content-type", "x-source", "source", "isletmeid", "firmaid", "subeid", "uygulamaid") or k.lower().startswith("x-")},
        "post": (req.post_data or "")[:800],
        "body": body[:2500],
        "len": len(body),
    })

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1400, "height": 1000})
    pg.on("response", on_response)
    pg.goto(URL, wait_until="networkidle", timeout=90000)
    pg.wait_for_timeout(6000)
    print("TEXT:", pg.inner_text("body")[:4000])
    # date inputs present?
    print("INPUTS:", pg.eval_on_selector_all("input, select, mat-select, p-calendar", "els => els.map(e => e.outerHTML.slice(0,200))")[:20])
    b.close()

for c in calls:
    print("\n=====", c["method"], c["status"], c["url"], "len=", c["len"])
    print("REQH:", c["req_headers"])
    if c["post"]:
        print("POST:", c["post"])
    print("BODY:", c["body"])
