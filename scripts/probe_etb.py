import re, ssl, sys, urllib.request, urllib.parse, http.cookiejar

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
cj = http.cookiejar.CookieJar()
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj), urllib.request.HTTPSHandler(context=ctx))

def get(url, data=None, hdr=None):
    h = {"User-Agent": UA, "Accept-Language": "tr-TR,tr;q=0.9"}
    if hdr: h.update(hdr)
    if data is not None and not isinstance(data, bytes):
        data = urllib.parse.urlencode(data).encode()
    r = op.open(urllib.request.Request(url, data=data, headers=h), timeout=40)
    b = r.read()
    ct = r.headers.get("Content-Type", "")
    m = re.search(r"charset=([\w-]+)", ct)
    enc = m.group(1) if m else "utf-8"
    try:
        t = b.decode(enc)
    except Exception:
        t = b.decode("latin-1")
    return r.status, r.geturl(), ct, t

def strip(s):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s)).strip()

def summarize(name, url, html):
    print(f"\n######## {name} {url} len={len(html)}")
    print("TITLE:", strip((re.search(r"<title[^>]*>(.*?)</title>", html, re.S) or [None, ""])[1])[:120])
    for f in re.finditer(r"<form\b([^>]*)>(.*?)</form>", html, re.S | re.I):
        print("FORM", f.group(1)[:200])
        for i in re.finditer(r"<input\b([^>]*)>", f.group(2), re.I):
            print("   INPUT", i.group(1)[:200])
        for s in re.finditer(r"<select\b([^>]*)>(.*?)</select>", f.group(2), re.S | re.I):
            opts = re.findall(r"<option\b([^>]*)>(.*?)</option>", s.group(2), re.S | re.I)
            print("   SELECT", s.group(1)[:150], "n=", len(opts))
            for o in opts[:40]:
                print("      OPT", o[0][:80], "|", strip(o[1])[:60])
    for s in re.finditer(r"<select\b([^>]*)>(.*?)</select>", html, re.S | re.I):
        opts = re.findall(r"<option\b([^>]*)>(.*?)</option>", s.group(2), re.S | re.I)
        print("SELECT(any)", s.group(1)[:150], "n=", len(opts), [strip(o[1])[:30] for o in opts[:15]])
    for s in re.findall(r"<script\b[^>]*src=\"([^\"]+)\"", html, re.I):
        print("SCRIPT", s)
    for s in re.findall(r"<iframe\b[^>]*src=\"([^\"]+)\"", html, re.I):
        print("IFRAME", s)
    tabs = re.findall(r"<table\b.*?</table>", html, re.S | re.I)
    print("TABLES:", len(tabs))
    for ti, t in enumerate(tabs[:6]):
        rows = re.findall(r"<tr\b.*?</tr>", t, re.S | re.I)
        print(f"  TABLE {ti} rows={len(rows)}")
        for r in rows[:8]:
            cells = [strip(c) for c in re.findall(r"<t[hd]\b.*?</t[hd]>", r, re.S | re.I)]
            print("     ", cells[:14])
    # inline JS ajax hints
    for m in re.finditer(r"(\$\.(?:ajax|post|get)|fetch\(|url\s*:\s*['\"][^'\"]+|XMLHttpRequest|\.aspx?[^'\"\s]*|\.php[^'\"\s]*|api/[^'\"\s]*)", html):
        pass
    hints = sorted(set(re.findall(r"['\"]([^'\"\s]*(?:\.ashx|\.aspx|\.asp|\.php|/api/|Bulten|bulten|json)[^'\"\s]*)['\"]", html)))
    print("URL HINTS:", hints[:60])
    links = sorted(set(re.findall(r"href=\"([^\"]*(?:bulten|Bulten|PID)[^\"]*)\"", html)))
    print("LINKS:", links[:60])

# ---- ESKTB
for u in ["https://www.esktb.org.tr/tr/?PID=bulten/bulten"]:
    try:
        st, fu, ct, h = get(u)
        print("STATUS", st, fu, ct)
        summarize("ESKTB", u, h)
        i = h.find("ülten")
        print("SNIPPET-around-body:")
        body = re.sub(r"<script\b.*?</script>", "", h, flags=re.S | re.I)
        txt = strip(body)
        j = txt.find("Bülten")
        print(txt[max(0, j - 200): j + 2500])
        # inline scripts mentioning ajax
        for sc in re.findall(r"<script\b[^>]*>(.*?)</script>", h, re.S | re.I):
            if re.search(r"ajax|bulten|tarih|post|fetch", sc, re.I) and len(sc) < 6000:
                print("INLINE-SCRIPT:", sc.strip()[:3000])
    except Exception as e:
        print("ESKTB ERR", repr(e))

# ---- EDTB
for u in ["https://online.etb.org.tr/online-bulten?grupKodu=AYC&sinifKodu=-&tarih=-",
          "https://online.etb.org.tr/online-bulten"]:
    try:
        st, fu, ct, h = get(u)
        print("STATUS", st, fu, ct)
        summarize("EDTB", u, h)
        for sc in re.findall(r"<script\b[^>]*>(.*?)</script>", h, re.S | re.I):
            if re.search(r"ajax|bulten|tarih|post|fetch|grupKodu", sc, re.I) and len(sc) < 8000:
                print("INLINE-SCRIPT:", sc.strip()[:3000])
        body = re.sub(r"<script\b.*?</script>", "", h, flags=re.S | re.I)
        txt = strip(body)
        print("TEXT:", txt[:3000])
    except Exception as e:
        print("EDTB ERR", repr(e))
