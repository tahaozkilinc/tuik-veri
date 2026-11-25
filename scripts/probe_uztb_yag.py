import json
import re
import urllib.request

BASE = "https://www.uzunkoprutb.org.tr"
H = {"User-Agent": "Mozilla/5.0 (compatible; tuik-veri-research/1.0)"}


def get(path):
    req = urllib.request.Request(BASE + path, headers=H)
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", errors="replace")


print("=== gunluk_bulten_detay.asp ===")
raw = get("/json/gunluk_bulten_detay.asp?mkod=99992")
data = json.loads(raw)
print("top-level keys:", list(data.keys()) if isinstance(data, dict) else type(data))
for k, v in (data.items() if isinstance(data, dict) else []):
    if isinstance(v, list):
        print(f"  {k}: {len(v)} satir; ilk satir anahtarlari: {list(v[0].keys()) if v else None}")
        for row in v[:3]:
            print("   ", row)
        if v:
            print("    son satir:", v[-1])
    else:
        print(f"  {k}: {str(v)[:200]}")

print("\n=== salon-satis.php ===")
rows = json.loads(get("/api/salon-satis.php?mkod=99992"))
print("satir sayisi:", len(rows) if isinstance(rows, list) else type(rows))
if isinstance(rows, list) and rows:
    print("anahtarlar:", list(rows[0].keys()))
    for row in rows[:2]:
        print("  ", row)

print("\n=== sayfadaki JS'te gecen uc noktalar ===")
for page in ["/sayfa.asp?tur=ssdetay&urun=99992", "/sayfa.asp?tur=gunlukbulten", "/"]:
    try:
        html = get(page)
    except Exception as e:  # noqa: BLE001
        print(page, "HATA", e)
        continue
    urls = sorted(set(re.findall(r"""["'(]([^"'()\s]*(?:\.asp|\.php|/json/|/api/)[^"'()\s]*)""", html)))
    print(page, "->", len(urls), "uc nokta")
    for u in urls[:60]:
        print("   ", u)

print("\n=== tarih parametresi denemeleri ===")
for q in [
    "&tarih=01.09.2026", "&tarih=2026-09-01", "&bas=01.09.2026&bit=30.09.2026",
    "&baslangic=01.09.2026&bitis=30.09.2026", "&yil=2025", "&ay=9&yil=2026", "&gun=200",
]:
    try:
        d = json.loads(get("/json/gunluk_bulten_detay.asp?mkod=99992" + q))
        arr = d.get("json_urungrafik", []) if isinstance(d, dict) else []
        print(f"{q}: {len(arr)} satir, ilk={arr[0].get('TARIH') if arr else None}, son={arr[-1].get('TARIH') if arr else None}")
    except Exception as e:  # noqa: BLE001
        print(q, "HATA", e)
