"""Geçici araştırma scripti #2: GTB salon satış fiyatları tablosunun tam
HTML yapısı (class/id, satır/kolon şekli), "İstatistik" linkinin ne
yaptığı (modal mı, yeni sayfa mı, ek veri mi getiriyor), ve ?tarih=
parametresinin ne kadar geriye gidebildiği (1 yıl önce / hafta sonu)."""
import re

from playwright.sync_api import sync_playwright

BASE = "https://www.gtb.org.tr/salon-satis-fiyatlari"

print("=== 1) Tablo HTML yapısı (bugünün tarihiyle) ===")
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.goto(f"{BASE}?tarih=2026-10-21", wait_until="networkidle", timeout=45000)
    page.wait_for_timeout(1500)

    # tabloyu bul
    table_html = page.evaluate("""
      () => {
        const tables = document.querySelectorAll('table');
        for (const t of tables) {
          if (t.innerText.includes('Ürün Adı')) return t.outerHTML;
        }
        return null;
      }
    """)
    if table_html:
        print("Tablo HTML (ilk 3000 karakter):\n", table_html[:3000])
    else:
        print("Tablo bulunamadı doğrudan <table> ile — DOM yapısını kontrol et.")
        # alternatif: ürün satırlarını içeren en yakın container
        container_html = page.evaluate("""
          () => {
            const all = document.querySelectorAll('*');
            for (const el of all) {
              if (el.children.length > 5 && el.innerText.includes('Ürün Adı') && el.innerText.includes('MISIR')) {
                return el.outerHTML.slice(0, 4000);
              }
            }
            return null;
          }
        """)
        print("Alternatif container:\n", container_html)

    print("\n=== 2) 'İstatistik' linkine tıklama ===")
    captured = []
    def on_response(response):
        ctype = response.headers.get("content-type", "")
        if "json" in ctype:
            try:
                body = response.text()
            except Exception:
                body = "<okunamadı>"
            captured.append((response.status, response.url, body[:800]))
    page.on("response", on_response)

    istat_links = page.locator("text=İstatistik")
    count = istat_links.count()
    print(f"'İstatistik' link/buton sayısı: {count}")
    if count > 0:
        href = istat_links.first.get_attribute("href")
        onclick = istat_links.first.get_attribute("onclick")
        tag = istat_links.first.evaluate("el => el.tagName")
        print(f"İlk İstatistik elemanı: tag={tag}, href={href}, onclick={onclick}")
        try:
            istat_links.first.click(timeout=5000)
            page.wait_for_timeout(2000)
            modal_text = page.inner_text("body")
            print("Tıklama sonrası body metninin değişen kısmı (ilk 1200 char, sondan):\n", modal_text[-1200:])
        except Exception as exc:
            print("Tıklama hatası:", exc)
    print(f"Yakalanan JSON yanıt sayısı (tıklama sonrası): {len(captured)}")
    for status, url, body in captured:
        print(f"[{status}] {url}\n  {body}\n")

    browser.close()

print("\n=== 3) Tarih parametresi ne kadar geriye gidiyor? ===")
for tarih in ["2026-10-20", "2026-10-18", "2025-10-21", "2024-10-21", "2025-01-01"]:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        try:
            page.goto(f"{BASE}?tarih={tarih}", wait_until="networkidle", timeout=30000)
            page.wait_for_timeout(1000)
            text = page.inner_text("body")
            has_misir = "MISIR" in text.upper()
            # ürün satırı sayısını kabaca tahmin et (satır başına ürün adı + iki sayı deseni)
            rows = re.findall(r"^[A-ZÇĞİÖŞÜ][^\t\n]{2,60}\t[\d.,]+\t[\d.,]+", text, re.MULTILINE)
            print(f"{tarih}: MISIR var mı={has_misir}, regex ile bulunan satır sayısı={len(rows)}")
        except Exception as exc:
            print(f"{tarih}: HATA — {exc}")
        browser.close()
