export type Role = "agent" | "admin";

export type Guide = {
  id: string;
  title: string;
  product: string;
  category: string;
  subtype: string;
  condition: string;
  probing: string[];
  script: string;
  steps: string[];
  resolution: "Selesai di Tier 1" | "Buat tiket" | "Eskalasi Tier 2/3" | "Transfer ke ASI";
  crmStatus: string;
  team?: string;
  updated: string;
  status: "Published" | "Draft" | "Perlu diperiksa";
  important?: boolean;
};

export const guides: Guide[] = [
  {
    id: "paylater-cicilan",
    title: "Pembayaran cicilan belum masuk lebih dari 1×24 jam",
    product: "Akulaku Paylater",
    category: "Tagihan & Pembayaran",
    subtype: "DP/Cicilan belum masuk",
    condition: "Pelanggan sudah melakukan pembayaran cicilan lebih dari 1×24 jam, tetapi pembayaran belum masuk dan tagihan masih tampil.",
    probing: ["Nomor pesanan atau kontrak", "Bukti pembayaran yang terlihat jelas", "Tanggal, nominal, dan metode pembayaran", "Pastikan sudah melewati 1×24 jam"],
    script: "Untuk menindaklanjuti kendala yang Kakak alami, mohon mengirimkan bukti pembayaran yang menampilkan tanggal, nominal, serta metode pembayaran.",
    steps: ["Terima bukti pembayaran dari pelanggan.", "Cek status pembayaran pada console.", "Buat tiket dan eskalasikan jika memenuhi syarat.", "Jangan menjanjikan waktu penyelesaian sebelum ada konfirmasi tim tujuan."],
    resolution: "Eskalasi Tier 2/3",
    crmStatus: "Menunggu Diproses",
    team: "CS FU Jakarta",
    updated: "10:15 hari ini",
    status: "Published",
    important: true,
  },
  {
    id: "qris-offline",
    title: "Gangguan pembayaran QRIS",
    product: "Openpay Offline",
    category: "Tagihan & Pembayaran",
    subtype: "Pembayaran gagal",
    condition: "Pelanggan gagal melakukan pembayaran melalui QRIS dan transaksi tidak selesai.",
    probing: ["Kapan transaksi dilakukan", "Nama merchant atau lokasi transaksi", "Pesan error yang muncul", "Bukti transaksi jika ada"],
    script: "Mohon maaf atas kendalanya, Kak. Mohon kirimkan screenshot pesan error dan informasi merchant agar kami dapat melakukan pengecekan.",
    steps: ["Kumpulkan detail transaksi.", "Pastikan tidak ada transaksi sukses ganda.", "Buat tiket jika bukti sudah lengkap."],
    resolution: "Buat tiket",
    crmStatus: "Kategori Percakapan",
    updated: "09:30 hari ini",
    status: "Published",
  },
  {
    id: "transfer-asi",
    title: "Transfer chat ke ASI",
    product: "Lintas Produk",
    category: "Transfer Chat / Call",
    subtype: "Kendala bukan lini bisnis AFI",
    condition: "Pelanggan menyampaikan kendala yang harus ditangani oleh lini bisnis ASI.",
    probing: ["Kendalanya berkaitan dengan produk apa", "Apakah ada tiket yang sudah dibuat", "Pastikan pelanggan memahami proses transfer"],
    script: "Baik Kak, kendala yang Kakak sampaikan akan kami hubungkan ke tim yang menangani. Mohon menunggu beberapa saat ya.",
    steps: ["Lakukan probing untuk memastikan kendala masuk lini ASI.", "Pilih subtipe Transfer chat/call ke ASI.", "Kirim makro transfer.", "Transfer chat kepada tim ASI."],
    resolution: "Transfer ke ASI",
    crmStatus: "Prioritas Rendah",
    team: "ASI",
    updated: "Kemarin, 16:20",
    status: "Published",
  },
  {
    id: "verifikasi-data",
    title: "Verifikasi data sebelum membantu akun",
    product: "Lintas Produk",
    category: "Verifikasi",
    subtype: "Ketentuan Verifikasi Data",
    condition: "Pelanggan meminta bantuan atas akun atau transaksi yang memerlukan verifikasi data.",
    probing: ["Ikuti pertanyaan verifikasi sesuai jenis akun", "Jangan sebutkan data sebelum pelanggan menjawab", "Catat hasil verifikasi pada deskripsi tiket"],
    script: "Sebelum kami bantu cek lebih lanjut, mohon bantu jawab beberapa pertanyaan verifikasi untuk keamanan akun Kakak.",
    steps: ["Sampaikan tujuan verifikasi.", "Ajukan pertanyaan sesuai panduan.", "Lanjutkan hanya jika hasil verifikasi memenuhi syarat."],
    resolution: "Selesai di Tier 1",
    crmStatus: "Kategori Percakapan",
    updated: "31 Juli 2026",
    status: "Published",
  },
];

export const updates = [
  { title: "Skrip pembayaran diperbarui", detail: "Akulaku Paylater · 10:15", tone: "warning" },
  { title: "Kontak Anti Fraud diverifikasi", detail: "Kontak & Referensi · 09:40", tone: "success" },
  { title: "Varian kendala QRIS ditambahkan", detail: "Openpay Offline · Kemarin", tone: "info" },
];
