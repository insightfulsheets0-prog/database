-- =========================================================
-- SKEMA DATABASE: Sistem Input Produksi & Downtime
-- Jalankan file ini di Supabase Dashboard > SQL Editor
-- =========================================================

-- 1. Enum daftar mesin
create type machine_type as enum (
  'tandem',
  'blanking',
  'transfer_2000t',
  'transfer_800t',
  'pc200t'
);

-- 2. Tabel profil user (role: admin / operator)
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  full_name text,
  role text not null default 'operator' check (role in ('admin','operator')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Semua user login bisa lihat daftar profil"
  on public.profiles for select
  to authenticated
  using (true);

create policy "User bisa update profil sendiri"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

create policy "User bisa insert profil sendiri"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

-- Auto-buat baris profile setiap ada user baru signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'operator');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 3. Tabel LOG PRODUKSI (semua mesin, kolom spesifik mesin masuk ke 'extra' jsonb)
create table public.production_log (
  id uuid primary key default gen_random_uuid(),
  mesin machine_type not null,
  waktu_awal timestamptz not null,
  waktu_akhir timestamptz not null,
  part_number text,
  qty integer,
  ng integer,
  kategori_ng text,
  break_menit integer,
  extra jsonb not null default '{}'::jsonb,
  -- extra contoh isi per mesin:
  --  tandem          : {"rout_pa1":1,"rout_pa2":2,"rout_pa3":3,"rout_pa4":4,"rout_pa5":null}
  --  blanking        : {"top_coil":"44/12","berat_coil":1250}
  --  transfer_2000t  : {}
  --  transfer_800t   : {}
  --  pc200t          : {"pc1":1,"pc2":2}
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_production_log_mesin_waktu on public.production_log (mesin, waktu_awal desc);

alter table public.production_log enable row level security;

create policy "Login bisa lihat production_log"
  on public.production_log for select to authenticated using (true);
create policy "Login bisa tambah production_log"
  on public.production_log for insert to authenticated with check (true);
create policy "Login bisa update production_log"
  on public.production_log for update to authenticated using (true);
create policy "Login bisa hapus production_log"
  on public.production_log for delete to authenticated using (true);

-- 4. Tabel LOG DOWNTIME (semua mesin)
create table public.downtime_log (
  id uuid primary key default gen_random_uuid(),
  mesin machine_type not null,
  waktu_awal timestamptz not null,
  waktu_akhir timestamptz not null,
  kategori text,
  problem text,
  penyebab text,
  countermeasure text,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_downtime_log_mesin_waktu on public.downtime_log (mesin, waktu_awal desc);

alter table public.downtime_log enable row level security;

create policy "Login bisa lihat downtime_log"
  on public.downtime_log for select to authenticated using (true);
create policy "Login bisa tambah downtime_log"
  on public.downtime_log for insert to authenticated with check (true);
create policy "Login bisa update downtime_log"
  on public.downtime_log for update to authenticated using (true);
create policy "Login bisa hapus downtime_log"
  on public.downtime_log for delete to authenticated using (true);

-- 5. Trigger auto-update kolom updated_at & updated_by
create or replace function public.set_updated_meta()
returns trigger as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$ language plpgsql;

create trigger trg_production_log_updated
  before update on public.production_log
  for each row execute procedure public.set_updated_meta();

create trigger trg_downtime_log_updated
  before update on public.downtime_log
  for each row execute procedure public.set_updated_meta();

-- =========================================================
-- SELESAI. Setelah dijalankan, cek Table Editor di Supabase
-- untuk memastikan tabel profiles, production_log, downtime_log
-- sudah muncul.
-- =========================================================
