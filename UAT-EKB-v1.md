# UAT E-Knowledge Base v1

Dokumen ini dipakai untuk memastikan alur Agent Live Chat dan Admin sudah mudah dipakai sebelum development dimulai.

## Cara melakukan UAT

1. Gunakan wireframe di `index.html`.
2. Jalankan skenario sesuai peran.
3. Isi hasil dengan **Lulus**, **Perlu diperbaiki**, atau **Tidak dicoba**.
4. Catat masalah dengan bahasa sederhana: halaman, langkah, dan yang diharapkan.

## Skenario Agent Live Chat

| ID | Skenario | Langkah singkat | Hasil yang diharapkan | Hasil |
|---|---|---|---|---|
| A01 | Mencari pedoman dari kalimat pelanggan | Isi pencarian dengan “tagihan belum masuk”, lalu klik **Cari** | Hasil yang paling relevan muncul dengan produk, kategori, dan jenis tindakan | |
| A02 | Membuka pedoman | Klik salah satu hasil pencarian | Detail menampilkan kondisi, pertanyaan pengecekan, skrip, langkah agent, dan status CRM | |
| A03 | Menyalin skrip Live Chat | Klik **Salin skrip** | Skrip dapat ditempel ke chat pelanggan | |
| A04 | Menjalankan tindakan CRM | Buka pedoman dengan tindakan tiket, eskalasi, atau transfer | Agent melihat langkah dan tujuan yang sesuai; bagian yang tidak relevan tidak membingungkan | |
| A05 | Membaca update penting | Kembali ke Beranda dan lihat banner update | Update penting terlihat jelas sebelum agent mencari pedoman | |
| A06 | Menyimpan pedoman favorit | Klik **Favorit** pada detail pedoman | Pedoman berubah menjadi status tersimpan | |
| A07 | Memberi feedback | Pilih feedback membantu/tidak membantu | Feedback dapat dikirim tanpa mengganggu proses chat | |

## Skenario Admin / KM

| ID | Skenario | Langkah singkat | Hasil yang diharapkan | Hasil |
|---|---|---|---|---|
| B01 | Menemukan konten | Buka **Daftar Konten**, cari judul, lalu gunakan filter status/produk | Konten yang dicari mudah ditemukan | |
| B02 | Mengubah pedoman | Buka **Edit Pedoman**, ubah judul, kondisi, atau skrip | Perubahan terlihat pada form tanpa istilah teknis | |
| B03 | Mengisi tindakan agent | Ubah **Jenis tindakan** menjadi tiket, eskalasi, atau transfer | Field tambahan yang muncul hanya yang diperlukan | |
| B04 | Mengecek preview | Ubah isi form lalu lihat **Preview untuk Agent** | Preview mengikuti isi form dan mudah dibaca agent | |
| B05 | Menerbitkan perubahan | Klik **Publish** | Status berhasil terlihat dan riwayat perubahan tersimpan | |
| B06 | Membuat update sementara | Buka **Update Sementara**, isi pesan dan waktu berakhir | Pesan tampil untuk agent dan memiliki waktu berhenti otomatis | |
| B07 | Meninjau konten lama | Buka **Perlu Diperiksa**, lalu klik **Sudah diperiksa** | Konten tercatat sudah diperiksa hari ini | |

## Kriteria lulus MVP

- Minimal 90% skenario Agent lulus tanpa bantuan orang lain.
- Minimal 90% skenario Admin lulus tanpa istilah teknis atau bantuan developer.
- Tidak ada masalah yang membuat agent salah memilih tindakan CRM.
- Admin dapat membuat update sementara dalam waktu maksimal 3 menit.
- Semua masalah yang belum selesai memiliki pemilik dan rencana perbaikan.

## Catatan temuan

| Tanggal | ID skenario | Halaman | Masalah yang ditemukan | Prioritas | Pemilik | Status |
|---|---|---|---|---|---|---|
| | | | | Tinggi / Sedang / Rendah | | Terbuka / Selesai |

## Peserta yang disarankan

- 2–3 Agent Live Chat dengan pengalaman berbeda.
- 1 Admin KM yang akan melakukan update harian.
- 1 pemilik proses/quality untuk menyetujui hasil akhir.
