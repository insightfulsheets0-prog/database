-- =========================================================
-- MIGRASI: Std Manpower & Std CT (Cycle Time) di Master Data Part Number
-- SPM (Stroke Per Menit) dihitung otomatis di app = 1 / std_ct
-- Jalankan sekali di Supabase SQL Editor
-- =========================================================

alter table public.part_numbers add column if not exists std_mp numeric;
alter table public.part_numbers add column if not exists std_ct numeric; -- menit per stroke

-- =========================================================
-- SELESAI. Kolom std_mp & std_ct siap dipakai di Master Data.
-- =========================================================
