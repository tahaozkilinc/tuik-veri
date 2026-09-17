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
                record_rows = _run_single_query(page, target, discover)
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


def _run_single_query(page: Page, target: QueryTarget, discover: bool) -> list[dict]:
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
    # ile başlıyor); gerçek içerik gelene kadar bekle.
    try:
        page.wait_for_selector(".skeleton-wrapper", state="detached", timeout=10_000)
    except PlaywrightTimeoutError:
        pass

    if discover:
        _dump_date_wrappers(page, "step3-date-widgets")

    # Adım 3: tarih seçimi — Yıl özel bir dropdown (native <select> değil),
    # "date-wrapper" içindeki tıklanabilir elemanı aç ve yılı seç.
    _select_year(page, target.year)

    # GTİP Seçimi arama kutusuna kodu yaz (rapor GTİP filtresi olmadan
    # oluşmuyor — "Tümü" GTİP panelinde yok, sadece arama sonuçları var).
    if target.gtip_code:
        gtip_search = page.get_by_placeholder("Kod ya da Tanım Ara (En az 3 Karakter)")
        try:
            # .fill() bıraktığı değeri React'in kontrollü input'u geri
            # sıfırlıyor; press_sequentially de (click ile veya click'siz)
            # ilk karakteri kaybediyor — focus kurulur kurulmaz ilk tuş
            # basımı bir re-render'a denk geliyor gibi görünüyor. Click
            # sonrası kısa bir bekleme ekleyip focus'un oturmasını sağlıyoruz.
            gtip_search.click(timeout=STEP_TIMEOUT_MS)
            page.wait_for_timeout(400)
            gtip_search.press_sequentially(target.gtip_code, delay=150, timeout=STEP_TIMEOUT_MS)
            page.wait_for_timeout(2000)
        except PlaywrightTimeoutError:
            pass

    if discover:
        print("::group::diagnostics-result [after-gtip-search]", file=sys.stderr)
        tumu_count = page.locator('input[type="checkbox"][id$="-tumu"]').count()
        print(f"'-tumu' checkbox sayısı: {tumu_count}", file=sys.stderr)
        print("::endgroup::", file=sys.stderr)
        _dump_chip_wrapper(page, "GTİP Seçimi", "gtip-chip-wrapper-after-search")

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
    page.wait_for_load_state("networkidle")

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


def _select_year(page: Page, year: int) -> None:
    """Yıl özel bir dropdown (native <select> değil) — wrapper'a tıklayıp
    açılan listeden yılı seçmeyi dener. Yapı kesinleşene kadar best-effort."""
    try:
        wrapper = page.locator(".date-wrapper", has_text="Yıl").first
        wrapper.click(timeout=STEP_TIMEOUT_MS)
        page.get_by_text(str(year), exact=True).first.click(timeout=STEP_TIMEOUT_MS)
    except PlaywrightTimeoutError:
        pass
