"""temp: KTB main bundle - find CALL SITES (not service method defs) to learn param meaning."""
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

# find call sites like ".getBultenGecmisIslemFiyatTarihAraligi(" with actual args (not "this.httpClient.get")
call_targets = [
    "getBultenGecmisIslemFiyatTarihAraligi(",
    "getBultenUrunGruplarGruplar(",
    "getGunlukBulten(",
    "getBultenGrupSinifUrunSelect(",
    "getGrupSinifUrunSelectler(",
    "getSatilanUrunDetay(",
]

for t in call_targets:
    print(f"\n==== call sites for {t} ====")
    count = 0
    for m in re.finditer(re.escape(t), main):
        # skip the definition site (has "return this.httpClient.get" right after)
        after = main[m.end():m.end() + 40]
        if "return this.httpClient" in after or after.startswith(")"):
            continue
        start = max(0, m.start() - 300)
        end = min(len(main), m.end() + 150)
        print("---")
        print(main[start:end])
        count += 1
        if count >= 5:
            break
    if count == 0:
        print("(no non-definition call sites found with this heuristic)")

print("\n==== IsletmeId / FirmaId / SubeId usage ====")
for key in ["IsletmeId", "FirmaId", "SubeId", "environment.IsletmeId", "environment[\"IsletmeId\"]"]:
    idxs = [m.start() for m in re.finditer(re.escape(key), main)]
    print(key, "-> count:", len(idxs))
    for i in idxs[:3]:
        print("   ctx:", main[max(0,i-100):i+100])
