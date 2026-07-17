# Sistem Input Produksi & Downtime

Aplikasi web (HTML + Alpine.js + Supabase) untuk mencatat data produksi dan
downtime 5 mesin: Tandem, Blanking, Transfer 2000t, Transfer 800t, PC200t.
Tidak butuh `npm install` — semua library dipanggil lewat CDN. Bisa
di-install seperti app di HP (PWA), dan tetap bisa dipakai walau sinyal
sedang tidak ada (mode offline).

## 1. Setup Supabase (5 menit)

1. Buat akun & project baru di https://supabase.com (gratis).
2. Buka **SQL Editor** di dashboard Supabase → tempel isi file `schema.sql`
   dari folder ini → klik **Run**. Ini membuat semua tabel yang dibutuhkan,
   termasuk tabel master data untuk dropdown Part Number & Problem.
3. Lanjut tempel isi file **`seed.sql`** → klik **Run** — ini mengisi
   dropdown Part Number & Problem dengan data dari Excel lama Anda supaya
   langsung terisi, tidak mulai dari kosong.
4. Buka **Project Settings > API Keys** → salin:
   - `Project URL` (ada di tab **Connect**, atau atas halaman API Keys)
   - Kunci untuk client-side: kalau project baru, pakai
     **`sb_publishable_...`** (tab *Publishable and secret API keys*); kalau
     project lama, pakai `anon public` di tab *Legacy API Keys*. Keduanya
     dipakai dengan cara yang sama.
5. Buka file `assets/supabaseClient.js`, ganti:
   ```js
   const SUPABASE_URL = "GANTI_DENGAN_PROJECT_URL_ANDA";
   const SUPABASE_ANON_KEY = "GANTI_DENGAN_ANON_KEY_ANDA";
   ```
   dengan nilai yang Anda salin tadi.
6. (Disarankan untuk internal tool) Matikan verifikasi email supaya user
   bisa langsung login setelah daftar: **Authentication > Providers >
   Email** → matikan "Confirm email".

**Kalau Supabase Anda sudah berjalan sebelumnya** (sudah ada data produksi),
jangan run `schema.sql` dari awal lagi (akan error karena tabel lama sudah
ada). Cukup jalankan **`migration_add_master_data.sql`** untuk nambah dua
tabel baru (part number & problem), lalu `seed.sql`.

## 2. Coba lokal dulu (opsional)

Karena semua file di sini pakai `<script>` tag biasa (bukan ES module),
Anda tidak perlu server apa pun — klik kanan `login.html` → **Open with**
→ Chrome/Edge, lalu coba daftar akun langsung dari situ. Tekan `F12` →
tab **Console** kalau ada error yang perlu dicek.

## 3. Deploy gratis ke Vercel via GitHub

1. Buat repo baru di GitHub → beri nama bebas → **Public** atau **Private**
   sama-sama boleh.
2. Masuk ke tab **Code** repo Anda → cari link **"uploading an existing
   file"** (kalau repo masih kosong) atau tombol hijau **Add file > Upload
   files** (kalau sudah ada isinya).
3. **Penting:** buka folder project ini di komputer Anda, **select semua
   isinya** (`login.html`, `index.html`, `schema.sql`, `seed.sql`,
   `migration_add_master_data.sql`, `manifest.json`, `service-worker.js`,
   `README.md`, folder `assets`, folder `machines`) — **jangan** drag
   folder pembungkusnya sendiri, supaya semua file mendarat di root repo,
   bukan terbungkus satu folder lagi.
4. Commit changes.
5. Buka https://vercel.com → login pakai akun GitHub → **Add New Project**
   → pilih repo tadi → **Deploy**. Tidak perlu ubah setting apa pun.
6. **Wajib dicek:** buka project di Vercel → **Settings > Deployment
   Protection** → pastikan **Vercel Authentication** dalam keadaan
   **Disabled**. Kalau menyala, app tidak bisa diakses publik/dari HP
   (file CSS/JS akan diblokir).
7. Pakai URL **Production** yang stabil (cek di **Settings > Domains**),
   jangan URL per-deployment yang kodenya berubah tiap upload.

## 4. Cara pakai

1. Buka `login.html` (atau URL Vercel Anda) → klik **Daftar di sini** untuk
   buat akun pertama (jadi operator secara default).
2. Untuk menjadikan seseorang **admin**: Supabase Dashboard → **Table
   Editor > profiles** → ubah kolom `role` jadi `admin`.
3. Pilih mesin dari sidebar → tab **Produksi** atau **Downtime**.
4. Semua user bisa **edit** dan **hapus** baris data apa pun.

## 5. Cara pakai fitur baru

**Timer Start/Stop** — menggantikan input waktu manual untuk data baru:
- Klik **▶ Mulai** saat produksi/downtime dimulai — waktu awal otomatis
  tercatat.
- Form (Part Number, Qty, Routing, dst untuk produksi; Kategori/Problem
  untuk downtime) langsung muncul dan bisa diisi sambil proses berjalan.
- Klik **⏹ Selesai** saat selesai — waktu akhir tercatat.
- Klik **Simpan Data** untuk commit ke database.
- Mengedit data lama tetap pakai waktu yang sudah tersimpan (tidak pakai
  timer, karena itu untuk koreksi data, bukan pencatatan baru).

**Routing (Tandem 1-8, PC200t 1-2)** — muncul di form Produksi:
1. Pilih **WIP** atau **FG** dulu.
2. Setelah itu tombol angka routing muncul — bisa tap lebih dari satu
   angka sekaligus.

**Dropdown Part Number & Problem** — ketik untuk mencari dari daftar yang
sudah ada (hasil seed dari Excel lama), atau ketik nilai baru yang belum
ada di daftar — otomatis tersimpan untuk dipakai lagi di kemudian hari,
tidak perlu tambah manual dulu di Supabase.

**Mode offline** — kalau sinyal hilang saat isi form:
- Data yang baru (bukan edit) tetap bisa disimpan — muncul badge
  **⏳ Belum sinkron** di tabel riwayat.
- Begitu HP terhubung internet lagi, data otomatis terkirim ke Supabase
  (dicoba setiap 20 detik, dan langsung dicoba saat koneksi kembali).
- Indikator 🟢 Online / 🔴 Offline ada di pojok kiri bawah (sidebar).
- **Catatan:** ini menampung data di penyimpanan browser HP tsb, jadi
  jangan hapus data browser/cache sebelum data sempat tersinkron. Edit dan
  hapus data tetap butuh koneksi aktif (tidak diantrikan offline).

## 6. Install sebagai app di HP (PWA)

Bisa di-"install" dari browser HP dan buka seperti app biasa (ikon di
homescreen, layar penuh), tanpa Play Store/App Store. Syaratnya app harus
online lewat HTTPS (setelah deploy ke Vercel).

**Android (Chrome):** buka URL Vercel Anda → login → Chrome menampilkan
banner **"Install app"** di bawah, atau menu titik tiga (⋮) → **Install
app**.

**iPhone (Safari):** buka URL Vercel Anda di Safari → ikon **Share** →
**"Add to Home Screen"**.

Setelah ter-install: tampilan full-screen, menu hamburger (☰) menggantikan
sidebar, target tombol/input diperbesar untuk operator di lapangan.

## 7. Struktur project

```
├── login.html                    # Halaman login & daftar akun
├── index.html                     # Dashboard / menu pilih mesin
├── manifest.json                   # Identitas PWA (ikon, nama app)
├── service-worker.js               # Bikin app bisa di-install + cache tampilan
├── schema.sql                      # Jalankan sekali di Supabase (project baru)
├── migration_add_master_data.sql   # Jalankan ini kalau Supabase sudah berjalan
├── seed.sql                        # Isi awal dropdown Part Number & Problem
├── machines/
│   ├── tandem.html
│   ├── blanking.html
│   ├── transfer-2000t.html
│   ├── transfer-800t.html
│   └── pc200t.html
└── assets/
    ├── style.css                   # Tema tampilan
    ├── supabaseClient.js           # ISI URL & KEY SUPABASE ANDA DI SINI
    ├── machine-page.js             # Logika CRUD + timer + offline queue
    └── icons/                      # Ikon PWA
```

## 8. Import data lama dari Excel (opsional)

Data lama di `Data_Downtime.xlsx` dan `Data_Laporan_Produksi.xlsx` bisa
dimasukkan ke Supabase dengan export CSV per sheet lalu **Table Editor >
Insert > Import data from CSV** di Supabase — kolom spesifik mesin (mis.
`top_coil`) masuk sebagai JSON di kolom `extra`. Kalau datanya banyak dan
rumit, lebih gampang minta bantuan lagi untuk dibuatkan script import
otomatis.

## 9. Kenapa arsitektur ini dipilih

- **Supabase** = database Postgres asli, cepat walau data ribuan baris,
  plus REST API otomatis & sistem login bawaan.
- **Alpine.js** = alternatif ringan dari React, cukup tag `<script>`.
- **Vercel + GitHub** = hosting gratis, auto-deploy setiap `git push`.
- **Row Level Security (RLS)** di Supabase = aturan akses ditegakkan di
  database, bukan cuma di kode frontend.
- **Antrian offline di localStorage** = sederhana dan cukup untuk skala
  pemakaian ini, tanpa perlu library tambahan.
