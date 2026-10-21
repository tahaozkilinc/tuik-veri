"""Geçici araştırma scripti #3: ÇTB'nin /Bulten/Aralik?baslangic=&bitis=
JSON API'si (tek güne daraltılınca günlük özet mi veriyor?) ve PTB'nin
BultenGunluk.ashx?tarih= uç noktası (ne döndürüyor: HTML mi JSON mu) plain
urllib ile (Playwright'sız) test ediliyor — 1 yıl önceki bir gün dahil."""
import json
import urllib.request

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; tuik-veri-research/1.0)"}


def fetch(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.status, resp.headers.get("content-type", ""), resp.read().decode("utf-8", errors="replace")


print("=" * 20, "ÇTB /Bulten/Aralik — tek güne daraltılmış sorgu", "=" * 20)
for baslangic, bitis, label in [
    ("2026-10-20", "2026-10-20", "tek gün (bugüne yakın)"),
    ("2025-10-21", "2025-10-21", "tek gün (1 yıl önce)"),
    ("2026-10-18", "2026-10-18", "tek gün (Pazar — işlem olmamalı)"),
]:
    url = f"https://www.corumtb.org.tr/Bulten/Aralik?baslangic={baslangic}&bitis={bitis}"
    try:
        status, ctype, body = fetch(url)
        print(f"\n--- {label} ({baslangic}) ---")
        print(f"status={status} content-type={ctype}")
        data = json.loads(body)
        urunler = data.get("data", {}).get("urunler", [])
        print(f"basarili={data.get('basarili')}, ürün sayısı={len(urunler)}")
        for u in urunler[:3]:
            print(" ", u)
    except Exception as exc:
        print(f"{label}: HATA — {exc}")

print("\n\n" + "=" * 20 + " PTB BultenGunluk.ashx — doğrudan urllib ile " + "=" * 20)
for tarih, label in [
    ("20.10.2026", "dün (bugüne yakın)"),
    ("21.10.2025", "1 yıl önce"),
    ("18.10.2026", "Pazar — işlem olmamalı"),
]:
    url = f"https://bulten.polatliborsa.org.tr/BultenGunluk.ashx?tarih={tarih}"
    try:
        status, ctype, body = fetch(url)
        print(f"\n--- {label} ({tarih}) ---")
        print(f"status={status} content-type={ctype} body uzunluğu={len(body)}")
        print("İlk 1500 char:\n", body[:1500])
    except Exception as exc:
        print(f"{label}: HATA — {exc}")
