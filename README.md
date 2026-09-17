# tuik-veri

TÜİK dış ticaret istatistiklerini (GTİP + ülke + yıl kırılımında, ihracat/ithalat)
her gün otomatik çeken, Supabase'e yazan ve canlı bir dashboard'da gösteren pipeline.

## Mimari

```
GitHub Actions (cron, her gün 06:00 UTC)
  -> scraper/run.py
       -> scraper/qlik_client.py     (Qlik Engine API'sine WebSocket JSON-RPC ile bağlanır)
       -> loader/supabase_loader.py  (Supabase'e upsert + scrape_runs log)
       -> reports/daily_report.py    (günlük özet + YoY karşılaştırma üretir)
  -> Supabase Postgres (trade_stats, scrape_runs, daily_reports)
  -> dashboard/ (statik HTML, GitHub Pages) — Supabase REST API'den (anon key) canlı okur
```

### Neden Qlik Engine API, neden DOM otomasyonu değil

TÜİK'in yeni dış ticaret sorgulama aracı (`bi.tuik.gov.tr/extensions/tuik-mashup`)
aslında gömülü bir **Qlik Sense** uygulaması. UI'yi Playwright ile tıklatmak
(GTİP arama kutusuna yazmak, "Raporu Oluştur"a basmak) son derece kırılgan
çıktı: arama kutusunun arkasındaki veri WebSocket üzerinden gelen bir Qlik
Engine hypercube sorgusuna bağlı ve bu bazen 35 saniyeye kadar sürebiliyor,
üstelik rapor oluşturma adımı hiçbir zaman DOM'da bir `<table>`'a dönüşmedi.

Bunun yerine `scraper/qlik_client.py`, Playwright'ı SADECE oturum/CSRF/
WebSocket-handshake bootstrap için kullanıyor (tarayıcı bunu zaten doğru
yapıyor), sonra sayfanın kendi açtığı WebSocket'i bir init script ile ele
geçirip üzerinden ham Qlik Engine JSON-RPC istekleri gönderiyor. Tüm GTİP
kodları için ülke/yıl/yön kırılımındaki veri TEK bir hypercube sorgusuyla
(set analysis filtreli) çekiliyor — DOM'a hiç dokunulmuyor, sayfa yüklenir
yüklenmez birkaç saniye içinde tüm veri gelir.

Keşfedilen Qlik veri modeli (`DT_GENEL` tablosu, ~92M satır):

| Alan | Anlamı |
|---|---|
| `ISTPOZ` / `ISTPOZ_ADI` | GTİP kodu (12 hane, noktasız) / açıklaması |
| `ULKE_KODU` / `ULKE_ADI` | ülke kodu / adı |
| `YIL` / `AY` | yıl / ay (şu an sadece yıllık toplam çekiliyor) |
| `IHRITH` | `"İhracat"` \| `"İthalat"` |
| `DOLAR` / `EURO` / `TL` | para birimi bazlı istatistiki değer |
| `MIKTAR_1` / `MIKTAR_2` | miktar (MIKTAR_1 çoğunlukla kilogram) |

## Kurulum

### 1. Supabase projesi

1. [supabase.com](https://supabase.com) üzerinde yeni, izole bir proje açın.
2. SQL Editor'de `db/schema.sql` içeriğini çalıştırın.
3. Project Settings → API'den şunları alın:
   - `Project URL`
   - `anon` `public` key (dashboard için — RLS zaten SELECT'e sınırlı, public olması güvenli)
   - `service_role` key (**gizli** — sadece GitHub Actions secret olarak kullanılacak, hiçbir yere commitlenmeyecek)

### 2. GitHub repo secrets

Repo → Settings → Secrets and variables → Actions:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### 3. Dashboard config

`dashboard/config.js` içindeki `SUPABASE_URL` ve `SUPABASE_ANON_KEY` değerlerini
gerçek proje bilgileriyle güncelleyip commit edin (anon key public olarak
tasarlanmıştır, RLS onu SELECT ile sınırlar).

### 4. GitHub Pages

Repo → Settings → Pages → Source: "GitHub Actions" seçin.
`dashboard/` klasörüne her push'ta `.github/workflows/deploy-dashboard.yml` otomatik yayınlar.

### 5. Takip edilecek GTİP listesi

`config/targets.yaml` dosyasındaki `gtip_codes` listesini güncelleyin. Her
GTİP kodu için ülke + yıl + yön (ihracat/ithalat) kırılımındaki tüm veri
tek seferde çekilir — ayrı yıl/ay aralığı belirtmeye gerek yok.

## Yerel geliştirme

```bash
pip install -r requirements.txt
playwright install --with-deps chromium
export SUPABASE_URL=...
export SUPABASE_SERVICE_ROLE_KEY=...
python -m scraper.run
```

## Hata ayıklama

Qlik Engine ile ilgili bir sorun olursa (`GetFieldList` gibi bazı Engine API
method'ları anonim/embed oturumlarda kısıtlı — `GetTablesAndKeys` ve
`CreateSessionObject` çalışıyor), `.github/workflows/qlik-probe.yml` ve
`scripts/qlik_ws_bridge_probe.py` ile hızlı (saniyeler içinde tamamlanan,
tarayıcı kurulumu dışında) keşif/deneme yapılabilir — tam bir scrape
çalıştırmasını (dakikalar) beklemeden.
