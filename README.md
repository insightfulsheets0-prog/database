# Sistem Input Produksi & Downtime

Aplikasi web (HTML + Alpine.js + Supabase) untuk mencatat data produksi dan
downtime 5 mesin. Bisa diinstall di HP (PWA) dan tetap bisa dipakai tanpa
sinyal (mode offline).

---

## 🔧 Yang perlu dikerjakan sekarang (tab Performance terpisah + grafik + koreksi GSPH)

**Tidak ada perubahan database.**

**Upload semua file** ke GitHub (banyak yang berubah, paling aman timpa
seluruh isi folder).

### Yang berubah
- **Tab baru "Performance"** (terpisah dari Riwayat Produksi) — isinya
  **3 bagian sekaligus**: Tahunan, Bulanan, Harian — masing-masing punya
  navigasi ← Sebelumnya / Berikutnya → sendiri-sendiri, tidak saling
  toggle.
- Tiap bagian sekarang tampil **angka + grafik batang** (tren GSPH
  beberapa periode terakhir — 5 tahun / 12 bulan / 14 hari).
- **Koreksi bug GSPH**: sebelumnya stroke part "separating" (pasangan,
  waktu sama) ke-dobel-hitung. Sekarang dihitung sekali per waktu
  produksi, sesuai cara sumber datanya sendiri menghitung.
- **Angka besar sekarang pakai pemisah ribuan** (14,000 bukan 14000) di
  tabel Riwayat maupun panel Performance.

---

## Ringkasan pembaruan sebelumnya
Setelah upload → redeploy → hard refresh:
- Saat status **Non-Produksi berjalan** (misal "Meeting Akhir Shift"),
  sekarang ada **2 tombol**: **"Mulai Produksi"** (kalau part berikutnya
  langsung dikerjakan) dan **"Selesai (Tutup Shift)"** (kalau mesin
  memang berhenti beroperasi sampai shift berikutnya — mengakhiri
  operasi hari itu tanpa membuka fase produksi baru).

---

## Ringkasan framework Start/Finish (dari rebuild sebelumnya)

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
