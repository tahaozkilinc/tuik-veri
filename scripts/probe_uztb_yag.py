import json
import re
import urllib.request

BASE = "https://www.uzunkoprutb.org.tr"
H = {"User-Agent": "Mozilla/5.0 (compatible; tuik-veri-research/1.0)"}
SUPA = "https://kajilskrmavwqdaipixu.supabase.co"
KEY = "sb_publishable_6UslA4U4eYBSQl0RGkAe8g_7qPFuK1M"


def get(path):
    req = urllib.request.Request(BASE + path, headers=H)
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", errors="replace")


def tr_num(s):
    return float(str(s).replace(".", "").replace(",", ".")) if isinstance(s, str) else s


print("=== bugunun Deger'i vs salon-satis'ten hesap ===")
bulten = json.loads(get("/json/gunluk_bulten_detay.asp?mkod=99992"))["json_urungrafik"]
print("bulten son satir:", bulten[-1])
rows = json.loads(get("/api/salon-satis.php?mkod=99992"))
yag = [(r["Index1_YagOrani"], r["KILO"]) for r in rows if r.get("Index1_YagOrani")]
if yag:
    simple = sum(y for y, _ in yag) / len(yag)
    weighted = sum(y * k for y, k in yag) / sum(k for _, k in yag)
    print(f"salon-satis: {len(yag)} satir yag>0 / toplam {len(rows)}; basit ort={simple:.3f}, kg-agirlikli={weighted:.3f}")

print("\n=== json/gunluk_bulten.asp ===")
for q in ["", "?tarih=25.11.2026", "?tarih=01.10.2025", "?tarih=15.10.2024", "?tarih=02.09.2026"]:
    try:
        txt = get("/json/gunluk_bulten.asp" + q)
        d = json.loads(txt)
        if isinstance(d, dict):
            print(q or "(parametresiz)", "keys:", list(d.keys()))
            for k, v in d.items():
                if isinstance(v, list):
                    ay = [x for x in v if "AY" in str(x.get("MALADI", "")).upper()][:2]
                    print(f"   {k}: {len(v)} satir, ilk anahtarlar={list(v[0].keys()) if v else None}")
                    print("    ilk:", v[0] if v else None)
                    print("    aycicek:", ay)
                else:
                    print(f"   {k}: {str(v)[:120]}")
        else:
            print(q, type(d), str(d)[:300])
    except Exception as e:  # noqa: BLE001
        print(q, "HATA", e)

print("\n=== sayfa.asp?tur=gunlukbulten&tarih=... (HTML) ===")
for t in ["25.11.2026", "01.10.2025", "02.09.2026"]:
    try:
        html = get(f"/sayfa.asp?tur=gunlukbulten&tarih={t}")
        idx = html.upper().find("AYÇİÇEK")
        print(t, "uzunluk", len(html), "AYÇİÇEK idx", idx)
        if idx > 0:
            snippet = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " | ", html[idx - 300: idx + 900]))
            print("   ", snippet[:900])
    except Exception as e:  # noqa: BLE001
        print(t, "HATA", e)

print("\n=== json/tse.asp ===")
try:
    print(get("/json/tse.asp?mkod=99992")[:800])
except Exception as e:  # noqa: BLE001
    print("HATA", e)

print("\n=== DB'deki en eski/en yeni uztb_fiyat ===")
for order in ["asc", "desc"]:
    req = urllib.request.Request(
        f"{SUPA}/rest/v1/uztb_fiyat?select=trade_date&order=trade_date.{order}&limit=1", headers={"apikey": KEY}
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        print(order, r.read().decode())
req = urllib.request.Request(f"{SUPA}/rest/v1/uztb_fiyat?select=trade_date", headers={"apikey": KEY, "Prefer": "count=exact", "Range": "0-0"})
with urllib.request.urlopen(req, timeout=30) as r:
    print("toplam satir:", r.headers.get("Content-Range"))
