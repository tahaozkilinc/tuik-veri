"""temp: KTB (Konya Ticaret Borsasi) kesif scripti - Angular SPA, env config + bundle grep."""
import re
import urllib.request

BASE = "https://www.ktb.org.tr"


def get(path):
    url = BASE + path
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return resp.read().decode("utf-8", errors="replace")


print("==== environment.js ====")
try:
    env = get("/assets/config/environment.js")
    print(env[:3000])
except Exception as e:
    print("ERR:", e)

print("\n==== main bundle: searching for api/http patterns ====")
try:
    main = get("/main.222ebc54c3aab9f5.js")
    print("main.js length:", len(main))
    seen = set()
    for m in re.finditer(r'["\']((?:https?://|/)[a-zA-Z0-9_\-./]{3,80}(?:api|Api|gunluk|fiyat|Fiyat|bulten|Bulten|salon|Salon)[a-zA-Z0-9_\-./]*)["\']', main):
        if m.group(1) not in seen:
            seen.add(m.group(1))
            print("MATCH:", m.group(1))
    print("total unique matches:", len(seen))
except Exception as e:
    print("ERR:", e)

print("\n==== scripts bundle ====")
try:
    scripts = get("/scripts.8424758f1970bb3a.js")
    print("scripts.js length:", len(scripts))
except Exception as e:
    print("ERR:", e)
