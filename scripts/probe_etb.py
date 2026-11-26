import re, ssl, time, urllib.request, urllib.parse, http.cookiejar

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
cj = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

def get(url, data=None, hdr=None):
    h = {"User-Agent": UA, "Accept-Language": "tr-TR,tr;q=0.9"}
    if hdr: h.update(hdr)
    if data is not None and not isinstance(data, bytes):
        data = urllib.parse.urlencode(data).encode()
    r = op.open(urllib.request.Request(url, data=data, headers=h), timeout=40)
    b = r.read()
    ct = r.headers.get("Content-Type", "")
    m = re.search(r"charset=([\w-]+)", ct)
    try:
        t = b.decode(m.group(1) if m else "utf-8")
    except Exception:
        t = b.decode("latin-1")
    return r.status, ct, t

def strip(s):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s)).replace("&nbsp;", " ").strip()

def rows_of(html):
    tabs = re.findall(r"<table\b.*?</table>", html, re.S | re.I)
    out = []
    for t in tabs:
        for r in re.findall(r"<tr\b(.*?)>(.*?)</tr>", t, re.S | re.I):
            cells = re.findall(r"<t([hd])\b([^>]*)>(.*?)</t[hd]>", r[1], re.S | re.I)
            out.append((r[0].strip()[:80], [(c[0], c[1].strip()[:60], strip(c[2])[:60]) for c in cells]))
    return out

E = "https://www.esktb.org.tr/tr/?PID=bulten/bulten"
get(E)
for day, salon in [("2026-11-25", ""), ("2026-11-25", "_SALON"), ("2026-11-25", "_SALON_GRUP"), ("2025-11-25", ""), ("2024-10-15", ""), ("2026-11-22", "")]:
    t0 = time.time()
    try:
        st, ct, h = get(E, {"SALON": salon, "CAPNO": "D", "BDATE": day, "EDATE": day, "LANG": "TR"})
        rs = rows_of(h)
        # skip the giant form row
        rs = [r for r in rs if not (r[1] and len(r[1][0][2]) > 300)]
        print(f"\n==== ESKTB {day} SALON={salon!r} st={st} {time.time()-t0:.1f}s rows={len(rs)}")
        lim = 200 if (day == "2026-11-25" and salon == "") else 25
        for attrs, cells in rs[:lim]:
            print("  TR[", attrs, "]", [(c[0], c[1][:30], c[2]) for c in cells] if day == "2026-11-25" and salon == "" and len(cells) < 3 else [c[2] for c in cells])
        # date echo
        m = re.search(r'id="BDATE"[^>]*value="([^"]+)"', h, re.S)
        print("  BDATE echo:", m.group(1) if m else None)
    except Exception as e:
        print("ESKTB ERR", day, salon, repr(e))

# ---- EDTB Angular
B = "https://online.etb.org.tr/"
try:
    st, ct, env = get(B + "assets/config/environment.js")
    print("\n==== EDTB environment.js:", env[:2000])
except Exception as e:
    print("ENV ERR", repr(e))
try:
    st, ct, mainjs = get(B + "main.f5db1cb2a0096d1f.js")
    print("main.js len", len(mainjs))
    urls = sorted(set(re.findall(r"[\"'`]((?:https?:)?//[^\"'`\s]{4,120}|/?api/[^\"'`\s]{2,120}|[A-Za-z0-9_/-]*[Bb]ulten[A-Za-z0-9_/?=&-]*)[\"'`]", mainjs)))
    print("URLS:", urls[:120])
    for kw in ["grupKodu", "sinifKodu", "online-bulten", "apiUrl", "baseUrl", "environment", "GetBulten", "bulten"]:
        for m in list(re.finditer(re.escape(kw), mainjs))[:6]:
            s = mainjs[max(0, m.start() - 250): m.end() + 350]
            print(f"--- {kw} @ {m.start()}: {s}")
except Exception as e:
    print("MAIN ERR", repr(e))
