"""
TÜİK Biruni dış ticaret sorgulama uygulamasından (biruni.tuik.gov.tr/disticaretapp)
GTİP + liman + yıl kırılımında veri çeken Playwright otomasyonu.

Bu uygulama ZK framework üzerine kurulu, dinamik/AJAX tabanlı bir arayüz
(URL'ler stabil olsa da component id'leri her session'da değişebiliyor).
Bu yüzden ID selector yerine görünür Türkçe metin/label üzerinden gidiyoruz.

Bu dosya bu sandbox ortamından tuik.gov.tr'ye erişim engellendiği için
CANLI SİTEYE KARŞI DOĞRULANAMADI. İlk GitHub Actions çalıştırmasında
muhtemelen selector ayarı gerekecek — hata durumunda sayfa başlığı,
görünür menü metinleri ve gövde HTML'inin ilk N karakteri stdout'a
basılır ki Actions log'undan okuyup düzeltebilelim.
"""

from __future__ import annotations

import sys
from dataclasses import dataclass

from playwright.sync_api import Page, TimeoutError as PlaywrightTimeoutError, sync_playwright

MENU_URL = "https://biruni.tuik.gov.tr/disticaretapp/menu.zul"
NAV_TIMEOUT_MS = 30_000


@dataclass
class QueryTarget:
    year: int
    flow: str  # "export" | "import"
    gtip_code: str | None = None
    port_name: str | None = None


class BiruniScrapeError(RuntimeError):
    pass


def _dump_diagnostics(page: Page, label: str) -> None:
    print(f"::group::diagnostics [{label}]", file=sys.stderr)
    try:
        print(f"url: {page.url}", file=sys.stderr)
        print(f"title: {page.title()}", file=sys.stderr)
        body_text = page.inner_text("body")[:2000]
        print(f"body text (first 2000 chars):\n{body_text}", file=sys.stderr)
    except Exception as exc:  # noqa: BLE001 - best-effort diagnostics
        print(f"diagnostics failed: {exc}", file=sys.stderr)
    print("::endgroup::", file=sys.stderr)


def fetch_records(targets: list[QueryTarget], headless: bool = True) -> list[dict]:
    """Her QueryTarget için biruni'de sorgu çalıştırır, ham satırları döner.

    Dönen her dict: {gtip_code, port_name, year, flow, value_usd, weight_kg, ...}
    Gerçek alan eşlemesi ilk canlı çalıştırma sonrası selector kalibrasyonuna
    göre güncellenecek (bkz. modül docstring).
    """
    results: list[dict] = []

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=headless)
        page = browser.new_page()
        page.set_default_timeout(NAV_TIMEOUT_MS)

        try:
            page.goto(MENU_URL, wait_until="networkidle")
        except PlaywrightTimeoutError as exc:
            _dump_diagnostics(page, "menu-goto-timeout")
            browser.close()
            raise BiruniScrapeError(f"menu.zul yüklenemedi: {exc}") from exc

        for target in targets:
            try:
                record_rows = _run_single_query(page, target)
                results.extend(record_rows)
            except Exception as exc:  # noqa: BLE001
                _dump_diagnostics(page, f"query-failed year={target.year} flow={target.flow}")
                print(
                    f"[uyarı] sorgu atlandı (year={target.year}, flow={target.flow}, "
                    f"gtip={target.gtip_code}, port={target.port_name}): {exc}",
                    file=sys.stderr,
                )
                continue

        browser.close()

    return results


def _run_single_query(page: Page, target: QueryTarget) -> list[dict]:
    """Tek bir GTİP/liman/yıl/yön kombinasyonu için sorgu çalıştırır.

    NOT: Menü gezinme ve alan doldurma adımları biruni arayüzünün genel
    yapısına (Yıl / Fasıl-GTİP / Liman seçim kutuları + "Sorgula" butonu)
    dayanıyor; kesin metin etiketleri ilk çalıştırmadan sonra doğrulanmalı.
    """
    flow_label = "İhracat" if target.flow == "export" else "İthalat"

    page.get_by_text(flow_label, exact=False).first.click()

    if target.gtip_code:
        gtip_input = page.get_by_label("GTİP", exact=False)
        gtip_input.fill(target.gtip_code)

    if target.port_name:
        port_input = page.get_by_label("Liman", exact=False)
        port_input.fill(target.port_name)

    year_input = page.get_by_label("Yıl", exact=False)
    year_input.fill(str(target.year))

    page.get_by_role("button", name="Sorgula").click()
    page.wait_for_load_state("networkidle")

    table = page.locator("table").first
    rows = table.locator("tr").all()

    parsed: list[dict] = []
    for row in rows[1:]:  # ilk satır header varsayılıyor
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
