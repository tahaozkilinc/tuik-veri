"""Geçici araştırma scripti: GTB (Gaziantep Ticaret Borsası) salon satış
fiyatları sayfasının (gtb.org.tr/salon-satis-fiyatlari) gerçek veri kaynağını
bulmak için — sayfa büyük olasılıkla bir SPA, HTML veri taşımıyor olabilir.
Playwright ile sayfayı açıp tüm XHR/fetch isteklerini yakalıyor, ayrıca
KTB'nin kullandığı Alpha.WebPanel API deseninin burada da geçerli olup
olmadığını doğrudan deniyor (birçok Türk ticaret borsası sitesi aynı
hazır yazılımı kullanıyor olabilir)."""
import json
import urllib.request

from playwright.sync_api import sync_playwright

TARGET = "https://www.gtb.org.tr/salon-satis-fiyatlari?tarih=2026-10-21"

print("=== 1) Doğrudan Alpha.WebPanel deseni denemesi ===")
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; tuik-veri-research/1.0)", "Accept": "application/json"}
candidates = [
    "https://www.gtb.org.tr/api/v1/Alpha.WebPanel/OnlineKullaniciBulten/GetGunlukBulten/2026-10-21",
    "https://www.gtb.org.tr/api/v1/Alpha.WebPanel/OnlineKullaniciBulten/GetSalonSatisFiyatlari/2026-10-21",
]
for url in candidates:
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = resp.read().decode("utf-8", errors="replace")
        print(f"[{url}] -> {resp.status}, {len(body)} byte, ilk 300: {body[:300]}")
    except Exception as exc:
        print(f"[{url}] -> HATA: {exc}")

print("\n=== 2) Playwright ile gerçek sayfa + ağ istekleri ===")
captured = []

def on_response(response):
    url = response.url
    ctype = response.headers.get("content-type", "")
    if "json" in ctype or "api" in url.lower():
        try:
            body = response.text()
        except Exception:
            body = "<okunamadı>"
        captured.append((response.status, url, ctype, body[:500]))

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.on("response", on_response)
    try:
        page.goto(TARGET, wait_until="networkidle", timeout=45000)
    except Exception as exc:
        print("goto hata/timeout (devam ediliyor):", exc)
    page.wait_for_timeout(3000)

    print("Sayfa başlığı:", page.title())
    print("İçerik uzunluğu (HTML):", len(page.content()))

    # Sayfanın kendisi tablo/veri içeriyor mu (server-rendered olabilir)
    body_text = page.inner_text("body")
    print("\nSayfa görünür metninin ilk 1500 karakteri:\n", body_text[:1500])

    browser.close()

print(f"\n=== Yakalanan {len(captured)} JSON/API yanıtı ===")
for status, url, ctype, body in captured:
    print(f"\n[{status}] {url}\n  content-type: {ctype}\n  body[:500]: {body}")
