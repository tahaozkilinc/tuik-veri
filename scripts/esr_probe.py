"""Geçici keşif scripti #2 — swagger.json'ın tamamını indirip ESR ile
ilgili path'leri ve parametrelerini özetler."""
import json
import urllib.request

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; tuik-veri-research/1.0)"}
URL = "https://apps.fas.usda.gov/opendatawebV2/assets/swagger/swagger.json"

req = urllib.request.Request(URL, headers=HEADERS)
with urllib.request.urlopen(req, timeout=20) as resp:
    spec = json.loads(resp.read())

print("host:", spec.get("host"))
print("securityDefinitions:", json.dumps(spec.get("securityDefinitions"), indent=2))
print()

esr_paths = {p: v for p, v in spec["paths"].items() if "/esr/" in p}
print("ESR paths found:", list(esr_paths.keys()))
print()

for path, methods in esr_paths.items():
    for verb, op in methods.items():
        print(f"{verb.upper()} {path}")
        print("  summary:", op.get("summary", "")[:200].replace("\n", " "))
        params = op.get("parameters", [])
        for p in params:
            print(f"   param: {p.get('name')} ({p.get('in')}, {p.get('type')}, required={p.get('required')}) - {p.get('description','')[:120]}")
        print()

# definitions referenced by ESR responses, if any schema refs exist
defs = spec.get("definitions", {})
esr_def_names = [k for k in defs if "esr" in k.lower() or "export" in k.lower() or "commodity" in k.lower()]
print("related definitions:", esr_def_names)
for name in esr_def_names[:6]:
    print(name, "->", json.dumps(defs[name])[:800])
