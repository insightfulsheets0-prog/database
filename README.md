# Sistem Input Produksi & Downtime

Aplikasi web sederhana (HTML + Alpine.js + Supabase) untuk mencatat data
produksi dan downtime 5 mesin: Tandem, Blanking, Transfer 2000t,
Transfer 800t, PC200t. Tidak butuh `npm install` — semua library dipanggil
lewat CDN.

## 1. Setup Supabase (5 menit)

1. Buat akun & project baru di https://supabase.com (gratis).
2. Buka **SQL Editor** di dashboard Supabase → tempel isi file `schema.sql`
   dari folder ini → klik **Run**.
3. Buka **Project Settings > API** → salin:
   - `Project URL`
   - `anon public` key
4. Buka file `assets/supabaseClient.js` di project ini, ganti:
   ```js
   const SUPABASE_URL = "GANTI_DENGAN_PROJECT_URL_ANDA";
   const SUPABASE_ANON_KEY = "GANTI_DENGAN_ANON_KEY_ANDA";
   ```
   dengan nilai yang Anda salin tadi.
5. (Opsional, disarankan untuk internal tool) Matikan verifikasi email supaya
   user bisa langsung login setelah daftar:
   **Authentication > Providers > Email** → matikan "Confirm email".

## 2. Coba lokal dulu (opsional)

Buka folder ini dengan **Live Server** (ekstensi VS Code) atau jalankan:
```bash
python3 -m http.server 8000
```
lalu buka `http://localhost:8000/login.html`.

## 3. Deploy gratis ke Vercel via GitHub

1. Buat repo baru di GitHub, upload semua isi folder ini (drag & drop file
   di GitHub web juga bisa, tidak perlu command line kalau belum terbiasa).
2. Buka https://vercel.com → login pakai akun GitHub → **Add New Project**
   → pilih repo yang barusan dibuat → **Deploy**.
   (Vercel otomatis mendeteksi ini sebagai static site, tidak perlu setting apa-apa.)
3. Selesai — Anda dapat URL seperti `https://nama-project.vercel.app`.
4. Setiap kali Anda push perubahan ke GitHub, Vercel otomatis deploy ulang.

## 4. Cara pakai

1. Buka `login.html` (atau URL Vercel Anda) → klik **Daftar di sini** untuk
   buat akun pertama (jadi operator secara default).
2. Untuk menjadikan seseorang **admin**: buka Supabase Dashboard →
   **Table Editor > profiles** → cari baris user tsb → ubah kolom `role`
   jadi `admin`.
3. Setelah login, pilih mesin dari sidebar → isi form **Produksi** atau
   **Downtime** → data langsung tersimpan & tampil di tabel riwayat.
4. Semua user (admin & operator) bisa **edit** dan **hapus** baris data
   apa pun (sesuai yang diminta).

## 5. Struktur project

```
├── login.html              # Halaman login & daftar akun
├── index.html               # Dashboard / menu pilih mesin
├── schema.sql                # Jalankan sekali di Supabase SQL Editor
├── machines/
│   ├── tandem.html
│   ├── blanking.html
│   ├── transfer-2000t.html
│   ├── transfer-800t.html
│   └── pc200t.html
└── assets/
    ├── style.css              # Tema tampilan
    ├── supabaseClient.js       # ISI URL & KEY SUPABASE ANDA DI SINI
    └── machine-page.js         # Logika CRUD (dipakai semua halaman mesin)
```

## 6. Import data lama dari Excel (opsional)

Data lama di `Data_Downtime.xlsx` dan `Data_Laporan_Produksi.xlsx` bisa
dimasukkan ke Supabase dengan:
1. Export tiap sheet Excel jadi CSV.
2. Rapikan nama kolom supaya cocok dengan tabel (`waktu_awal`, `waktu_akhir`,
   `part_number`, `qty`, dst — kolom spesifik mesin seperti `rout_pa1` masuk
   sebagai JSON di kolom `extra`, format: `{"rout_pa1": 1, "rout_pa2": 2}`).
3. Di Supabase: **Table Editor > production_log (atau downtime_log) >
   Insert > Import data from CSV**.

Kalau datanya banyak dan formatnya rumit, lebih gampang minta bantuan lagi
untuk membuatkan script import otomatis dari file Excel langsung ke Supabase.

## 7. Kenapa arsitektur ini dipilih

- **Supabase** = database Postgres asli (bukan spreadsheet), jadi cepat
  walau data ribuan baris, plus REST API otomatis & sistem login bawaan.
- **Alpine.js** = alternatif ringan dari React, cukup dengan tag `<script>`,
  cocok untuk yang baru bisa HTML/JS dasar.
- **Vercel + GitHub** = hosting gratis, auto-deploy setiap `git push`, tidak
  perlu server sendiri.
- **Row Level Security (RLS)** di Supabase = aturan akses ditegakkan di
  database, bukan cuma di kode frontend — lebih aman.
