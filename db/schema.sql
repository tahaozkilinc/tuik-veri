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
    unique (period_year, period_month, flow, gtip_code, port_code, country_code)
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
