-- =========================================================
-- MIGRASI: Output ratio (dari sheet CT TIME) di Master Data Part Number
-- Dipakai buat hitung Stroke yang benar: Stroke = Qty x Output
-- (part yang "berbagi stroke", mis. pasangan Kiri/Kanan, Output-nya < 1)
-- Default 1 (artinya 1 qty = 1 stroke, part biasa).
-- Jalankan sekali di Supabase SQL Editor
-- =========================================================

alter table public.part_numbers add column if not exists output_ratio numeric not null default 1;

-- =========================================================
-- SELESAI. Kolom output_ratio siap dipakai di Master Data & Performance.
-- =========================================================
