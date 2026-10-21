-- TÜİK dış ticaret veri şeması
-- Yeni, izole Supabase projesinde çalıştırılmalı (SQL Editor veya `supabase db push`).

create table if not exists trade_stats (
    id              bigint generated always as identity primary key,
    period_year     int not null,
    period_month    int,                    -- null = yıllık toplam kayıt
    flow            text not null check (flow in ('export', 'import')),  -- ihracat / ithalat
    gtip_code       text not null,          -- GTİP / Fasıl kodu
    gtip_description text,
    port_code       text,                   -- gümrük/liman kodu
    port_name       text,
    country_code    text,
    country_name    text,
    value_usd       numeric,
    weight_kg       numeric,
    source          text not null default 'tuik',
    fetched_at      timestamptz not null default now(),
    -- NULLS NOT DISTINCT önemli: period_month ve port_code bu veri
    -- kaynağında (Qlik Engine API, ay/liman kırılımı yok) her satırda
    -- NULL. Standart UNIQUE'de NULL != NULL sayıldığı için normal bir
    -- unique constraint bu satırlar için HİÇBİR tekillik garanti etmez —
    -- her scrape çalışması aynı veriyi üst üste yeni satır olarak
    -- ekler (upsert'ün ON CONFLICT'i hiç eşleşme bulamaz).
    unique nulls not distinct (period_year, period_month, flow, gtip_code, port_code, country_code)
);

create index if not exists idx_trade_stats_period on trade_stats (period_year, period_month);
create index if not exists idx_trade_stats_gtip on trade_stats (gtip_code);
create index if not exists idx_trade_stats_port on trade_stats (port_code);

create table if not exists scrape_runs (
    id              bigint generated always as identity primary key,
    started_at      timestamptz not null default now(),
    finished_at     timestamptz,
    status          text not null default 'running' check (status in ('running', 'success', 'failed')),
    rows_upserted   int,
    error_message   text
);

create table if not exists daily_reports (
    id              bigint generated always as identity primary key,
    report_date     date not null unique,
    summary_md      text not null,
    generated_at    timestamptz not null default now()
);

-- Dashboard salt-okunur anon erişim: RLS aç, sadece SELECT'e izin ver.
alter table trade_stats enable row level security;
alter table daily_reports enable row level security;
alter table scrape_runs enable row level security;

drop policy if exists "public read trade_stats" on trade_stats;
create policy "public read trade_stats" on trade_stats for select using (true);

drop policy if exists "public read daily_reports" on daily_reports;
create policy "public read daily_reports" on daily_reports for select using (true);

-- scrape_runs'a dashboard'dan erişim gerekmiyor, RLS açık + policy yok = varsayılan erişim yok (sadece service role).

-- Yazma işlemleri yalnızca service_role key ile (GitHub Actions secret) yapılır,
-- anon key hiçbir zaman INSERT/UPDATE/DELETE yapamaz.
--
-- Savunma derinliği: RLS'nin (ve policy'lerin) yanlışlıkla kapatılması/silinmesi
-- ihtimaline karşı, anon ve authenticated rollerinden yazma yetkisini tablo
-- grant seviyesinde de açıkça geri alıyoruz. Böylece RLS devre dışı kalsa bile
-- dashboard'un kullandığı public anon key ile veri değiştirilemez/silinemez.
revoke insert, update, delete, truncate on trade_stats from anon, authenticated;
revoke insert, update, delete, truncate on daily_reports from anon, authenticated;
revoke insert, update, delete, truncate, select on scrape_runs from anon, authenticated;

-- WASDE (USDA World Agricultural Supply and Demand Estimates) — Mısır, Soya
-- Fasulyesi, Soya Küspesi ve Soya Yağı için aylık ABD + Dünya arz-talep
-- bilançosu. TÜİK gümrük verisiyle KARIŞTIRILMAMALI: WASDE bir tahmin/projeksiyon
-- raporu, Türkiye'ye özgü değil.
--
-- report_date (WASDE'nin kendi yayın tarihi, ör. 2026-09-11) satırları
-- silmiyoruz — her ayki çalıştırma SADECE o report_date'e ait satırları
-- sil-ve-ekle yapıyor (trade_stats'taki upsert hatasından ders alarak aynı
-- sil-ve-ekle deseni, ama bu sefer sadece o ayın satırlarıyla sınırlı).
-- Böylece geçmiş ayların rakamları hiç silinmiyor ve "bu ay geçen aya göre
-- nasıl revize edildi" karşılaştırması zaman içinde birikiyor.
create table if not exists wasde_stats (
    id               bigint generated always as identity primary key,
    report_date      date not null,          -- WASDE yayın tarihi — revizyon geçmişinin anahtarı
    release_number   int not null,           -- "WASDE-675" gibi
    commodity        text not null check (commodity in ('corn', 'soybeans', 'soybean_meal', 'soybean_oil')),
    scope            text not null check (scope in ('us', 'world')),
    region           text,                   -- scope='world': world / world_less_china / united_states / total_foreign / china; scope='us': NULL
    period_label     text not null,          -- WASDE'nin kendi etiketi: '2024/25', '2025/26 Est.', '2026/27 Proj. Aug', '2026/27 Proj. Sep'
    marketing_year   text not null,          -- period_label'dan çıkarılan pazarlama yılı, ör. '2026/27'
    measure          text not null,          -- 'production', 'ending_stocks', 'avg_farm_price' vb. — kararlı İngilizce anahtar
    measure_label_tr text not null,          -- "Üretim", "Dönem Sonu Stok (Devreden Stok)" — dashboard doğrudan kullanır
    value            numeric not null,
    unit             text not null,          -- 'million_bushels', 'million_metric_tons' vb.
    unit_label_tr    text not null,          -- "Milyon Bushel", "Milyon Metrik Ton"
    fetched_at       timestamptz not null default now(),
    unique nulls not distinct (report_date, commodity, scope, region, period_label, measure)
);

create index if not exists idx_wasde_stats_commodity on wasde_stats (commodity, scope);
create index if not exists idx_wasde_stats_report_date on wasde_stats (report_date);

alter table wasde_stats enable row level security;
drop policy if exists "public read wasde_stats" on wasde_stats;
create policy "public read wasde_stats" on wasde_stats for select using (true);
revoke insert, update, delete, truncate on wasde_stats from anon, authenticated;

-- scrape_runs'ı hem TÜİK hem WASDE çalıştırmaları için ortak kullanıyoruz.
alter table scrape_runs add column if not exists source text not null default 'tuik';

-- Ticaret Borsası — 3-4 emtia borsasından 15 dakikada bir çekilen anlık
-- fiyatlar. Kaynak (hangi borsa, hangi API) henüz tanımlanmadı — bu tablo
-- şimdilik boş, sayfa canlıda veri bekleyen bir boş-durum gösteriyor.
-- Her (exchange, symbol) çifti için zaman serisi recorded_at ile tutuluyor,
-- hiçbir satır silinmiyor — geçmiş fiyat grafiği/Excel dışa aktarımı için.
create table if not exists exchange_prices (
    id                 bigint generated always as identity primary key,
    exchange           text not null,          -- 'CBOT', 'MATIF' gibi kısa kod
    exchange_label_tr  text not null,           -- "Chicago Ticaret Borsası" gibi
    symbol             text not null,           -- kontrat/sembol kodu
    commodity_label_tr text not null,           -- "Mısır", "Soya Fasulyesi" gibi
    price              numeric not null,
    currency           text not null,           -- 'USD', 'EUR' vb.
    unit               text not null,           -- "$/bushel", "€/ton" vb.
    change_pct         numeric,                 -- günlük değişim % (varsa)
    recorded_at        timestamptz not null,    -- borsadaki fiyatın zaman damgası
    fetched_at         timestamptz not null default now(),
    unique (exchange, symbol, recorded_at)
);

create index if not exists idx_exchange_prices_lookup on exchange_prices (exchange, symbol, recorded_at desc);

alter table exchange_prices enable row level security;
drop policy if exists "public read exchange_prices" on exchange_prices;
create policy "public read exchange_prices" on exchange_prices for select using (true);
revoke insert, update, delete, truncate on exchange_prices from anon, authenticated;

-- USDA FAS Export Sales Reporting (ESR) — ABD'nin Mısır, Soya Fasulyesi, Soya
-- Küspesi, Soya Yağı ve Ayçiçek Yağı için haftalık ihracat satış verisi.
-- Resmi REST API'den (api.fas.usda.gov, DEMO_KEY ile) çekiliyor, WASDE gibi
-- Türkiye'ye özgü değil — ABD'nin KÜRESEL satış taahhütleri. Her çalıştırma
-- o (commodity_code, marketing_year) için TÜM geçmişi yeniden döndürüyor
-- (API'nin kendisi geçmiş haftalara revizyon yapabiliyor), bu yüzden
-- sil-ve-ekle o çift için kapsamlı — diğer ürün/pazarlama yıllarına dokunmaz.
create table if not exists export_sales_stats (
    id                  bigint generated always as identity primary key,
    week_ending         date not null,              -- raporun haftası (Perşembe yayınlanır)
    commodity_code      int not null,                -- USDA ESR emtia kodu (401=Mısır vb.)
    commodity_name_tr   text not null,
    marketing_year      int not null,                -- ESR'nin kendi pazarlama yılı numarası (bitiş yılı)
    country_code        int not null,
    country_name        text not null,
    weekly_exports_ton  numeric not null,            -- bu hafta fiilen sevk edilen
    accumulated_exports_ton numeric not null,        -- pazarlama yılı başından bu haftaya toplam sevkiyat
    outstanding_sales_ton numeric not null,           -- satıldı ama henüz sevk edilmedi
    gross_new_sales_ton numeric not null,             -- bu hafta yeni satılan (brüt)
    current_my_net_sales_ton numeric not null,        -- bu hafta net satış (iptaller düşülmüş)
    current_my_total_commitment_ton numeric not null, -- toplam taahhüt = sevkiyat + bekleyen satış
    next_my_outstanding_sales_ton numeric not null,   -- bir sonraki pazarlama yılına bekleyen satış
    next_my_net_sales_ton numeric not null,
    fetched_at          timestamptz not null default now(),
    unique (week_ending, commodity_code, marketing_year, country_code)
);

create index if not exists idx_export_sales_lookup on export_sales_stats (commodity_code, marketing_year, week_ending desc);
create index if not exists idx_export_sales_country on export_sales_stats (country_code);

alter table export_sales_stats enable row level security;
drop policy if exists "public read export_sales_stats" on export_sales_stats;
create policy "public read export_sales_stats" on export_sales_stats for select using (true);
revoke insert, update, delete, truncate on export_sales_stats from anon, authenticated;

-- TÜRİB (Türkiye Ürün İhtisas Borsası) günlük bülteni — Normal Seans elektronik
-- ürün senedi (ELÜS) işlemleri. www.turib.com.tr/gunluk-bulten/ sayfasına POST
-- edilen tarihle sunucu tarafında render edilen tabloyu kazıyoruz; "Excel'e
-- Aktar" düğmesi istemci tarafında JS ile aynı tabloyu dışa aktarıyor, ayrı
-- bir indirilebilir dosya yok. Her satır bir ISIN'in (LİDAŞ+ürün+konum
-- kombinasyonu) o günkü işlem özeti; (trade_date, isin_kodu) çifti benzersiz.
create table if not exists turib_bulletin (
    id                       bigint generated always as identity primary key,
    trade_date               date not null,
    isin_kodu                text not null,
    enstruman_sinifi         text not null,   -- ürün/sınıf, örn. "MISIR 1.SINIF"
    onceki_kapanis           numeric,
    en_dusuk                 numeric,
    en_yuksek                numeric,
    agirlikli_ortalama_fiyat numeric,
    kapanis_fiyati           numeric,
    islem_adedi              int,
    islem_miktari_kg         numeric,
    islem_hacmi_tl           numeric,
    lidas_adi                text not null,
    il                       text,
    ilce                     text,
    islem_kodu               text,
    fetched_at               timestamptz not null default now(),
    unique (trade_date, isin_kodu)
);

create index if not exists idx_turib_bulletin_lookup on turib_bulletin (enstruman_sinifi, trade_date desc);
create index if not exists idx_turib_bulletin_lidas on turib_bulletin (lidas_adi);

alter table turib_bulletin enable row level security;
drop policy if exists "public read turib_bulletin" on turib_bulletin;
create policy "public read turib_bulletin" on turib_bulletin for select using (true);
revoke insert, update, delete, truncate on turib_bulletin from anon, authenticated;

-- Uzunköprü Ticaret Borsası (UZTB) — Salon Satışı günlük fiyat özeti.
-- www.uzunkoprutb.org.tr'nin kendi iç API'leri kullanılıyor (sayfa HTML'i
-- veriyi barındırmıyor, JS ile AJAX çekiyor). İki kaynak birleşiyor: bugün
-- için /api/salon-satis.php (bireysel işlemler, rutubet dahil, BURADAN
-- kendimiz günlük özet hesaplıyoruz), geçmiş içinse /json/gunluk_bulten_detay.asp
-- (kaynağın kendi tuttuğu ~1 aylık hazır özet, rutubet YOK). Her satır bir
-- günün TEK özeti — bireysel işlem değil.
create table if not exists uztb_fiyat (
    id           bigint generated always as identity primary key,
    trade_date   date not null,
    urun_kodu    text not null,   -- kaynağın "mkod" / "MAL" kodu, örn '99992'
    urun_adi     text not null,   -- örn 'AYÇİÇEK'
    min_fiyat    numeric,
    max_fiyat    numeric,
    ort_fiyat    numeric,         -- ağırlıklı ortalama
    toplam_kilo  numeric,
    islem_adet   int,
    ort_rutubet  numeric,         -- sadece /api/salon-satis.php ile çekilen günlerde dolu
    fetched_at   timestamptz not null default now(),
    unique (trade_date, urun_kodu)
);

create index if not exists idx_uztb_fiyat_lookup on uztb_fiyat (urun_kodu, trade_date desc);

alter table uztb_fiyat enable row level security;
drop policy if exists "public read uztb_fiyat" on uztb_fiyat;
create policy "public read uztb_fiyat" on uztb_fiyat for select using (true);
revoke insert, update, delete, truncate on uztb_fiyat from anon, authenticated;

-- Konya Ticaret Borsası (KTB) — Satış Salonu günlük bülteni.
-- www.ktb.org.tr/gunlukfiyat bir Angular SPA; gerçek veri kimlik doğrulama
-- GEREKTİRMEYEN bir public REST API'den geliyor: GET /api/v1/Alpha.WebPanel/
-- OnlineKullaniciBulten/GetGunlukBulten/{YYYY-MM-DD}. Bu endpoint "Tescil"
-- (GetTescilGunlukBulten, kullanılmıyor — sadece Satış Salonu isteniyor)
-- bülteninden AYRI. Tarih parametresi en az 2+ yıl geriye gidebiliyor
-- (2024-10-15 dahil test edildi), bu yüzden tam 1 yıllık backfill mümkün.
-- Her satır bir (tarih, ürün grubu, sınıf) kırılımı — o sınıfın günün
-- min/ort/max fiyatı + miktarı + işlem sayısı; ayrıca aynı günün GRUP
-- genelindeki (tüm sınıflar) min/ort/max fiyatı da her satırda tekrarlanıyor
-- (kaynağın kendi response şekli böyle).
create table if not exists ktb_bulletin (
    id              bigint generated always as identity primary key,
    trade_date      date not null,
    grup_kodu       text not null,   -- örn '01.01.00.00'
    grup_adi        text not null,   -- örn 'Makarnalık Buğday'
    sinif_adi       text not null,   -- örn '2.GRUP MAKARNALIK BUĞDAYLAR'
    min_fiyat       numeric,
    ort_fiyat       numeric,
    max_fiyat       numeric,
    miktar          numeric,         -- kg
    islem_sayisi    int,
    grup_min_fiyat  numeric,         -- aynı günün grup geneli (tüm sınıflar) min/ort/max
    grup_ort_fiyat  numeric,
    grup_max_fiyat  numeric,
    fetched_at      timestamptz not null default now(),
    unique (trade_date, grup_kodu, sinif_adi)
);

create index if not exists idx_ktb_bulletin_lookup on ktb_bulletin (grup_kodu, trade_date desc);

alter table ktb_bulletin enable row level security;
drop policy if exists "public read ktb_bulletin" on ktb_bulletin;
create policy "public read ktb_bulletin" on ktb_bulletin for select using (true);
revoke insert, update, delete, truncate on ktb_bulletin from anon, authenticated;

-- Gaziantep Ticaret Borsası (GTB) — Salon Satışı günlük fiyat özeti.
-- www.gtb.org.tr/salon-satis-fiyatlari?tarih=YYYY-MM-DD sunucu tarafında
-- render edilen düz HTML sayfası (KTB/TÜRİB'in aksine SPA değil). Her ürün
-- günde bir satır — KAYNAKTA ortalama/ağırlıklı ortalama, hacim (kg) veya
-- işlem sayısı YOK, sadece en az/en çok. ort_fiyat bu yüzden (min+max)/2
-- olarak TÜRETİLİYOR (kullanıcının talimatı). Fiyatlar TL/TON cinsinden
-- (UZTB/KTB/TÜRİB'deki TL/kg'den FARKLI — dashboard bu tabloyu çekerken
-- ×1000 dönüşümü UYGULAMAMALI).
create table if not exists gtb_fiyat (
    id           bigint generated always as identity primary key,
    trade_date   date not null,
    urun_kodu    text not null,   -- kaynağın /salon-satis-urun/{kod}/7 kodu, örn '990100'
    urun_adi     text not null,   -- örn 'MISIR (1. GRUP - NATUREL)'
    min_fiyat    numeric,         -- TL/ton
    max_fiyat    numeric,         -- TL/ton
    ort_fiyat    numeric,         -- TL/ton — (min_fiyat + max_fiyat) / 2, kaynaktan gelmiyor
    fetched_at   timestamptz not null default now(),
    unique (trade_date, urun_kodu)
);

create index if not exists idx_gtb_fiyat_lookup on gtb_fiyat (urun_kodu, trade_date desc);

alter table gtb_fiyat enable row level security;
drop policy if exists "public read gtb_fiyat" on gtb_fiyat;
create policy "public read gtb_fiyat" on gtb_fiyat for select using (true);
revoke insert, update, delete, truncate on gtb_fiyat from anon, authenticated;

-- Çorum Ticaret Borsası (ÇTB) — günlük ürün fiyat özeti.
-- www.corumtb.org.tr/Bulten/Aralik?baslangic=YYYY-MM-DD&bitis=YYYY-MM-DD bir
-- JSON API — verilen tarih aralığındaki TÜM işlemlerden ürün bazında
-- min/ortalama/max fiyat + toplam miktar + işlem sayısı hesaplayıp
-- döndürüyor (kaynağın kendi "Aralık" filtresi). baslangic=bitis=aynı gün
-- verilince o GÜNÜN özeti elde ediliyor — günlük veri için bu şekilde
-- kullanılıyor (aralık bazlı toplu sorgu, geçmiş doldurma için de aynı
-- endpoint tek seferde tüm aralığı değil, her gün ayrı ayrı çağrılarak
-- kullanılıyor, çünkü dashboard günlük zaman serisi istiyor).
-- "ortalamaKgFiyat" kaynağın ağırlıklı ortalaması (toplamFiyat/toplamTonaj) —
-- "ortalamaFiyat" alanı ayrı bir (işlem bazlı, ağırlıksız) ortalama, biz
-- ağırlıklı olanı kullanıyoruz (UZTB/KTB'deki ort_fiyat ile aynı anlam).
-- Fiyatlar TL/KG (UZTB/KTB/TÜRİB ile aynı — GTB'nin TL/ton'undan farklı).
-- Rutubet verisi YOK.
create table if not exists ctb_fiyat (
    id           bigint generated always as identity primary key,
    trade_date   date not null,
    urun_adi     text not null,   -- örn 'EKMEKLİK BUĞDAY'
    min_fiyat    numeric,         -- TL/kg
    max_fiyat    numeric,         -- TL/kg
    ort_fiyat    numeric,         -- TL/kg — ağırlıklı ortalama (ortalamaKgFiyat)
    toplam_kilo  numeric,
    islem_adet   int,
    fetched_at   timestamptz not null default now(),
    unique (trade_date, urun_adi)
);

create index if not exists idx_ctb_fiyat_lookup on ctb_fiyat (urun_adi, trade_date desc);

alter table ctb_fiyat enable row level security;
drop policy if exists "public read ctb_fiyat" on ctb_fiyat;
create policy "public read ctb_fiyat" on ctb_fiyat for select using (true);
revoke insert, update, delete, truncate on ctb_fiyat from anon, authenticated;

-- Polatlı Ticaret Borsası (PTB) — günlük Salon Satışı fiyat özeti.
-- bulten.polatliborsa.org.tr/BultenGunluk.ashx?tarih=GG.AA.YYYY bir ASPX
-- handler — o günün HTML bülten tablosunu döndürüyor (sayfanın kendi JS
-- tarih seçicisinin AJAX çağrısı). Tablo hem kategori başlığı satırları
-- (TARIMSAL, BUĞDAY, ARPA... fiyatsız, sadece alt toplamlar) hem gerçek
-- ürün satırları (fiyatlı) içeriyor — fiyatsız satırlar atlanıyor.
-- "İşlem Tutarı" o ürünün günlük toplam TL cirosu (miktar × ortalama fiyat
-- civarı) — ayrıca saklanıyor, dashboard'da kullanılmıyor ama ileride
-- ciro bazlı analiz için faydalı olabilir. Fiyatlar TL/kg. Rutubet YOK.
create table if not exists ptb_fiyat (
    id              bigint generated always as identity primary key,
    trade_date      date not null,
    urun_adi        text not null,   -- örn 'KIRMIZI EKMEKLİK BUĞDAY (2.DERECE)'
    min_fiyat       numeric,         -- TL/kg
    max_fiyat       numeric,         -- TL/kg
    ort_fiyat       numeric,         -- TL/kg
    toplam_kilo     numeric,
    islem_adet      int,             -- "Muam. Ad" (muamele adedi)
    islem_tutari_tl numeric,         -- "İşlem Tutarı" — günlük toplam ciro
    fetched_at      timestamptz not null default now(),
    unique (trade_date, urun_adi)
);

create index if not exists idx_ptb_fiyat_lookup on ptb_fiyat (urun_adi, trade_date desc);

alter table ptb_fiyat enable row level security;
drop policy if exists "public read ptb_fiyat" on ptb_fiyat;
create policy "public read ptb_fiyat" on ptb_fiyat for select using (true);
revoke insert, update, delete, truncate on ptb_fiyat from anon, authenticated;

-- TCMB (Türkiye Cumhuriyet Merkez Bankası) günlük USD/TRY kuru.
-- Kaynak: www.tcmb.gov.tr/kurlar/{YYYYMM}/{DDMMYYYY}.xml (bugün için
-- /kurlar/today.xml). Hafta sonu/resmi tatillerde TCMB yayın yapmıyor —
-- o tarihler için kaynak 404 döner, bu bir hata değil, o gün atlanıyor.
-- forex_buying = "Döviz Alış" (TL bazlı değerleme/karşılaştırmalarda
-- yaygın kullanılan referans kur), forex_selling = "Döviz Satış" da
-- bilgi amaçlı ayrıca tutuluyor.
create table if not exists tcmb_usd_try (
    trade_date     date primary key,
    forex_buying   numeric,
    forex_selling  numeric,
    fetched_at     timestamptz not null default now()
);

alter table tcmb_usd_try enable row level security;
drop policy if exists "public read tcmb_usd_try" on tcmb_usd_try;
create policy "public read tcmb_usd_try" on tcmb_usd_try for select using (true);
revoke insert, update, delete, truncate on tcmb_usd_try from anon, authenticated;

-- MİGRASYON: bu şemayı daha önce (NULLS NOT DISTINCT olmadan) çalıştırdıysanız
-- — yani trade_stats tablosu zaten varsa — aşağıdaki blok eski unique
-- constraint'i bulup NULLS NOT DISTINCT olanla değiştirir. Script hem sıfırdan
-- kurulumda hem tekrar çalıştırıldığında güvenli (idempotent).
do $$
declare
    cons_name text;
begin
    select conname into cons_name
    from pg_constraint
    where conrelid = 'trade_stats'::regclass
      and contype = 'u';

    if cons_name is not null and cons_name <> 'trade_stats_unique' then
        execute format('alter table trade_stats drop constraint %I', cons_name);
        alter table trade_stats
            add constraint trade_stats_unique
            unique nulls not distinct (period_year, period_month, flow, gtip_code, port_code, country_code);
    end if;
end $$;
