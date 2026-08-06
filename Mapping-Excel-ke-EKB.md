# Mapping Excel ke E-Knowledge Base

Dokumen ini menjadi aturan impor awal dari workbook AFI ke struktur EKB. Admin tidak perlu mengetik ulang ribuan baris.

## Hasil pembacaan workbook

| Kelompok | Jumlah | Perlakuan |
|---|---:|---|
| Sheet pedoman produk yang terlihat | 8 sheet / 1.789 baris sumber | Diubah menjadi artikel EKB |
| Sheet aturan khusus yang terlihat | 5 sheet / 57 baris sumber | Diubah menjadi artikel khusus |
| Sheet produk tersembunyi/arsip | 2 sheet / 157 baris | Tidak diimpor sesuai keputusan produk arsip |
| Sheet taxonomy/aturan pendukung | 5 sheet | Tidak menjadi artikel; dipakai sebagai referensi validasi |

Total sumber yang diproses adalah **1.846 baris**. Karena beberapa baris Excel memiliki dua cabang tindakan, converter menghasilkan 1.908 varian sebelum deduplikasi dan 1.890 artikel setelah 18 duplikat persis digabungkan.

Temuan yang perlu diberi status **Perlu diperiksa**:

- 79 baris pedoman standar belum memiliki kondisi pelanggan.
- 9 baris merupakan duplikat persis.
- 59 baris pedoman standar memiliki dua cabang hasil: selesai di Tier 1 dan eskalasi. Baris seperti ini dipecah menjadi dua varian agar agent tidak bingung memilih tindakan.

## Sumber yang diimpor

### Pedoman produk standar

Sheet yang terlihat dan diproses:

- Akulaku Paylater (Internal)
- Openpay (Online)
- Openpay (Offline)
- Akulaku Paylater Di Toko
- Cicilan Motor Listrik
- Lazada PayLater
- TikTok PayLater
- General

### Aturan khusus

- OJK Special Case
- Transfer chat/call ke ASI
- Special TreatmentReminder
- Anomali TicketCase
- Other App Contact

### Tidak diimpor sebagai artikel

- Raw Data
- List
- List (New)
- Logika Pembuatan Tiket
- Ketentuan Verifikasi Data
- Sheet tersembunyi yang merupakan produk arsip

## Mapping kolom pedoman standar

| Kolom Excel | Field EKB | Aturan |
|---|---|---|
| Nama sheet | Produk | Nama sheet menjadi produk; `General` menjadi produk umum |
| A: CATEGORY | Kategori | Nilai kosong mengikuti kategori terakhir di atas |
| B: SUB TIPE TIKET | Sub tipe tiket | Nilai kosong mengikuti sub tipe terakhir di atas |
| C: Kondisi Pelanggan | Kondisi pelanggan + probing awal | Menjadi alasan pencarian agent dan checklist awal karena workbook belum memiliki kolom probing terpisah |
| D: Skrip LIVECHAT | Skrip Live Chat | Dipakai di tampilan Agent |
| E: Skrip CALL CENTER | Skrip Call Center | Disimpan sebagai referensi; tidak tampil di MVP Live Chat |
| F: Agent Operation Tier 1 | Langkah agent | Menjadi varian `Selesai di Tier 1` |
| G: Status Tiket Tier 1 | Status CRM | Dipasangkan dengan langkah Tier 1 |
| H: Agent Operation Eskalasi | Langkah agent | Menjadi varian `Eskalasi Tier 2/3` |
| I: Status Tiket Eskalasi | Status CRM | Dipasangkan dengan langkah eskalasi |

## Aturan hasil impor

1. Setiap artikel diberi `source_sheet` dan `source_row` agar dapat dilacak kembali ke Excel.
2. Artikel baru masuk sebagai **Draft** terlebih dahulu; admin/quality yang menerbitkan setelah pengecekan.
3. Jika kondisi, skrip, atau langkah agent kosong, artikel tetap disimpan tetapi diberi **Perlu diperiksa**.
4. Duplikat persis tidak dihapus diam-diam. Converter menyimpan satu baris dan mencatat jumlah sumber duplikatnya.
5. Jika satu baris memiliki cabang Tier 1 dan Tier 2/3, converter membuat dua varian dengan kondisi yang sama tetapi tindakan berbeda.
6. Jenis tindakan ditentukan dari struktur kolom, bukan dari tebakan teks:
   - H/I terisi → `Eskalasi Tier 2/3`.
   - F/G terisi tanpa H/I → `Selesai di Tier 1`.
   - Ada kata transfer ke ASI → `Transfer ke ASI`.
   - Tidak ada tindakan → `Referensi saja` dan perlu review.
7. Update sementara tidak dimasukkan ke artikel permanen. Update tersebut dibuat lewat menu **Update Sementara** dengan tanggal berakhir.

## Kolom output bulk import

Converter menghasilkan kolom berikut agar dapat dipetakan ke database/EKB:

`title`, `product`, `category`, `ticket_subtype`, `condition`, `probing_livechat`, `script_livechat`, `script_callcenter`, `agent_steps`, `crm_status`, `escalation_team`, `warning`, `resolution_type`, `priority`, `important_update`, `content_status`, `needs_review`, `review_reason`, `source_sheet`, `source_type`, `source_row`, `source_variant`, `duplicate_count`

## Catatan implementasi

Impor awal sebaiknya dilakukan sekali dari workbook ini. Setelah itu, tim hanya mengirim perubahan harian atau update sementara. Sistem dapat memakai `source_sheet + source_row + source_variant` sebagai referensi sinkronisasi tanpa meminta admin memasukkan ulang semua artikel.
