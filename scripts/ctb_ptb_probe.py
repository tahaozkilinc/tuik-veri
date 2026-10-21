"""Geçici araştırma scripti: Çorum Ticaret Borsası (corumtb.org.tr/Bulten) ve
Polatlı Ticaret Borsası (bulten.polatliborsa.org.tr/gunluk-bulten.html)
sayfalarının yapısını araştırır — SPA mı düz HTML mi, tarih parametresi var
mı (1 yıllık geçmişe erişim), sütunlar ne (min/max/ortalama/miktar), ve
günün bülteni ne zaman yayınlanıyor (bugünün tarihiyle veri var mı)."""
import re

from playwright.sync_api import sync_playwright


def dump_tables_and_xhr(url, label, wait_selector=None):
    print(f"\n{'=' * 20} {label}: {url} {'=' * 20}")
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        xhr_hits = []

        def on_response(response):
            ctype = response.headers.get("content-type", "")
            if "json" in ctype or "xml" in ctype:
                try:
                    body = response.text()
                except Exception:
                    body = "<okunamadı>"
                xhr_hits.append((response.status, response.url, body[:600]))

        page.on("response", on_response)
        try:
            page.goto(url, wait_until="networkidle", timeout=45000)
        except Exception as exc:
            print(f"goto hatası: {exc}")
            browser.close()
            return
        page.wait_for_timeout(2000)

        print("--- Sayfa başlığı:", page.title())
        print("--- URL (yönlendirme sonrası):", page.url)

        tables = page.locator("table")
        tcount = tables.count()
        print(f"--- <table> sayısı: {tcount}")
        for i in range(min(tcount, 3)):
            html = tables.nth(i).evaluate("el => el.outerHTML")
            print(f"--- table[{i}] (ilk 2000 char):\n{html[:2000]}")

        # form/tarih input'ları
        inputs = page.locator("input")
        icount = inputs.count()
        print(f"--- <input> sayısı: {icount}")
        for i in range(min(icount, 15)):
            el = inputs.nth(i)
            name = el.get_attribute("name")
            itype = el.get_attribute("type")
            idattr = el.get_attribute("id")
            placeholder = el.get_attribute("placeholder")
            print(f"  input[{i}]: name={name} type={itype} id={idattr} placeholder={placeholder}")

        selects = page.locator("select")
        scount = selects.count()
        print(f"--- <select> sayısı: {scount}")
        for i in range(min(scount, 10)):
            el = selects.nth(i)
            name = el.get_attribute("name")
            idattr = el.get_attribute("id")
            print(f"  select[{i}]: name={name} id={idattr}")

        print(f"--- Yakalanan JSON/XML ağ isteği sayısı: {len(xhr_hits)}")
        for status, xurl, body in xhr_hits[:10]:
            print(f"  [{status}] {xurl}\n    {body}\n")

        body_text = page.inner_text("body")
        print("--- body metni (ilk 1500 char):\n", body_text[:1500])

        browser.close()


dump_tables_and_xhr("https://www.corumtb.org.tr/Bulten", "ÇTB ana sayfa")
dump_tables_and_xhr("https://bulten.polatliborsa.org.tr/gunluk-bulten.html", "PTB ana sayfa")

print("\n\n" + "=" * 20 + " Tarih parametresi denemeleri (ÇTB) " + "=" * 20)
for suffix in ["?tarih=2026-10-20", "?Tarih=2026-10-20", "?tarih=20.10.2026", "/2026-10-20"]:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        try:
            page.goto("https://www.corumtb.org.tr/Bulten" + suffix, wait_until="networkidle", timeout=30000)
            page.wait_for_timeout(1000)
            text = page.inner_text("body")
            print(f"{suffix}: URL sonrası={page.url}, metin uzunluğu={len(text)}, ilk 300 char:\n{text[:300]}\n")
        except Exception as exc:
            print(f"{suffix}: HATA — {exc}")
        browser.close()

print("\n\n" + "=" * 20 + " Tarih parametresi denemeleri (PTB) " + "=" * 20)
for suffix in ["?tarih=2026-10-20", "?Tarih=2026-10-20", "?tarih=20.10.2026"]:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        try:
            page.goto("https://bulten.polatliborsa.org.tr/gunluk-bulten.html" + suffix, wait_until="networkidle", timeout=30000)
            page.wait_for_timeout(1000)
            text = page.inner_text("body")
            print(f"{suffix}: URL sonrası={page.url}, metin uzunluğu={len(text)}, ilk 300 char:\n{text[:300]}\n")
        except Exception as exc:
            print(f"{suffix}: HATA — {exc}")
        browser.close()
