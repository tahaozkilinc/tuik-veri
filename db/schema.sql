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
