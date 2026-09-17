"""Playwright'ı SADECE oturum/CSRF/WS-handshake bootstrap için kullanan,
DOM'a hiç dokunmayan Qlik Engine keşif script'i.

Saf HTTP+websockets denemesi CSRF duvarına çarptı (qps/csrftoken hiçbir
csrf cookie'si set etmiyor — muhtemelen tarayıcıda JS ile üretilip
başka bir mekanizmayla doğrulanıyor). Bunun yerine: gerçek tarayıcı
oturumunun KENDİ açtığı WebSocket'i (window.WebSocket'i sayfa
scriptlerinden ÖNCE saracak bir init script ile) ele geçirip, üzerinden
ham JSON-RPC mesajları gönderip cevap bekliyoruz. Böylece CSRF/cookie
akışını hiç replicate etmemize gerek kalmıyor — tarayıcı zaten hallediyor.
"""

from __future__ import annotations

import json
import sys

from playwright.sync_api import Page, sync_playwright

MASHUP_URL = "https://bi.tuik.gov.tr/extensions/tuik-mashup/index.html?report_type=2"
APP_ID = "8db826a9-59f2-4a33-a91e-88ca417dddf9"  # DT_OZEL_TR

_INIT_SCRIPT = """
window.__qlikSockets = {};
window.__qlikPending = {};
const NativeWS = window.WebSocket;
function WrappedWS(url, protocols) {
  const ws = protocols !== undefined ? new NativeWS(url, protocols) : new NativeWS(url);
  if (url.indexOf('/app/') !== -1) {
    window.__qlikSockets[url] = ws;
    ws.addEventListener('message', function (ev) {
      try {
        const data = JSON.parse(ev.data);
        if (data.id !== undefined && window.__qlikPending[data.id]) {
          window.__qlikPending[data.id](data);
          delete window.__qlikPending[data.id];
        }
      } catch (e) {}
    });
  }
  return ws;
}
WrappedWS.prototype = NativeWS.prototype;
window.WebSocket = WrappedWS;
"""

_CALL_JS = """
async ([appIdSubstr, method, params, handle, reqId, timeoutMs]) => {
    const key = Object.keys(window.__qlikSockets || {}).find(k => k.indexOf(appIdSubstr) !== -1);
    if (!key) return {__error: 'socket bulunamadı', __keys: Object.keys(window.__qlikSockets || {})};
    const ws = window.__qlikSockets[key];
    if (ws.readyState !== 1) {
        await new Promise((resolve) => { ws.addEventListener('open', resolve, {once: true}); });
    }
    const msg = {delta: false, handle: handle, method: method, params: params, id: reqId, jsonrpc: '2.0'};
    return await new Promise((resolve) => {
        const timer = setTimeout(() => resolve({__error: 'timeout'}), timeoutMs);
        window.__qlikPending[reqId] = (data) => { clearTimeout(timer); resolve(data); };
        ws.send(JSON.stringify(msg));
    });
}
"""


def call_engine(page: Page, method: str, params: list, handle: int = -1, req_id: int = 9001, timeout_ms: int = 20_000) -> dict:
    return page.evaluate(_CALL_JS, [APP_ID, method, params, handle, req_id, timeout_ms])


def main() -> int:
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page()
        page.add_init_script(_INIT_SCRIPT)
        page.goto(MASHUP_URL, wait_until="networkidle", timeout=20_000)

        try:
            page.wait_for_function(
                "(appIdSubstr) => Object.keys(window.__qlikSockets || {}).some(k => k.indexOf(appIdSubstr) !== -1)",
                arg=APP_ID,
                timeout=20_000,
            )
        except Exception as exc:  # noqa: BLE001
            print(f"UYARI: app soket'i {timeout_note(exc)}", file=sys.stderr)

        keys = page.evaluate("Object.keys(window.__qlikSockets || {})")
        print(f"yakalanan soketler: {keys}")

        open_resp = call_engine(page, "OpenDoc", [APP_ID, "", "", "", False], req_id=9001)
        print("OpenDoc:", json.dumps(open_resp, ensure_ascii=False)[:600])

        if "__error" in open_resp or "error" in open_resp:
            print("OpenDoc başarısız, duruluyor.", file=sys.stderr)
            browser.close()
            return 1

        doc_handle = open_resp["result"]["qReturn"]["qHandle"]
        print(f"doc_handle = {doc_handle}")

        # GetFieldList bloklandı — belki GetTablesAndKeys (veri modeli
        # görüntüleyici) veya GetScript (yükleme betiği, TÜM alan
        # adlarını ve ifadeleri tek seferde verir) engellenmemiştir.
        tables_resp = call_engine(
            page,
            "GetTablesAndKeys",
            [{"qcx": 1000, "qcy": 1000}, {"qcx": 1000, "qcy": 1000}, 0, True, False],
            handle=doc_handle,
            req_id=9050,
            timeout_ms=10_000,
        )
        print("::group::GetTablesAndKeys (tablo/alan adları, kompakt)")
        if "result" in tables_resp:
            for table in tables_resp["result"].get("qtr", []):
                names = [f["qName"] for f in table.get("qFields", [])]
                print(f"TABLO {table['qName']} ({table.get('qNoOfRows')} satır): {names}")
        else:
            print(json.dumps(tables_resp, ensure_ascii=False)[:2000])
        print("::endgroup::")

        # IHRITH gerçek alan olarak bulundu (2 farklı değer) — muhtemelen
        # akış/yön (İhracat/İthalat). Gerçek değerlerini görelim.
        candidates = ["IHRITH", "IHRITH_FLAG", "OLCU_KODU"]
        req_id = 9100
        print("::group::alan değerleri (IHRITH ve ilişkili)")
        for field in candidates:
            req_id += 1
            resp = call_engine(
                page,
                "CreateSessionObject",
                [
                    {
                        "qInfo": {"qType": "probe"},
                        "qListObjectDef": {
                            "qDef": {"qFieldDefs": [field]},
                            "qInitialDataFetch": [{"qWidth": 1, "qHeight": 10, "qTop": 0}],
                        },
                    }
                ],
                handle=doc_handle,
                req_id=req_id,
                timeout_ms=8_000,
            )
            if "error" in resp:
                print(f"{field!r}: HATA {resp['error'].get('message')}")
                continue
            probe_handle = resp["result"]["qReturn"]["qHandle"]
            req_id += 1
            layout = call_engine(page, "GetLayout", [], handle=probe_handle, req_id=req_id, timeout_ms=8_000)
            try:
                lo = layout["result"]["qLayout"]["qListObject"]
                size = lo["qSize"]
                pages = lo.get("qDataPages", [])
                samples = []
                if pages:
                    for row in pages[0].get("qMatrix", [])[:5]:
                        samples.append(row[0].get("qText"))
                print(f"{field!r}: VAR qcy={size.get('qcy')} örnek={samples}")
            except Exception as exc:  # noqa: BLE001
                print(f"{field!r}: beklenmeyen yanıt yapısı ({exc}): {json.dumps(layout, ensure_ascii=False)[:300]}")
        print("::endgroup::")

        browser.close()
    return 0


def timeout_note(exc: Exception) -> str:
    return f"bulunamadı: {exc}"


if __name__ == "__main__":
    raise SystemExit(main())
