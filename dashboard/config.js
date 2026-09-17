// Supabase URL + anon key BURAYA doldurulacak.
// anon key public'e açık olması güvenli: RLS sadece SELECT'e izin veriyor
// (db/schema.sql), INSERT/UPDATE/DELETE yalnızca service_role key ile
// (GitHub Actions secret) mümkün.
window.TUIK_DASHBOARD_CONFIG = {
  SUPABASE_URL: "https://kajilskrmavwqdaipixu.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_6UslA4U4eYBSQl0RGkAe8g_7qPFuK1M",
};
