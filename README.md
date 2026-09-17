# tuik-veri

TÜİK dış ticaret istatistiklerini (GTİP + liman + yıl kırılımında, ihracat/ithalat)
her gün otomatik çeken, Supabase'e yazan ve canlı bir dashboard'da gösteren pipeline.

## Mimari

```
GitHub Actions (cron, her gün 06:00 UTC)
  -> scraper/run.py
       -> scraper/biruni_client.py   (Playwright ile biruni.tuik.gov.tr'den veri çeker)
       -> scraper/parser.py          (ham veriyi normalize eder)
       -> loader/supabase_loader.py  (Supabase'e upsert + scrape_runs log)
       -> reports/daily_report.py    (günlük özet + YoY karşılaştırma üretir)
  -> Supabase Postgres (trade_stats, scrape_runs, daily_reports)
  -> dashboard/ (statik HTML, GitHub Pages) — Supabase REST API'den (anon key) canlı okur
```

Scraper GitHub Actions runner'ında çalışır (bu geliştirme oturumunun ağ erişimi
tuik.gov.tr'ye kapalı olduğu için biruni arayüzüne karşı canlı doğrulanamadı —
detaylar aşağıda "Bilinen kısıt" bölümünde).

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

### 5. Takip edilecek GTİP / liman listesi

`config/targets.yaml` dosyasını gerçek GTİP kodları ve limanlarla güncelleyin.
Boş bırakılan alanlar TÜİK'in genel toplam kırılımını çeker.

### 6. İlk (tek seferlik) geçmiş veri yüklemesi

Yıllar içi (year-over-year) karşılaştırma için geçmiş yılları bir kere doldurun:

```bash
pip install -r requirements.txt
playwright install --with-deps chromium
export SUPABASE_URL=...
export SUPABASE_SERVICE_ROLE_KEY=...
python -m scraper.run --full-history
```

Bundan sonra günlük cron (`daily-scrape.yml`) sadece son 3 yılı güncel tutar.

## Bilinen kısıt: scraper canlı sitede kalibre edilmeli

`scraper/biruni_client.py`, biruni.tuik.gov.tr'nin genel arayüz yapısına (Türkçe
etiketler: "İhracat/İthalat", "GTİP", "Liman", "Yıl", "Sorgula") dayanan bir ilk
sürümdür. Bu geliştirme ortamının ağ politikası `*.gov.tr` alan adlarına erişimi
engellediği için canlı sayfaya karşı doğrulanamadı.

İlk `daily-scrape.yml` çalıştırmasında selector uyuşmazlığı olursa:
1. Actions log'unda `diagnostics` grubu altında sayfa başlığı ve görünür metin
   basılır (`_dump_diagnostics` fonksiyonu).
2. Bu çıktıyı paylaşın, `scraper/biruni_client.py` ve `scraper/parser.py`
   (özellikle `COLUMN_MAP`) gerçek sayfa yapısına göre güncellenir.

## Yerel geliştirme

```bash
pip install -r requirements.txt
playwright install --with-deps chromium
python -m scraper.run          # son 3 yılı çeker
python -m scraper.run --full-history  # targets.yaml'daki tüm yıl aralığı
```
