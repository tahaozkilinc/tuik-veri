"""temp: KTB - find login/auth endpoint, homeService call sites, interceptor."""
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

print("\n==== default login context (wider) ====")
i = main.find("window.environment.IsletmeId")
print(main[max(0, i - 600):i + 600])

print("\n==== Login/login/Auth endpoint search ====")
for pat in [r'/api/v1/[A-Za-z\.]+/Login', r'/api/v1/[A-Za-z\.]+/Auth[A-Za-z]*', r'"Login"', r'Authorization']:
    print(f"--- pattern {pat} ---")
    seen = set()
    for m in re.finditer(pat, main):
        if m.group(0) not in seen:
            seen.add(m.group(0))
    print(list(seen)[:10])

print("\n==== homeService.getGunlukBulten( call sites ====")
for m in re.finditer(r'homeService\.getGunlukBulten\(', main):
    s = max(0, m.start() - 300)
    e = min(len(main), m.end() + 150)
    print("---")
    print(main[s:e])

print("\n==== homeService.getBultenUrunGruplarGruplar( call sites ====")
for m in re.finditer(r'homeService\.getBultenUrunGruplarGruplar\(', main):
    s = max(0, m.start() - 300)
    e = min(len(main), m.end() + 150)
    print("---")
    print(main[s:e])

print("\n==== homeService.getBultenGecmisIslemFiyatTarihAraligi( call sites ====")
for m in re.finditer(r'homeService\.getBultenGecmisIslemFiyatTarihAraligi\(', main):
    s = max(0, m.start() - 400)
    e = min(len(main), m.end() + 200)
    print("---")
    print(main[s:e])
