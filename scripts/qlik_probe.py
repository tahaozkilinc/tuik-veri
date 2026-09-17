"""Standalone (Playwright kullanmayan) Qlik Engine API keşif script'i.

Amaç: bi.tuik.gov.tr'deki "DT_OZEL_TR" Qlik Sense uygulamasına doğrudan
WebSocket üzerinden bağlanıp GetFieldList çağırarak gerçek alan adlarını
(GTİP kodu, ülke, yıl, ay, akış/yön, tutar ölçüleri) keşfetmek. Playwright
tabanlı DOM otomasyonu çok kırılgan ve yavaş çıktı (her kalibrasyon ~10dk);
bu script saniyeler içinde çalışıp Qlik Engine'in JSON-RPC API'sini
doğrudan konuşarak aynı veriye (ve fazlasına) erişmeyi hedefliyor.
"""

from __future__ import annotations

import asyncio
import json
import secrets
import string

import requests
import websockets

APP_ID = "8db826a9-59f2-4a33-a91e-88ca417dddf9"  # DT_OZEL_TR (ana veri app'i)
BASE = "https://bi.tuik.gov.tr"


def _random_xrfkey(n: int = 16) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(n))


def get_session_cookies() -> tuple[requests.Session, str | None]:
    session = requests.Session()
    session.headers["User-Agent"] = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"
    # Önce ana sayfayı ziyaret et — sunucu bazı oturum çerezlerini ancak
    # normal bir sayfa isteğinde set edebilir.
    resp0 = session.get(
        f"{BASE}/extensions/tuik-mashup/index.html", params={"report_type": "2"}, timeout=15
    )
    print(f"index.html GET status: {resp0.status_code}")

    xrfkey = _random_xrfkey()
    resp = session.get(f"{BASE}/qps/csrftoken", params={"xrfkey": xrfkey}, timeout=15)
    print(f"csrftoken GET status: {resp.status_code}")
    print("cookies:")
    csrf_value = None
    for c in session.cookies:
        print(f"  {c.name} = {c.value}")
        if "csrf" in c.name.lower():
            csrf_value = c.value
    return session, csrf_value


async def probe() -> None:
    session, csrf_value = get_session_cookies()
    if not csrf_value:
        print("UYARI: csrf cookie bulunamadı, token'sız denenecek.")

    cookie_header = "; ".join(f"{c.name}={c.value}" for c in session.cookies)
    ws_url = f"wss://bi.tuik.gov.tr/app/{APP_ID}"
    if csrf_value:
        ws_url += f"?qlik-csrf-token={csrf_value}"

    print(f"WS bağlanılıyor: {ws_url}")
    async with websockets.connect(
        ws_url, extra_headers={"Cookie": cookie_header}, max_size=None
    ) as ws:
        for _ in range(2):
            try:
                msg = await asyncio.wait_for(ws.recv(), timeout=15)
                print(f"PUSH: {msg[:300]}")
            except asyncio.TimeoutError:
                print("(push beklenirken timeout)")
                break

        counter = {"n": 1}

        async def call(method: str, params: list, handle: int = -1) -> dict:
            req_id = counter["n"]
            counter["n"] += 1
            await ws.send(
                json.dumps(
                    {
                        "delta": False,
                        "handle": handle,
                        "method": method,
                        "params": params,
                        "id": req_id,
                        "jsonrpc": "2.0",
                    }
                )
            )
            while True:
                raw = await asyncio.wait_for(ws.recv(), timeout=25)
                data = json.loads(raw)
                if data.get("id") == req_id:
                    return data
                print(f"(atlanan push) {raw[:200]}")

        open_resp = await call("OpenDoc", [APP_ID, "", "", "", False])
        print(f"OpenDoc yanıtı: {json.dumps(open_resp, ensure_ascii=False)[:800]}")
        if "error" in open_resp:
            print("OpenDoc HATA verdi, duruluyor.")
            return
        doc_handle = open_resp["result"]["qReturn"]["qHandle"]
        print(f"doc_handle = {doc_handle}")

        field_resp = await call(
            "GetFieldList",
            [
                {
                    "qShowSystem": False,
                    "qShowHidden": False,
                    "qShowSrcTables": True,
                    "qShowSemantic": True,
                    "qShowDerivedFields": False,
                }
            ],
            handle=doc_handle,
        )
        print("::group::GetFieldList (tam)")
        print(json.dumps(field_resp, ensure_ascii=False, indent=2)[:30000])
        print("::endgroup::")

        if "result" in field_resp:
            items = field_resp["result"]["qReturn"]["qFieldList"]["qItems"]
            print("::group::alan adları (özet)")
            for item in items:
                print(f"{item.get('qName')!r} (src={item.get('qSrcTables')})")
            print("::endgroup::")


if __name__ == "__main__":
    asyncio.run(probe())
