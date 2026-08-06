export type Role = "agent" | "admin";

export type OutcomeType = "tier_1" | "tier_2_3" | "transfer_asi" | "reference";

export type ScenarioOutcome = {
  id: string;
  type: OutcomeType;
  decision: string;
  agentSteps: string[];
  ticketStatus: string;
  crmProcess: string;
  escalationTeam?: string;
};

export type Guide = {
  id: string;
  productId?: string;
  product: string;
  category: string;
  subtype: string;
  title: string;
  condition: string;
  investigation: string[];
  script: string;
  outcomes: ScenarioOutcome[];
  warning?: string;
  updated: string;
  status: "Published" | "Draft" | "Perlu diperiksa";
  important?: boolean;
  sourceSheet?: string;
  sourceRow?: number;
  sourceVariant?: string;
  sourceType?: string;
  sourceCallScript?: string;
  duplicateCount?: number;
  needsReview?: boolean;
  reviewReason?: string;
};

export type ProductCategory = {
  id: string;
  name: string;
  description: string;
};

export type Product = {
  id: string;
  name: string;
  shortName: string;
  categories: ProductCategory[];
};

export const products: Product[] = [
  {
    id: "akulaku-internal",
    name: "Akulaku Paylater Internal",
    shortName: "Akulaku Internal",
    categories: [
      { id: "limit", name: "Limit", description: "Tidak bisa transaksi, pengajuan, dan informasi limit." },
      { id: "tagihan-pembayaran", name: "Tagihan & Pembayaran", description: "Cicilan, tagihan, pembayaran, bunga, dan denda." },
      { id: "collection", name: "Collection", description: "Penagihan, kode pembayaran, dan pelunasan." },
      { id: "slik", name: "SLIK", description: "Laporan SLIK dan informasi pelapor." },
      { id: "akun", name: "Akun", description: "Pengkinian data, tanda tangan, dan akses akun." },
      { id: "fraud", name: "Fraud", description: "Penyalahgunaan akun dan indikasi penipuan." },
      { id: "refund", name: "Refund & Penarikan Dana", description: "Saldo, refund, dan penarikan dana." },
      { id: "asuransi", name: "Produk Asuransi", description: "Informasi dan pembatalan produk asuransi." },
    ],
  },
  {
    id: "openpay-online",
    name: "Openpay Online",
    shortName: "Openpay Online",
    categories: [
      { id: "tagihan-pembayaran", name: "Tagihan & Pembayaran", description: "Pembayaran, QRIS online, DP, dan transaksi." },
      { id: "limit", name: "Limit", description: "Transaksi, pengajuan, dan informasi limit." },
      { id: "collection", name: "Collection", description: "Penagihan dan pelunasan." },
      { id: "slik", name: "SLIK", description: "Informasi laporan SLIK." },
      { id: "fraud", name: "Fraud", description: "Penyalahgunaan akun dan penipuan." },
      { id: "asuransi-online", name: "Asuransi Transaksi Online", description: "Informasi dan pembatalan asuransi transaksi." },
    ],
  },
  {
    id: "openpay-offline",
    name: "Openpay Offline",
    shortName: "Openpay Offline",
    categories: [
      { id: "tagihan-pembayaran", name: "Tagihan & Pembayaran", description: "QRIS, KASPRO, In-Store, tagihan, dan pembayaran." },
      { id: "limit", name: "Limit", description: "Transaksi, pengajuan, dan informasi limit." },
      { id: "collection", name: "Collection", description: "Penagihan dan pelunasan." },
      { id: "slik", name: "SLIK", description: "Informasi laporan SLIK." },
      { id: "fraud", name: "Fraud", description: "Penyalahgunaan akun dan penipuan." },
      { id: "protection-gadget", name: "Akulaku Protection Gadget", description: "Informasi dan pembatalan proteksi gadget." },
      { id: "akujaga", name: "AkuJaga", description: "Akulaku Jaminan Angsuran." },
      { id: "akusiaga", name: "AkuSiaga", description: "Asuransi Perlindungan Isi Rumah." },
    ],
  },
  {
    id: "paylater-toko",
    name: "Akulaku Paylater di Toko",
    shortName: "Paylater di Toko",
    categories: [
      { id: "tagihan-pembayaran", name: "Tagihan & Pembayaran", description: "Transaksi toko, pembayaran, dan tagihan." },
      { id: "limit", name: "Limit", description: "Transaksi, pengajuan, dan informasi limit." },
      { id: "collection", name: "Collection", description: "Penagihan dan pelunasan." },
      { id: "slik", name: "SLIK", description: "Informasi laporan SLIK." },
      { id: "fraud", name: "Fraud", description: "Penyalahgunaan akun dan penipuan." },
      { id: "asuransi", name: "Produk Perlindungan", description: "Protection Gadget, AkuJaga, dan AkuSiaga." },
    ],
  },
  {
    id: "cicilan-motor",
    name: "Cicilan Motor Listrik",
    shortName: "Cicilan Motor",
    categories: [
      { id: "tagihan-pembayaran", name: "Tagihan & Pembayaran", description: "Cicilan, pembayaran, dan tagihan." },
      { id: "limit", name: "Limit", description: "Transaksi dan informasi limit." },
      { id: "collection", name: "Collection", description: "Penagihan dan pelunasan." },
      { id: "slik", name: "SLIK", description: "Informasi laporan SLIK." },
      { id: "fraud", name: "Fraud", description: "Penyalahgunaan akun dan penipuan." },
      { id: "asuransi-motor", name: "Asuransi Cicilan Motor", description: "Informasi asuransi motor listrik." },
    ],
  },
  {
    id: "lazada-paylater",
    name: "Lazada PayLater",
    shortName: "Lazada",
    categories: [
      { id: "tagihan-pembayaran", name: "Tagihan & Pembayaran", description: "Pembayaran, transaksi, dan tagihan." },
      { id: "limit", name: "Limit", description: "Limit dan status pengajuan." },
      { id: "collection", name: "Collection", description: "Penagihan dan pelunasan." },
      { id: "slik", name: "SLIK", description: "Informasi laporan SLIK." },
      { id: "fraud", name: "Fraud", description: "Penyalahgunaan akun dan penipuan." },
      { id: "akun", name: "Akun", description: "Akses dan informasi akun." },
      { id: "refund", name: "Refund & Penarikan Dana", description: "Refund saldo dan tagihan setelah pembatalan." },
      { id: "lain", name: "Informasi Lainnya", description: "Fitur dan pendanaan Lazada PayLater." },
    ],
  },
  {
    id: "tiktok-paylater",
    name: "TikTok PayLater",
    shortName: "TikTok",
    categories: [
      { id: "tagihan-pembayaran", name: "Tagihan & Pembayaran", description: "Pembayaran, transaksi, dan tagihan." },
      { id: "limit", name: "Limit", description: "Limit dan status pengajuan." },
      { id: "collection", name: "Collection", description: "Penagihan dan pelunasan." },
      { id: "slik", name: "SLIK", description: "Informasi laporan SLIK." },
      { id: "fraud", name: "Fraud", description: "Penyalahgunaan akun dan penipuan." },
      { id: "akun", name: "Akun", description: "Akses dan informasi akun." },
      { id: "refund", name: "Refund & Penarikan Dana", description: "Refund saldo dan penarikan dana." },
      { id: "fast-billing", name: "Fast Billing Service", description: "Permintaan pelunasan cepat tagihan." },
    ],
  },
  {
    id: "general",
    name: "General",
    shortName: "General",
    categories: [
      { id: "informasi-umum", name: "Informasi Umum", description: "Pertanyaan umum di luar produk tertentu." },
      { id: "akun", name: "Akun", description: "Informasi akun dan kontak darurat." },
      { id: "slik", name: "SLIK", description: "Informasi SLIK OJK." },
      { id: "collection", name: "Collection", description: "Penagihan dan surat pelunasan." },
      { id: "fraud", name: "Fraud", description: "Penyalahgunaan akun." },
      { id: "keamanan", name: "Keamanan Akun", description: "Keamanan dan akses akun." },
      { id: "email", name: "Email", description: "Panduan komunikasi email." },
      { id: "call-history", name: "Call History", description: "Referensi riwayat interaksi." },
    ],
  },
];

export const guides: Guide[] = [
  {
    id: "paylater-cicilan-belum-masuk",
    productId: "akulaku-internal",
    product: "Akulaku Paylater Internal",
    category: "Tagihan & Pembayaran",
    subtype: "Pembayaran Cicilan Belum Masuk Sistem",
    title: "Pembayaran cicilan belum masuk lebih dari 1x24 jam",
    condition: "Pelanggan sudah melakukan pembayaran cicilan lebih dari 1x24 jam, tetapi pembayaran belum masuk dan tagihan masih tampil.",
    investigation: ["Minta nomor pesanan atau kontrak.", "Minta bukti pembayaran yang terlihat jelas.", "Pastikan tanggal, nominal, dan metode pembayaran.", "Pastikan sudah melewati 1x24 jam."],
    script: "Untuk menindaklanjuti kendala yang Kakak alami, mohon mengirimkan bukti pembayaran yang menampilkan tanggal, nominal, serta metode pembayaran.",
    outcomes: [
      { id: "cicilan-tier1", type: "tier_1", decision: "Pilih jika status pembayaran sudah masuk dan tagihan sudah diperbarui setelah pengecekan.", agentSteps: ["Konfirmasi pembayaran telah diterima.", "Sampaikan tagihan akan diperbarui sesuai status yang tampil.", "Catat hasil pengecekan pada percakapan."], ticketStatus: "Kategori Percakapan", crmProcess: "Tidak perlu eskalasi. Tutup percakapan setelah pelanggan menerima informasi." },
      { id: "cicilan-tier2", type: "tier_2_3", decision: "Pilih jika bukti lengkap, sudah melewati 1x24 jam, tetapi pembayaran belum masuk di console.", agentSteps: ["Terima dan periksa bukti pembayaran.", "Cek status pembayaran pada console.", "Buat tiket dengan bukti dan detail transaksi.", "Jangan menjanjikan waktu penyelesaian sebelum ada konfirmasi tim tujuan."], ticketStatus: "Menunggu Diproses", crmProcess: "Buat tiket eskalasi dan lampirkan bukti pembayaran, tanggal, nominal, serta metode pembayaran.", escalationTeam: "CS FU Jakarta" },
    ],
    warning: "Jangan menjanjikan waktu penyelesaian sebelum ada konfirmasi dari tim tujuan.",
    updated: "10:15 hari ini",
    status: "Published",
    important: true,
  },
  {
    id: "paylater-info-tagihan",
    productId: "akulaku-internal",
    product: "Akulaku Paylater Internal",
    category: "Tagihan & Pembayaran",
    subtype: "Informasi tagihan, bunga, dan denda",
    title: "Pelanggan menanyakan tagihan, bunga, atau denda",
    condition: "Pelanggan meminta penjelasan nominal tagihan, bunga, denda, atau tanggal jatuh tempo.",
    investigation: ["Pastikan produk dan periode tagihan yang ditanyakan.", "Cek nominal serta status tagihan pada console.", "Pastikan tidak ada pembayaran yang masih diproses."],
    script: "Baik Kak, kami bantu jelaskan rincian tagihannya. Mohon tunggu sebentar, kami cek terlebih dahulu ya.",
    outcomes: [
      { id: "info-tagihan-tier1", type: "tier_1", decision: "Pilih jika informasi pada console sudah sesuai dengan pertanyaan pelanggan.", agentSteps: ["Jelaskan nominal, periode, dan jatuh tempo sesuai data.", "Sampaikan informasi bunga atau denda sesuai ketentuan yang berlaku."], ticketStatus: "Kategori Percakapan", crmProcess: "Berikan informasi dan tutup percakapan setelah pelanggan memahami penjelasan." },
    ],
    updated: "10:15 hari ini",
    status: "Published",
  },
  {
    id: "paylater-limit-transaksi",
    productId: "akulaku-internal",
    product: "Akulaku Paylater Internal",
    category: "Limit",
    subtype: "Tidak Bisa Transaksi Namun Memiliki Limit",
    title: "Tidak bisa transaksi meski memiliki limit",
    condition: "Pelanggan memiliki limit yang terlihat aktif, tetapi transaksi Paylater tidak dapat dilakukan.",
    investigation: ["Pastikan merchant dan nominal transaksi.", "Cek limit tersedia dan status akun.", "Tanyakan pesan error yang muncul di aplikasi."],
    script: "Mohon maaf atas kendalanya, Kak. Kami bantu cek status limit dan transaksi yang Kakak lakukan terlebih dahulu ya.",
    outcomes: [
      { id: "limit-tier1", type: "tier_1", decision: "Pilih jika kendala berasal dari ketentuan transaksi yang dapat dijelaskan ke pelanggan.", agentSteps: ["Sampaikan alasan transaksi tidak dapat diproses sesuai hasil pengecekan.", "Arahkan pelanggan mencoba kembali bila syarat transaksi sudah sesuai."], ticketStatus: "Kategori Percakapan", crmProcess: "Tidak perlu tiket apabila tidak ada indikasi kesalahan sistem." },
      { id: "limit-tier2", type: "tier_2_3", decision: "Pilih jika limit aktif, syarat transaksi sesuai, dan error tetap terjadi.", agentSteps: ["Kumpulkan screenshot error dan detail transaksi.", "Buat tiket dengan hasil pengecekan limit."], ticketStatus: "Menunggu Diproses", crmProcess: "Eskalasi tiket dengan detail merchant, nominal, waktu, dan pesan error.", escalationTeam: "Tim Produk Paylater" },
    ],
    updated: "Kemarin, 16:20",
    status: "Published",
  },
  {
    id: "openpay-qris-gagal",
    productId: "openpay-offline",
    product: "Openpay Offline",
    category: "Tagihan & Pembayaran",
    subtype: "Kendala QRIS",
    title: "Pembayaran QRIS gagal dan transaksi tidak selesai",
    condition: "Pelanggan gagal melakukan pembayaran melalui QRIS dan transaksi tidak selesai.",
    investigation: ["Tanyakan waktu transaksi dan nama merchant.", "Minta pesan error atau screenshot yang muncul.", "Pastikan tidak ada transaksi sukses ganda.", "Tanyakan apakah saldo pelanggan sudah terpotong."],
    script: "Mohon maaf atas kendalanya, Kak. Mohon kirimkan screenshot pesan error serta informasi merchant agar kami dapat melakukan pengecekan.",
    outcomes: [
      { id: "qris-tier1", type: "tier_1", decision: "Pilih jika transaksi tidak terbentuk dan saldo tidak terpotong.", agentSteps: ["Sampaikan transaksi belum berhasil diproses.", "Arahkan pelanggan mencoba kembali setelah koneksi dan metode pembayaran dipastikan normal."], ticketStatus: "Kategori Percakapan", crmProcess: "Tidak perlu tiket apabila tidak ada pemotongan saldo atau transaksi tertahan." },
      { id: "qris-tier2", type: "tier_2_3", decision: "Pilih jika saldo terpotong, transaksi tertahan, atau error terjadi berulang.", agentSteps: ["Kumpulkan bukti transaksi dan screenshot error.", "Catat merchant, nominal, serta waktu transaksi.", "Buat tiket eskalasi."], ticketStatus: "Kategori Percakapan", crmProcess: "Buat tiket QRIS dengan detail transaksi dan bukti yang tersedia.", escalationTeam: "Openpay Offline Support" },
    ],
    updated: "09:30 hari ini",
    status: "Published",
    important: true,
  },
  {
    id: "openpay-qris-merchant",
    productId: "openpay-offline",
    product: "Openpay Offline",
    category: "Tagihan & Pembayaran",
    subtype: "Merchant - Kendala QRIS",
    title: "Merchant mengalami kendala menerima pembayaran QRIS",
    condition: "Merchant menyampaikan QRIS tidak dapat digunakan atau transaksi pelanggan tidak terbaca di sisi merchant.",
    investigation: ["Pastikan nama dan lokasi merchant.", "Tanyakan apakah kendala terjadi pada semua pelanggan atau satu transaksi.", "Minta bukti atau screenshot dari merchant bila tersedia."],
    script: "Baik Kak, kami bantu cek kendala QRIS di merchant tersebut. Mohon informasikan nama merchant, lokasi, dan waktu transaksi ya.",
    outcomes: [
      { id: "qris-merchant-tier2", type: "tier_2_3", decision: "Gunakan setelah data merchant dan waktu kendala telah lengkap.", agentSteps: ["Kumpulkan detail merchant dan transaksi.", "Buat tiket untuk pengecekan integrasi QRIS."], ticketStatus: "Menunggu Diproses", crmProcess: "Buat tiket merchant QRIS dengan nama merchant, lokasi, waktu, dan bukti kendala.", escalationTeam: "Openpay Offline Support" },
    ],
    updated: "Kemarin, 13:40",
    status: "Published",
  },
  {
    id: "openpay-instore-transaksi",
    productId: "openpay-offline",
    product: "Openpay Offline",
    category: "Tagihan & Pembayaran",
    subtype: "Tidak Dapat Transaksi di In-Store Installment",
    title: "Tidak dapat transaksi di In-Store Installment",
    condition: "Pelanggan tidak dapat melanjutkan transaksi Akulaku In-Store Installment di merchant.",
    investigation: ["Pastikan merchant, nominal, dan waktu transaksi.", "Cek status limit pelanggan.", "Tanyakan pesan error dan tahap transaksi yang gagal."],
    script: "Mohon maaf atas kendalanya, Kak. Kami cek dulu status transaksi In-Store dan limit yang tersedia ya.",
    outcomes: [
      { id: "instore-tier1", type: "tier_1", decision: "Pilih jika transaksi tidak memenuhi ketentuan yang dapat dijelaskan kepada pelanggan.", agentSteps: ["Sampaikan ketentuan transaksi berdasarkan hasil pengecekan.", "Arahkan pelanggan mencoba kembali jika syarat sudah terpenuhi."], ticketStatus: "Kategori Percakapan", crmProcess: "Tidak perlu eskalasi bila tidak ditemukan error sistem." },
      { id: "instore-tier2", type: "tier_2_3", decision: "Pilih jika kelayakan transaksi sudah sesuai tetapi error tetap muncul.", agentSteps: ["Minta screenshot error.", "Catat merchant, nominal, waktu, dan limit tersedia.", "Buat tiket eskalasi."], ticketStatus: "Menunggu Diproses", crmProcess: "Buat tiket In-Store dengan bukti error dan detail transaksi.", escalationTeam: "Openpay Offline Support" },
    ],
    updated: "Kemarin, 11:25",
    status: "Published",
  },
];

export const operationalModules = [
  { id: "verifikasi", name: "Ketentuan Verifikasi Data", description: "Verifikasi sebelum membantu akun atau transaksi pelanggan." },
  { id: "logika-tiket", name: "Logika Pembuatan Tiket", description: "Pemilihan kategori, status, dan tindakan CRM." },
  { id: "transfer-asi", name: "Transfer Chat/Call ke ASI", description: "Flow untuk kendala yang perlu dialihkan ke lini ASI." },
  { id: "ojk", name: "OJK Special Case", description: "Penanganan pelanggan yang menyebut OJK atau regulator." },
  { id: "special-treatment", name: "Special Treatment / Reminder", description: "Flow pelanggan insist, high concern, dan kasus sensitif." },
  { id: "anomali", name: "Anomali Ticket Case", description: "Aturan khusus tiket yang masih berlaku." },
  { id: "other-app", name: "Other App Contact", description: "Kontak dan referensi platform lain." },
];

export const operationalGuides: Guide[] = [
  {
    id: "verifikasi-data",
    product: "Pedoman Operasional",
    category: "Ketentuan Verifikasi Data",
    subtype: "Verifikasi sebelum membantu akun",
    title: "Verifikasi data sebelum membantu akun",
    condition: "Pelanggan meminta bantuan atas akun atau transaksi yang memerlukan verifikasi data.",
    investigation: ["Ikuti pertanyaan verifikasi sesuai jenis akun.", "Jangan menyebutkan data sebelum pelanggan menjawab.", "Catat hasil verifikasi pada deskripsi tiket bila tiket dibuat."],
    script: "Sebelum kami bantu cek lebih lanjut, mohon bantu jawab beberapa pertanyaan verifikasi untuk keamanan akun Kakak.",
    outcomes: [
      { id: "verifikasi-tier1", type: "tier_1", decision: "Gunakan jika hasil verifikasi sesuai.", agentSteps: ["Lanjutkan penanganan sesuai pedoman produk.", "Jangan membuka data pelanggan sebelum verifikasi terpenuhi."], ticketStatus: "Kategori Percakapan", crmProcess: "Lanjutkan ke pedoman produk yang relevan." },
    ],
    updated: "31 Juli 2026",
    status: "Published",
  },
  {
    id: "transfer-asi",
    product: "Pedoman Operasional",
    category: "Transfer Chat/Call ke ASI",
    subtype: "Kendala bukan lini bisnis AFI",
    title: "Transfer chat ke ASI",
    condition: "Pelanggan menyampaikan kendala yang harus ditangani oleh lini bisnis ASI.",
    investigation: ["Pastikan kendala berkaitan dengan produk atau layanan ASI.", "Pastikan pelanggan memahami bahwa percakapan akan dialihkan."],
    script: "Baik Kak, kendala yang Kakak sampaikan akan kami hubungkan ke tim yang menangani. Mohon menunggu beberapa saat ya.",
    outcomes: [
      { id: "transfer-asi-outcome", type: "transfer_asi", decision: "Gunakan setelah memastikan kendala masuk lini bisnis ASI.", agentSteps: ["Pilih sub tipe Transfer chat/call ke ASI.", "Kirim makro transfer.", "Transfer chat kepada tim ASI."], ticketStatus: "Prioritas Rendah", crmProcess: "Pilih flow transfer ASI dan pindahkan percakapan kepada tim tujuan.", escalationTeam: "ASI" },
    ],
    updated: "Kemarin, 16:20",
    status: "Published",
  },
];

export const updates = [
  { title: "Skrip pembayaran diperbarui", detail: "Akulaku Paylater Internal · 10:15", tone: "warning" },
  { title: "Kontak Anti Fraud diverifikasi", detail: "Other App Contact · 09:40", tone: "success" },
  { title: "Varian kendala QRIS ditambahkan", detail: "Openpay Offline · Kemarin", tone: "info" },
];
