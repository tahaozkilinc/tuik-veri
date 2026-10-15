"""Geçici keşif scripti #6 — json/gunluk_bulten_detay.asp endpoint'ini
doğrudan çağırıp tarihsel veri kapsamını (kaç gün geriye gidiyor, tarih
parametresi destekliyor mu) test eder."""
import json as jsonlib
import urllib.request

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"}
BASE = "https://www.uzunkoprutb.org.tr"


def fetch(url, encoding="utf-8"):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read()
        return raw.decode(encoding, errors="replace")


print("--- json/gunluk_bulten_detay.asp?mkod=99992 ---")
text = fetch(BASE + "/json/gunluk_bulten_detay.asp?mkod=99992")
print("raw length:", len(text))
print("first 500 chars:", text[:500])
try:
    data = jsonlib.loads(text)
    print("top-level keys:", list(data.keys()) if isinstance(data, dict) else "array, len=" + str(len(data)))
    if isinstance(data, dict):
        for k, v in data.items():
            print(f"  key={k!r} type={type(v).__name__} len={len(v) if hasattr(v,'__len__') else '?'}")
        urungrafik = data.get("json_urungrafik", [])
        print("\n  json_urungrafik count:", len(urungrafik))
        if urungrafik:
            print("  first item:", urungrafik[0])
            print("  last item:", urungrafik[-1])
            dates = [r.get("TARIH") for r in urungrafik]
            print("  date range (first 5):", dates[:5])
            print("  date range (last 5):", dates[-5:])
except Exception as e:
    print("JSON parse error:", e)

print("\n--- same endpoint with &tarih=01.01.2026 (does it filter?) ---")
try:
    text2 = fetch(BASE + "/json/gunluk_bulten_detay.asp?mkod=99992&tarih=01.01.2026")
    print("length:", len(text2), "same as unfiltered?", text2 == text)
except Exception as e:
    print("ERROR:", e)

print("\n--- json/tse.asp?mkod=99992 ---")
try:
    text3 = fetch(BASE + "/json/tse.asp?mkod=99992")
    print("length:", len(text3))
    print(text3[:1000])
except Exception as e:
    print("ERROR:", e)
