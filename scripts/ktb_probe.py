"""temp: KTB main bundle - context around key API calls + service class body."""
import re
import urllib.request

BASE = "https://www.ktb.org.tr"


def get(path):
    url = BASE + path
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return resp.read().decode("utf-8", errors="replace")


main = get("/main.222ebc54c3aab9f5.js")
print("main.js length:", len(main))

targets = [
    "GetBultenGecmisIslemFiyatTarihAraligi",
    "GetBultenGecmisIslemUrunListesi",
    "GetGunlukBulten",
    "GetSatilanUrunDetay",
    "GetBultenUrunGruplarGruplar",
    "GetBultenGrupSinifUrunSelect",
    "GetGrupSinifUrunSelectler",
]

for t in targets:
    print(f"\n==== context around {t} ====")
    for m in re.finditer(re.escape(t), main):
        start = max(0, m.start() - 400)
        end = min(len(main), m.end() + 400)
        print("---")
        print(main[start:end])
