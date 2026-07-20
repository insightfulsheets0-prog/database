# Sistem Input Produksi & Downtime

Aplikasi web (HTML + Alpine.js + Supabase) untuk mencatat data produksi dan
downtime 5 mesin. Bisa diinstall di HP (PWA) dan tetap bisa dipakai tanpa
sinyal (mode offline).

---

## 🔧 REBUILD BESAR — Framework Start/Finish baru (baca sebelum upload)

Konsepnya beda dari sebelumnya: **Dandori/Downtime/Break sekarang jadi
kolom durasi di baris produksi yang sama** (bukan baris terpisah), waktu
Mulai/Selesai pakai jam sistem (tidak bisa diketik manual kecuali mode
edit koreksi), dan ada **Planning Produksi** (rencana part yang disiapkan
admin/leader, operator tinggal pilih).

### 1. Jalankan migrasi database dulu
Di Supabase SQL Editor, jalankan **`migration_framework_v2.sql`** (query
baru). Ini nambah kolom (`dandori_menit`, `downtime_menit`, `manpower` di
`production_log`), role baru **`leader`**, tabel baru
**`production_planning`** dan **`nonproduksi_types`**, plus validasi
otomatis supaya Downtime tidak bisa melintasi 2 part sekaligus.

### 2. Upload SEMUA file ke GitHub
Timpa seluruh isi folder — paling aman upload ulang semuanya (bukan file
tertentu saja), karena hampir semua bagian ikut berubah.

### 3. Cara pakai alur baru
- **Mulai Produksi** — kalau ada jeda sejak kejadian terakhir (dijepit ke
  jadwal shift, tidak salah hitung lintas hari/shift), pilih dulu jenis
  Non-Produksi-nya (Meeting Awal Shift, dll — kelola daftarnya di Master
  Data). Habis itu pilih Part Number (dari Planning kalau sudah
  disiapkan, atau ketik bebas) → masuk fase **"Dandori"**.
- Begitu produksi aktual (stroke) betulan mulai, klik **"Konfirmasi
  Produksi Mulai"** — sistem hitung otomatis berapa menit Dandori-nya.
- **Selesai Produksi** → langsung pilih lanjut **Setup** (part
  berikutnya) atau **Non-Produksi**.
- **Break** terisi otomatis sesuai jadwal shift, tidak perlu input manual.
- **Downtime** — sekarang wajib pilih Stasiun (Tandem/PC200t), dan
  waktunya harus pas di dalam satu part; kalau melintasi 2 part, sistem
  menolak dengan pesan error.
- **Planning Produksi** — tampil di bawah tombol Mulai/Selesai tiap
  stasiun; cuma **admin & leader** yang bisa nambah/hapus, operator cuma
  lihat & pilih.
- Role **leader** baru — jadikan seseorang leader lewat Supabase **Table
  Editor > profiles** → ubah kolom `role` jadi `leader` (sama caranya
  seperti menjadikan admin).

### Yang saya TUNDA
- **Export ke Excel** (format kolom A-W persis Nippo) — dibangun setelah
  alur baru ini jalan lancar dan datanya konsisten dulu.
- **Data historis (FY2024/Juni 2026)** belum disesuaikan ke skema baru
  ini (kolom `dandori_menit` dll) — kabari kalau mau diproses ulang.

---

## Setup awal (kalau install dari nol)

1. Buat project di https://supabase.com → **SQL Editor** → jalankan
   `schema.sql`, lalu (query baru, terpisah) `seed.sql`, lalu semua
   `migration_*.sql` secara berurutan sesuai tanggal file-nya.
2. **Project Settings > API Keys** → salin `Project URL` dan key
   `sb_publishable_...` (atau `anon public` untuk project lama) → isi ke
   `assets/supabaseClient.js`.
3. **Authentication > Providers > Email** → matikan "Confirm email".
4. Upload semua isi folder ini ke repo GitHub baru (isi folder, bukan
   folder pembungkusnya) → connect ke Vercel → Deploy.
5. Di Vercel: **Settings > Deployment Protection** → pastikan **Vercel
   Authentication = Disabled**.
6. Buka `login.html` → Daftar akun pertama. Jadikan admin lewat Supabase
   **Table Editor > profiles** → ubah `role` jadi `admin`.

## Fitur ringkas

- **Start/Finish presisi per-shift** dengan klasifikasi jeda otomatis
  (Non-Produksi) dan konfirmasi mulai aktual (Dandori tercatat otomatis).
- **Multi-stasiun** — Tandem (TDM Lama PA-1..5 / TDM Baru PA-6..10) & PC200t
  (PC-1, PC-2) jalan independen; mesin lain tetap 1 line.
- **Planning Produksi** — rencana part (admin/leader) vs aktual, tampil
  berdampingan per stasiun.
- **Downtime tervalidasi** — wajib pas di satu baris produksi, tidak
  boleh melintasi part lain.
- **Riwayat gabungan** dengan filter tanggal & Part Number.
- **Dropdown custom** (Part Number, Problem, Proses Selanjutnya) — bukan
  `<datalist>` bawaan, konsisten di HP maupun desktop.
- **Mode offline** — data baru tetap tersimpan tanpa sinyal, disinkron
  otomatis saat online lagi.
- **PWA** — bisa diinstall dari HP seperti app biasa.

## Struktur project

```
├── login.html / index.html
├── manifest.json / service-worker.js          # PWA
├── schema.sql                                  # Jalankan sekali (project baru)
├── seed.sql                                     # Isi awal Part Number & Problem
├── migration_*.sql                              # Jalankan berurutan kalau Supabase sudah berjalan
├── machines/*.html                              # 5 halaman mesin
└── assets/
    ├── style.css
    ├── supabaseClient.js                        # ISI URL & KEY SUPABASE DI SINI
    └── machine-page.js
```

## Kalau ada bug/error

Kirim screenshot **tab Console** di browser (`F12` → Console) — itu paling
cepat untuk saya lacak penyebabnya.
