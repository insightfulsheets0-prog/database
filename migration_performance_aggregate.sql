-- =========================================================
-- MIGRASI: Agregasi Performance di database (server-side)
-- Menghindari batas 50.000 baris di sisi browser yang bikin data
-- kepotong untuk mesin/periode dengan volume besar.
-- Jalankan sekali di Supabase SQL Editor.
-- =========================================================

create or replace function public.performance_aggregate(
  p_mesin machine_type,
  p_stasiun_list text[],   -- null = semua stasiun (mesin single-line / semua)
  p_start timestamptz,
  p_end timestamptz
)
returns table (
  stroke numeric,
  ng numeric,
  dandori_menit numeric,
  downtime_menit numeric,
  break_menit numeric,
  wh_menit numeric,
  jumlah_baris bigint
)
language sql stable
as $$
  with batched as (
    -- kelompokkan per (stasiun, waktu_awal, waktu_akhir) supaya stroke
    -- part "separating" (pasangan, waktu sama) tidak dobel hitung.
    select
      stasiun, waktu_awal, waktu_akhir,
      max(coalesce(qty, 0)) as qty,
      sum(coalesce(ng, 0)) as ng,
      max(coalesce(dandori_menit, 0)) as dandori_menit,
      sum(coalesce(downtime_menit, 0)) as downtime_menit,
      max(coalesce(break_menit, 0)) as break_menit
    from public.production_log
    where mesin = p_mesin
      and (p_stasiun_list is null or stasiun = any(p_stasiun_list))
      and waktu_awal >= p_start
      and waktu_awal < p_end
    group by stasiun, waktu_awal, waktu_akhir
  )
  select
    coalesce(sum(qty), 0),
    coalesce(sum(ng), 0),
    coalesce(sum(dandori_menit), 0),
    coalesce(sum(downtime_menit), 0),
    coalesce(sum(break_menit), 0),
    coalesce(sum(extract(epoch from (waktu_akhir - waktu_awal)) / 60) - sum(break_menit), 0),
    count(*)
  from batched;
$$;

grant execute on function public.performance_aggregate(machine_type, text[], timestamptz, timestamptz) to authenticated;

-- =========================================================
-- SELESAI. Uji coba di SQL Editor:
-- select * from performance_aggregate('tandem', null, '2026-03-01', '2026-04-01');
-- =========================================================
