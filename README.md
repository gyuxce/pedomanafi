# Pedoman AFI — Live Chat Knowledge Base

MVP aplikasi internal untuk membantu Agent Live Chat menemukan pedoman yang tepat dan memberi Admin/KM ruang untuk mengelola konten.

## Jalankan di lokal

```bash
npm install
npm run dev
```

Buka `http://localhost:3000`.

Untuk preview cepat, gunakan tombol **Agent demo** atau **Admin demo** pada halaman login. Mode demo ini belum memerlukan akun dan sengaja dipakai untuk UAT UI; autentikasi Supabase serta database produksi menjadi tahap berikutnya.

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
