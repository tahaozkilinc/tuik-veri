"""TÜİK dış ticaret verisini Qlik Engine API'sinden (WebSocket JSON-RPC)
doğrudan çeken client.

Arka plan: bi.tuik.gov.tr/extensions/tuik-mashup React uygulaması aslında
bir Qlik Sense embed'i; DOM üzerinden GTİP arama/seçim akışını otomatize
etmeye çalışmak (Playwright ile buton tıklama, form doldurma) son derece
kırılgan çıktı — arama kutusunun arkasındaki veri bir Qlik Engine
hypercube sorgusuyla WebSocket üzerinden geliyor ve DOM'da göründüğü an
ile veri geldiği an arasında değişken (5-35sn) bir gecikme var, üstelik
rapor oluşturma adımı da hiç tabloya dönüşmedi.

Bunun yerine: Playwright'ı YALNIZCA oturum/CSRF/WebSocket-handshake
bootstrap için kullanıyoruz (bunu tarayıcı zaten doğru yapıyor), sonra
sayfanın kendi açtığı WebSocket'i bir init script ile ele geçirip
üzerinden ham Qlik Engine JSON-RPC istekleri gönderiyoruz. Tüm GTİP
kodları için ülke/yıl/yön kırılımındaki veriyi TEK bir hypercube
sorgusuyla (set analysis filtreli) çekiyoruz — DOM'a hiç dokunmuyoruz.

Keşfedilen veri modeli (GetTablesAndKeys ile, DT_GENEL tablosu):
  ISTPOZ / ISTPOZ_ADI   -> GTİP kodu / açıklaması (12 haneli, noktasız)
  ULKE_KODU / ULKE_ADI  -> ülke kodu / adı
  YIL / AY              -> yıl / ay (aylık kırılım)
  IHRITH                -> "İhracat" | "İthalat"
  DOLAR / EURO / TL     -> para birimi bazlı istatistiki değer
  MIKTAR_1 / MIKTAR_2   -> miktar (MIKTAR_1 çoğunlukla kilogram)
"""

from __future__ import annotations

import sys

from playwright.sync_api import Page, sync_playwright

MASHUP_URL = "https://bi.tuik.gov.tr/extensions/tuik-mashup/index.html?report_type=2"
APP_ID = "8db826a9-59f2-4a33-a91e-88ca417dddf9"  # DT_OZEL_TR
NAV_TIMEOUT_MS = 20_000
CALL_TIMEOUT_MS = 30_000

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
    if (!key) return {__error: 'socket bulunamadı'};
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


class QlikClientError(RuntimeError):
    pass


def _call(
    page: Page,
    method: str,
    params: list,
    handle: int = -1,
    req_id: int = 1,
    timeout_ms: int = CALL_TIMEOUT_MS,
    retries: int = 3,
) -> dict:
    # Qlik Engine, OpenDoc hemen sonrası gelen ilk isteklerde bazen
    # "Request aborted" (code 15) hatası veriyor — gerçek tarayıcı
    # trafiğinde de aynı hata görülüp bir sonraki denemede kendiliğinden
    # düzeliyordu. Kısa bir bekleyip yeniden dene.
    last_resp: dict | None = None
    for attempt in range(retries + 1):
        attempt_id = req_id + attempt * 100_000
        resp = page.evaluate(_CALL_JS, [APP_ID, method, params, handle, attempt_id, timeout_ms])
        if "__error" not in resp and "error" not in resp:
            return resp
        last_resp = resp
        error = resp.get("error") or {}
        if error.get("code") == 15 and attempt < retries:
            page.wait_for_timeout(1000)
            continue
        break
    err = last_resp.get("__error") if last_resp and "__error" in last_resp else last_resp.get("error") if last_resp else "bilinmeyen hata"
    raise QlikClientError(f"{method} (id={req_id}): {err}")


def _to_number(cell: dict) -> float | None:
    val = cell.get("qNum")
    if val is None or val == "NaN":
        return None
    try:
        num = float(val)
    except (TypeError, ValueError):
        return None
    if num != num:  # NaN
        return None
    return num


def fetch_trade_stats(gtip_codes: list[str]) -> list[dict]:
    """Verilen GTİP kodları için ülke/yıl/yön kırılımında dış ticaret
    kayıtlarını Qlik Engine hypercube'undan TEK sorguda çeker.

    Dönen her kayıt trade_stats şemasına uygun bir dict: period_year,
    flow ("export"/"import"), gtip_code, gtip_description, country_code,
    country_name, value_usd, weight_kg.
    """
    if not gtip_codes:
        return []

    digits_only = ["".join(ch for ch in code if ch.isdigit()) for code in gtip_codes]
    codes_literal = ",".join(f"'{c}'" for c in digits_only)
    set_expr = f"ISTPOZ={{{codes_literal}}}"

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page()
        page.add_init_script(_INIT_SCRIPT)

        try:
            page.goto(MASHUP_URL, wait_until="networkidle", timeout=NAV_TIMEOUT_MS)
            page.wait_for_function(
                "(appIdSubstr) => Object.keys(window.__qlikSockets || {}).some(k => k.indexOf(appIdSubstr) !== -1)",
                arg=APP_ID,
                timeout=NAV_TIMEOUT_MS,
            )

            # req_id'ler uygulamanın kendi WS bağlantısında kullandığı düşük
            # sıralı id'lerle (1,2,3,...) çakışmasın diye yüksek bir bandan
            # seçiliyor — çakışırsa uygulamanın kendi delta:true isteğine ait
            # yanıtı (liste/patch formatında) yakalayıp TypeError'a yol
            # açabiliyor (gerçekten oldu: canlı koşuda görüldü).
            open_resp = _call(page, "OpenDoc", [APP_ID, "", "", "", False], req_id=90_001)
            doc_handle = open_resp["result"]["qReturn"]["qHandle"]

            hc_resp = _call(
                page,
                "CreateSessionObject",
                [
                    {
                        "qInfo": {"qType": "trade_stats"},
                        "qHyperCubeDef": {
                            "qDimensions": [
                                {"qDef": {"qFieldDefs": ["ISTPOZ"]}},
                                {"qDef": {"qFieldDefs": ["ISTPOZ_ADI"]}},
                                {"qDef": {"qFieldDefs": ["ULKE_KODU"]}},
                                {"qDef": {"qFieldDefs": ["ULKE_ADI"]}},
                                {"qDef": {"qFieldDefs": ["YIL"]}},
                                {"qDef": {"qFieldDefs": ["AY"]}},
                                {"qDef": {"qFieldDefs": ["IHRITH"]}},
                            ],
                            "qMeasures": [
                                {"qDef": {"qDef": f"Sum({{<{set_expr}>}} DOLAR)"}},
                                {"qDef": {"qDef": f"Sum({{<{set_expr}>}} MIKTAR_1)"}},
                            ],
                            # qInitialDataFetch büyük bir sayfayı (8 sütun x
                            # 10000 satır = 80000 hücre) tek seferde istediğinde
                            # sunucu qSize'ı doğru hesaplayıp qDataPages'i SESSİZCE
                            # boş döndürdü (muhtemelen anonim oturum için hücre
                            # bütçesi aşıldı) — canlı koşuda görüldü. Objeyi veri
                            # istemeden oluşturup, GetHyperCubeData ile küçük
                            # sayfalar hâlinde açıkça çekiyoruz.
                            "qInitialDataFetch": [],
                        },
                    }
                ],
                handle=doc_handle,
                req_id=90_002,
            )
            hc_handle = hc_resp["result"]["qReturn"]["qHandle"]

            layout_resp = _call(page, "GetLayout", [], handle=hc_handle, req_id=90_003)
            hc = layout_resp["result"]["qLayout"]["qHyperCube"]
            total = hc.get("qSize", {}).get("qcy", 0)
            width = hc.get("qSize", {}).get("qcx", 8)

            rows: list[list[dict]] = []
            page_height = 1000
            top = 0
            req_id = 90_010
            while top < total:
                height = min(page_height, total - top)
                data_resp = _call(
                    page,
                    "GetHyperCubeData",
                    ["/qHyperCubeDef", [{"qLeft": 0, "qTop": top, "qWidth": width, "qHeight": height}]],
                    handle=hc_handle,
                    req_id=req_id,
                )
                req_id += 1
                data_pages = data_resp["result"].get("qDataPages", [])
                matrix = data_pages[0].get("qMatrix", []) if data_pages else []
                if not matrix:
                    print(f"[uyarı] GetHyperCubeData qTop={top} boş sayfa döndürdü, duruluyor.", file=sys.stderr)
                    break
                rows.extend(matrix)
                top += len(matrix)

            if len(rows) < total:
                print(f"[uyarı] {total} satırın {len(rows)} tanesi çekilebildi.", file=sys.stderr)
        finally:
            browser.close()

    records: list[dict] = []
    for row in rows:
        gtip_code = row[0].get("qText")
        gtip_desc = row[1].get("qText")
        country_code = row[2].get("qText")
        country_name = row[3].get("qText")
        year_text = row[4].get("qText")
        month_text = row[5].get("qText")
        flow_text = row[6].get("qText")
        value_usd = _to_number(row[7])
        weight_kg = _to_number(row[8])

        if value_usd is None and weight_kg is None:
            continue

        try:
            year = int(float(year_text)) if year_text else None
        except ValueError:
            year = None

        try:
            month = int(float(month_text)) if month_text else None
        except ValueError:
            month = None
        if month is not None and not (1 <= month <= 12):
            month = None

        records.append(
            {
                "period_year": year,
                "period_month": month,
                "flow": "export" if flow_text == "İhracat" else "import",
                "gtip_code": gtip_code,
                "gtip_description": gtip_desc,
                "port_code": None,
                "port_name": None,
                "country_code": country_code,
                "country_name": country_name,
                "value_usd": value_usd,
                "weight_kg": weight_kg,
                "source": "tuik",
            }
        )

    return records
