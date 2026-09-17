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

    # Adım 2: GTİP ve yön (ihracat/ithalat) bilgisi — alan adları kalibrasyon
    # bekliyor, bu yüzden birden fazla olası locator deneniyor.
    if target.gtip_code:
        _fill_best_effort(page, ["GTİP", "Ürün", "Fasıl"], target.gtip_code)

    flow_label = "İhracat" if target.flow == "export" else "İthalat"
    try:
        page.get_by_text(flow_label, exact=False).first.click(timeout=STEP_TIMEOUT_MS)
    except PlaywrightTimeoutError:
        pass

    page.get_by_role("button", name="Sonraki Adım").click()
    page.wait_for_load_state("networkidle")

    if discover:
        _dump_fields(page, "step3-date")
        _dump_text(page, "step3-date")

    # Adım 3: tarih seçimi
    _fill_best_effort(page, ["Yıl", "Başlangıç", "Yıldan"], str(target.year))

    report_button = page.get_by_role("button", name="Rapor", exact=False)
    if report_button.count() == 0:
        report_button = page.get_by_role("button", name="Oluştur", exact=False)
    report_button.first.click()
    page.wait_for_load_state("networkidle")

    if discover:
        _dump_fields(page, "step4-result")
        _dump_text(page, "step4-result")

    table = page.locator("table").first
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


def _fill_best_effort(page: Page, label_candidates: list[str], value: str) -> bool:
    for candidate in label_candidates:
        try:
            field = page.get_by_label(candidate, exact=False)
            if field.count() > 0:
                field.first.fill(value, timeout=STEP_TIMEOUT_MS)
                return True
        except PlaywrightTimeoutError:
            continue
        try:
            field = page.get_by_placeholder(candidate, exact=False)
            if field.count() > 0:
                field.first.fill(value, timeout=STEP_TIMEOUT_MS)
                return True
        except PlaywrightTimeoutError:
            continue
    return False
