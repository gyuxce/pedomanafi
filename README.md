# ATLAS — Live Chat Knowledge System

MVP aplikasi internal untuk membantu Agent Live Chat menemukan pedoman yang tepat dan memberi Admin/KM ruang untuk mengelola konten.

## Jalankan di lokal

```bash
npm install
npm run dev
```

Buka `http://localhost:3000`.

Login menggunakan akun internal Supabase dengan role Agent, Admin, atau Quality. Tombol demo tidak tersedia pada deployment production.

## Pemeriksaan kualitas

```bash
npm run lint
npm run build
```

## Struktur penting

- `src/app/page.tsx` — shell aplikasi, halaman Agent, Admin, import, dan review.
- `src/app/globals.css` — design system dan responsive layout.
- `src/lib/mock-data.ts` — data contoh untuk UAT awal.
- `index.html` — preview wireframe statis lama.
- `wireframes/ekb-agent-admin-wireframe.html` — source fragment wireframe.
- `Mapping-Excel-ke-EKB.md` — aturan pemetaan dan pengecualian bulk import.
- `scripts/convert_afi_xlsx_to_ekb_csv.py` — converter workbook ke CSV import.

## Roadmap tahap berikutnya

1. Hubungkan login berbasis role ke Supabase Auth.
2. Tambahkan tabel pedoman, versi, audit log, dan RLS di Supabase.
3. Ganti mock data dengan pencarian PostgreSQL dan detail pedoman produksi.
4. Sambungkan import Excel ke staging, validasi, review, dan publish.
