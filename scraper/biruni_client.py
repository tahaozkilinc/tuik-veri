"""
TÜİK'in dış ticaret sorgulama uygulamasından (bi.tuik.gov.tr/extensions/tuik-mashup)
GTİP + yıl + yön kırılımında veri çeken Playwright otomasyonu.

Bu uygulama adım adım (wizard) ilerleyen dinamik bir arayüz:
  1) Kategori Seçimi (Toplam İhracat/İthalat | Ürün/Ürün Grubu-Ülke | Ülke ve
     Ülke Grubu | İllere Göre) -> "Sonraki Adım"
  2) Kategoriye Ait Ek Bilgiler (seçilen kategoriye göre değişen alanlar)
  3) Tarih Seçimi ve Rapor Detayı

Eski biruni.tuik.gov.tr/disticaretapp/menu.zul adresi otomatik olarak bu
yeni uygulamaya yönleniyor. Not: bu genel amaçlı sorgulama aracının kategori
listesinde "Liman"/"Gümrük İdaresi" kırılımı yok (sadece ürün, ülke, il) —
liman bazlı veri için farklı bir TÜİK kaynağı gerekebilir.

Alan etiketleri ilk çalıştırmalarda gözlemlenerek kalibre ediliyor; her
adımda `_dump_fields` ile sayfadaki tüm interaktif elemanların (id/name/
label) dökümü stderr'e basılır ki Actions log'undan okuyup selector'ları
güncelleyebilelim.
"""

from __future__ import annotations

import json
import sys
from dataclasses import dataclass

from playwright.sync_api import Page, TimeoutError as PlaywrightTimeoutError, sync_playwright

MASHUP_URL = "https://bi.tuik.gov.tr/extensions/tuik-mashup/index.html?report_type=2"
NAV_TIMEOUT_MS = 20_000
STEP_TIMEOUT_MS = 6_000

CATEGORY_PRODUCT_COUNTRY = "Ürün / Ürün Grubu - Ülke"

_FIELD_DUMP_JS = """
() => {
  const out = [];
  document.querySelectorAll('input, select, textarea, button, [role="radio"], [role="checkbox"], [role="button"]').forEach(el => {
    let label = '';
    if (el.id) {
      const lbl = document.querySelector(`label[for="${el.id}"]`);
      if (lbl) label = lbl.innerText;
    }
    if (!label) {
      const closest = el.closest('label');
      if (closest) label = closest.innerText;
    }
    if (!label) label = el.getAttribute('aria-label') || el.getAttribute('placeholder') || '';
    out.push({
      tag: el.tagName,
      type: el.type || el.getAttribute('role') || '',
      id: el.id || null,
      name: el.name || null,
      label: (label || '').trim().slice(0, 80),
      text: (el.innerText || el.value || '').trim().slice(0, 80),
    });
  });
  return out;
}
"""


@dataclass
class QueryTarget:
    year: int
    flow: str  # "export" | "import"
    gtip_code: str | None = None
    port_name: str | None = None


class BiruniScrapeError(RuntimeError):
    pass


def _dump_text(page: Page, label: str) -> None:
    print(f"::group::diagnostics-text [{label}]", file=sys.stderr)
    try:
        print(f"url: {page.url}", file=sys.stderr)
        print(f"title: {page.title()}", file=sys.stderr)
        print(page.inner_text("body")[:2000], file=sys.stderr)
    except Exception as exc:  # noqa: BLE001
        print(f"diagnostics failed: {exc}", file=sys.stderr)
    print("::endgroup::", file=sys.stderr)


def _dump_fields(page: Page, label: str) -> None:
    print(f"::group::diagnostics-fields [{label}]", file=sys.stderr)
    try:
        fields = page.evaluate(_FIELD_DUMP_JS)
        print(json.dumps(fields, ensure_ascii=False, indent=2), file=sys.stderr)
    except Exception as exc:  # noqa: BLE001
        print(f"field dump failed: {exc}", file=sys.stderr)
    print("::endgroup::", file=sys.stderr)


def fetch_records(targets: list[QueryTarget], headless: bool = True) -> list[dict]:
    """Her QueryTarget için mashup uygulamasında sorgu çalıştırır, ham satırları döner."""
    results: list[dict] = []

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=headless)

        for i, target in enumerate(targets):
            page = browser.new_page()
            page.set_default_timeout(STEP_TIMEOUT_MS)
            discover = i == 0  # yalnızca ilk hedefte detaylı alan dökümü yap

            network_log: list[str] = []
            if discover:
                # goto'dan ÖNCE bağla ki ilk sayfa yüklemesindeki veri
                # çekme istekleri de (varsa) yakalansın — önceki denemede
                # _run_single_query içinde bağladığımız için goto sırasındaki
                # istekleri kaçırmış, "hiç XHR yakalanmadı" görmüştük.
                def _skip(url: str) -> bool:
                    return any(
                        s in url
                        for s in (".png", ".jpg", ".svg", ".css", ".woff", ".map", "sense-client")
                    )

                def _on_request(req):  # noqa: ANN001
                    try:
                        if not _skip(req.url):
                            network_log.append(f"→ {req.method} {req.url}")
                    except Exception:  # noqa: BLE001
                        pass

                def _on_response(res):  # noqa: ANN001
                    try:
                        if not _skip(res.url):
                            network_log.append(f"← {res.status} {res.url}")
                    except Exception:  # noqa: BLE001
                        pass

                def _on_request_failed(req):  # noqa: ANN001
                    try:
                        network_log.append(f"✗ FAILED {req.method} {req.url} :: {req.failure}")
                    except Exception:  # noqa: BLE001
                        pass

                page.on("request", _on_request)
                page.on("response", _on_response)
                page.on("requestfailed", _on_request_failed)

                # Sadece REST/HTTP trafiğinde hiçbir ilgili istek yoktu —
                # GTİP kod listesi büyük ihtimalle bir Qlik Sense mashup'ı
                # (URL'de "sense-client" görüldü) ve gerçek veri WebSocket
                # üzerinden Qlik Engine JSON-RPC protokolüyle geliyor. Bunu
                # ayrıca dinleyip bağlanıp bağlanmadığını, kapanıp
                # kapanmadığını ve ilk birkaç frame'i dökelim.
                def _on_websocket(ws):  # noqa: ANN001
                    network_log.append(f"WS OPEN: {ws.url}")
                    counters = {"sent": 0, "recv": 0}

                    def _on_close(_ws=None):  # noqa: ANN001
                        network_log.append(f"WS CLOSED: {ws.url}")

                    def _on_socketerror(err):  # noqa: ANN001
                        network_log.append(f"WS ERROR: {ws.url} :: {err}")

                    keywords = ("Cube", "List", "Field", "hs2", "Gtip", "GTIP", "Ulke", "lke", "error", "Symbol")

                    def _on_framesent(payload):  # noqa: ANN001
                        counters["sent"] += 1
                        text = str(payload if isinstance(payload, str) else "<binary>")
                        if counters["sent"] <= 10 or any(k in text for k in keywords):
                            network_log.append(f"WS SEND #{counters['sent']}: {text[:350]}")

                    def _on_framereceived(payload):  # noqa: ANN001
                        counters["recv"] += 1
                        text = str(payload if isinstance(payload, str) else "<binary>")
                        if counters["recv"] <= 10 or any(k in text for k in keywords):
                            network_log.append(f"WS RECV #{counters['recv']}: {text[:450]}")

                    ws.on("close", _on_close)
                    ws.on("socketerror", _on_socketerror)
                    ws.on("framesent", _on_framesent)
                    ws.on("framereceived", _on_framereceived)

                page.on("websocket", _on_websocket)

            try:
                page.goto(MASHUP_URL, wait_until="networkidle", timeout=NAV_TIMEOUT_MS)
            except PlaywrightTimeoutError as exc:
                _dump_text(page, "goto-timeout")
                page.close()
                if i == 0:
                    browser.close()
                    raise BiruniScrapeError(f"mashup sayfası yüklenemedi: {exc}") from exc
                continue

            if discover:
                _dump_fields(page, "step1-category")

            try:
                record_rows = _run_single_query(page, target, discover, network_log)
                results.extend(record_rows)
            except Exception as exc:  # noqa: BLE001
                print(
                    f"[uyarı] sorgu atlandı (year={target.year}, flow={target.flow}, "
                    f"gtip={target.gtip_code}, port={target.port_name}): {exc}",
                    file=sys.stderr,
                )
            finally:
                page.close()

        browser.close()

    return results


def _run_single_query(
    page: Page, target: QueryTarget, discover: bool, network_log: list[str] | None = None
) -> list[dict]:
    # Adım 1: kategori seçimi
    page.get_by_text(CATEGORY_PRODUCT_COUNTRY, exact=False).first.click()
    page.get_by_role("button", name="Sonraki Adım").click()
    page.wait_for_load_state("networkidle")

    if discover:
        _dump_fields(page, "step2-after-category")
        _dump_text(page, "step2-after-category")

    # Adım 2: "Gösterim Şekli", "Sınıflandırma" ve (Harmonize Sistem seçilince
    # açılan) HS detay seviyesi seçimi zorunlu. GTİP = HS12 detay seviyesi.
    page.get_by_text("Ürün/Ülke", exact=True).first.click()
    page.get_by_text("Harmonize Sistem", exact=True).first.click()
    page.get_by_text("HS12 (GTIP)", exact=True).first.click()

    if discover:
        _dump_fields(page, "step2-filled")

    page.get_by_role("button", name="Sonraki Adım").first.click()
    page.wait_for_load_state("networkidle")

    # Yıl / GTİP / Ülke widget'ları asenkron yükleniyor (skeleton placeholder
    # ile başlıyor); gerçek içerik gelene kadar bekle. Genel ".skeleton-wrapper"
    # selector'ı "detached" beklemesi, sayfada birden fazla skeleton-wrapper
    # varken (Yıl + GTİP paneli + Ülke paneli) yanlış elemanın kaybolmasıyla
    # erken dönebiliyordu — Yıl widget'ı hâlâ yüklenirken _select_year
    # çalışıp "Seçiniz" placeholder'ında kalıyordu. Bunun yerine özellikle
    # Yıl wrapper'ının kendi skeleton'unun kaybolmasını bekliyoruz.
    year_wrapper = page.locator(".date-wrapper", has_text="Yıl").first
    try:
        year_wrapper.locator(".skeleton-wrapper").wait_for(state="detached", timeout=15_000)
    except PlaywrightTimeoutError:
        pass

    if discover:
        _dump_date_wrappers(page, "step3-date-widgets")

    # Adım 3: tarih seçimi — Yıl özel bir dropdown (native <select> değil),
    # "date-wrapper" içindeki tıklanabilir elemanı aç ve yılı seç.
    _select_year(page, target.year)

    # GTİP Seçimi panelindeki "hs2-select" alanı (chip-item-wrapper two-col)
    # arka planda Qlik Engine'den (WebSocket/JSON-RPC) veri çekiyor ve bu
    # gerçekten uzun sürebiliyor (20sn yetmiyordu, 35sn'de çözüldüğü
    # doğrulandı) — arama kutusu bu veri gelmeden hiçbir sonuç döndürmüyor.
    # Bu yüzden discover'a bakmaksızın HER hedefte bekliyoruz.
    if target.gtip_code:
        hs2_wrapper = page.locator(".chip-item-wrapper.hs2-select").first
        resolved = True
        try:
            hs2_wrapper.locator(".skeleton-wrapper").first.wait_for(state="detached", timeout=35_000)
        except PlaywrightTimeoutError:
            resolved = False
        if discover:
            print(f"::notice::hs2-select skeleton çözüldü mü: {resolved}", file=sys.stderr)

    # GTİP Seçimi arama kutusuna kodu yaz (rapor GTİP filtresi olmadan
    # oluşmuyor — "Tümü" GTİP panelinde yok, sadece arama sonuçları var).
    if target.gtip_code:
        gtip_search = page.get_by_placeholder("Kod ya da Tanım Ara (En az 3 Karakter)")
        digits_only = "".join(ch for ch in target.gtip_code if ch.isdigit())

        if discover:
            # press_sequentially ile klavye simülasyonu güvenilmez çıktı
            # (ilk karakteri bazen yutuyor, bazen yutmuyor — deterministik
            # değil). Native input value setter + 'input' event dispatch ile
            # React'in kontrollü input'unu bypass ediyoruz. Önce kısa sayısal
            # önekler, sonra ürün adıyla ("Mısır") arayıp indeksin gerçekte
            # neye göre eşleştiğini (kod mu, açıklama mı) dökelim. Sabit
            # timeout yerine dropdown içeriği değişene kadar bekliyoruz.
            for probe in (digits_only[:4], digits_only[:6], digits_only[:8], "Mısır"):
                _set_react_input_value(page, gtip_search, probe)
                _wait_dropdown_settled(page, "GTİP Seçimi")
                _dump_dropdown_content(page, "GTİP Seçimi", f"gtip-search-probe-{probe}")

        _set_react_input_value(page, gtip_search, digits_only)
        _wait_dropdown_settled(page, "GTİP Seçimi")

        # Arama sonuçlarındaki checkbox'lar "readonly" ama React click
        # handler'ı label üzerinde — label'a tıklayarak seçiyoruz. Tam
        # 12 haneli kodla arandığında tek bir tam eşleşme dönüyor.
        gtip_wrapper = page.locator(".chip-wrapper:has(h4:text-is('GTİP Seçimi'))").first
        result_labels = gtip_wrapper.locator("label.search.form-check-label")
        for j in range(result_labels.count()):
            try:
                result_labels.nth(j).click(timeout=STEP_TIMEOUT_MS)
            except PlaywrightTimeoutError:
                continue

    if discover:
        print("::group::diagnostics-result [after-gtip-search]", file=sys.stderr)
        tumu_count = page.locator('input[type="checkbox"][id$="-tumu"]').count()
        print(f"'-tumu' checkbox sayısı: {tumu_count}", file=sys.stderr)
        if target.gtip_code:
            # Sonuç seçildikten sonra arama kutusu DOM'dan kalkıyor (panel
            # "seçili chip" görünümüne geçiyor) — bu artık beklenen bir
            # durum, okumaya çalışmak zaman aşımına düşüp SORGUYU BAŞTAN
            # İPTAL ediyordu (yakalanmayan hata _run_single_query'den
            # fırlıyor, fetch_records tüm sorguyu atlıyordu). Best-effort.
            try:
                actual_value = gtip_search.input_value(timeout=1000)
                print(f"arama kutusu değeri: {actual_value!r} (beklenen: {digits_only!r})", file=sys.stderr)
            except PlaywrightTimeoutError:
                print("arama kutusu artık DOM'da yok (seçim sonrası beklenen davranış)", file=sys.stderr)
        print("::endgroup::", file=sys.stderr)
        _dump_chip_wrapper(page, "GTİP Seçimi", "gtip-chip-wrapper-after-search")

        page.wait_for_timeout(5000)
        print("::group::diagnostics-network [after-gtip-search]", file=sys.stderr)
        if network_log:
            print(f"toplam olay sayısı: {len(network_log)}", file=sys.stderr)
            for line in network_log[-150:]:
                print(line, file=sys.stderr)
        else:
            print("(hiç istek/yanıt yakalanmadı)", file=sys.stderr)
        print("::endgroup::", file=sys.stderr)

    # Hem GTİP arama sonuçlarındaki hem de Ülke panelindeki "Tümü" checkbox'ları
    # id'si "-tumu" ile bitiyor — hepsini işaretle (text tıklamak yerine
    # doğrudan checkbox'ı .check() ile, daha güvenilir).
    for tumu_cb in page.locator('input[type="checkbox"][id$="-tumu"]').all():
        try:
            tumu_cb.check(timeout=STEP_TIMEOUT_MS)
        except PlaywrightTimeoutError:
            continue

    flow_checkbox = page.locator(f'input#{"export" if target.flow == "export" else "import"}')
    try:
        if flow_checkbox.count() > 0 and not flow_checkbox.first.is_checked():
            flow_checkbox.first.check(timeout=STEP_TIMEOUT_MS)
    except PlaywrightTimeoutError:
        pass

    if discover:
        _dump_date_wrappers(page, "step3-after-tumu")

    report_button = page.get_by_role("button", name="Rapor", exact=False)
    if report_button.count() == 0:
        report_button = page.get_by_role("button", name="Oluştur", exact=False)
    report_button.first.click()

    # wait_for_load_state("networkidle") sadece HTTP trafiğini izliyor;
    # rapor tablosu Qlik Engine'e WebSocket üzerinden gidip gelen bir
    # hypercube sorgusuyla dolduruluyor (hs2-select panelinde de aynı
    # şekilde 20-35sn sürebildiğini gördük) — "networkidle" neredeyse
    # anında dönüyor ve tablo daha DOM'a gelmeden kontrol ediyorduk.
    # Doğrudan <table> belirene kadar bekle.
    try:
        page.wait_for_selector("table", timeout=40_000)
    except PlaywrightTimeoutError:
        pass

    table = page.locator("table").first

    if discover:
        print("::group::diagnostics-result [table-check]", file=sys.stderr)
        print(f"table bulundu mu: {table.count() > 0}", file=sys.stderr)
        if table.count() > 0:
            all_rows = table.locator("tr").all()
            print(f"satır sayısı: {len(all_rows)}", file=sys.stderr)
            if all_rows:
                print(f"ilk satır: {all_rows[0].inner_text()[:300]}", file=sys.stderr)
            if len(all_rows) > 1:
                print(f"ikinci satır: {all_rows[1].inner_text()[:300]}", file=sys.stderr)
        else:
            print(page.inner_text("body")[:1500], file=sys.stderr)
        print("::endgroup::", file=sys.stderr)

    if table.count() == 0:
        return []

    rows = table.locator("tr").all()
    parsed: list[dict] = []
    for row in rows[1:]:
        cells = [c.inner_text().strip() for c in row.locator("td").all()]
        if not cells:
            continue
        parsed.append(
            {
                "year": target.year,
                "flow": target.flow,
                "gtip_code": target.gtip_code,
                "port_name": target.port_name,
                "raw_cells": cells,
            }
        )
    return parsed


def _dump_date_wrappers(page: Page, label: str) -> None:
    print(f"::group::diagnostics-html [{label}]", file=sys.stderr)
    try:
        html_list = page.evaluate(
            "() => Array.from(document.querySelectorAll('.date-wrapper')).map(w => w.outerHTML)"
        )
        for html in html_list:
            print((html or "")[:2500], file=sys.stderr)
            print("---", file=sys.stderr)
    except Exception as exc:  # noqa: BLE001
        print(f"date-wrapper dump failed: {exc}", file=sys.stderr)
    print("::endgroup::", file=sys.stderr)


def _dump_chip_wrapper(page: Page, heading_text: str, label: str) -> None:
    print(f"::group::diagnostics-html [{label}]", file=sys.stderr)
    try:
        html = page.evaluate(
            """(headingText) => {
                const h = Array.from(document.querySelectorAll('h4'))
                    .find(el => el.textContent.trim() === headingText);
                if (!h) return null;
                const wrapper = h.closest('.chip-wrapper');
                return (wrapper || h.parentElement).outerHTML;
            }""",
            heading_text,
        )
        print((html or "(bulunamadı)")[:3500], file=sys.stderr)
    except Exception as exc:  # noqa: BLE001
        print(f"chip-wrapper dump failed: {exc}", file=sys.stderr)
    print("::endgroup::", file=sys.stderr)


def _set_react_input_value(page: Page, locator, value: str) -> None:
    """React'in kontrollü input'una native value setter + 'input' event ile
    değer yazar. Klavye simülasyonu (press_sequentially) ilk karakteri
    tutarsız biçimde kaybediyordu; bu yöntem DOM'a doğrudan native setter
    ile yazıp React'in dinlediği sentetik event'i tetikliyor."""
    try:
        locator.click(timeout=STEP_TIMEOUT_MS)
    except PlaywrightTimeoutError:
        pass
    element = locator.element_handle()
    if element is None:
        return
    page.evaluate(
        """([el, value]) => {
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(el, value);
            el.dispatchEvent(new Event('input', { bubbles: true }));
        }""",
        [element, value],
    )


def _wait_dropdown_settled(page: Page, heading_text: str, timeout_ms: int = 6000) -> None:
    """Arama kutusu değeri değiştikten sonra dropdown-content'in boş
    (yükleniyor) durumdan çıkıp gerçek içerik (sonuç listesi ya da
    "bulunamadı" mesajı) gösterene kadar bekler — sabit sleep yerine."""
    try:
        page.wait_for_function(
            """(headingText) => {
                const h = Array.from(document.querySelectorAll('h4'))
                    .find(el => el.textContent.trim() === headingText);
                if (!h) return false;
                const wrapper = h.closest('.chip-wrapper');
                if (!wrapper) return false;
                const dc = wrapper.querySelector('.dropdown-content');
                return !!dc && dc.textContent.trim().length > 0;
            }""",
            arg=heading_text,
            timeout=timeout_ms,
        )
    except PlaywrightTimeoutError:
        pass


def _dump_dropdown_content(page: Page, heading_text: str, label: str) -> None:
    print(f"::group::diagnostics-html [{label}]", file=sys.stderr)
    try:
        html = page.evaluate(
            """(headingText) => {
                const h = Array.from(document.querySelectorAll('h4'))
                    .find(el => el.textContent.trim() === headingText);
                if (!h) return null;
                const wrapper = h.closest('.chip-wrapper');
                if (!wrapper) return null;
                const dc = wrapper.querySelector('.dropdown-content');
                return dc ? dc.outerHTML : '(dropdown-content bulunamadı)';
            }""",
            heading_text,
        )
        print((html or "(bulunamadı)")[:4000], file=sys.stderr)
    except Exception as exc:  # noqa: BLE001
        print(f"dropdown-content dump failed: {exc}", file=sys.stderr)
    print("::endgroup::", file=sys.stderr)


def _select_year(page: Page, year: int) -> None:
    """Yıl özel bir dropdown (native <select> değil) — wrapper'a tıklayıp
    açılan listeden yılı seçmeyi dener. Yapı kesinleşene kadar best-effort."""
    try:
        wrapper = page.locator(".date-wrapper", has_text="Yıl").first
        wrapper.click(timeout=STEP_TIMEOUT_MS)
        page.get_by_text(str(year), exact=True).first.click(timeout=STEP_TIMEOUT_MS)
    except PlaywrightTimeoutError:
        pass
