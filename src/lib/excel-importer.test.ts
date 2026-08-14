import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { parseWorkbook, matchSpecialSheet, matchStandardSheet, extractImageReferences, collectImageUrls } from "./excel-importer";
import { buildOperationalModules, buildProductCatalog, categoryGuideCount } from "./guide-catalog";

function workbookBuffer(sheets: Record<string, Array<Array<string>>>) {
  const workbook = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name.slice(0, 31));
  }
  const output = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  if (output instanceof ArrayBuffer) return output;
  const bytes = output as Uint8Array;
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

const productHeaders = ["CATEGORY", "SUB TIPE TIKET", "Kondisi Pelanggan", "Skrip LIVECHAT", "Skrip CALL CENTER", "Agent Operation Tier 1", "Status Tiket Tier 1", "Agent Operation Eskalasi", "Status Tiket Eskalasi"];

test("matches truncated and punctuated sheet names", () => {
  assert.equal(matchStandardSheet("Akulaku Paylater Di Toko (AFI App)")?.productId, "paylater-toko");
  assert.equal(matchStandardSheet("TikTok PayLater ")?.productId, "tiktok-paylater");
  assert.equal(matchStandardSheet("Auto Loan")?.productId, "auto-loan");
  assert.equal(matchSpecialSheet("Transfer chat/call ke ASI"), "transfer chatcall ke asi");
  assert.equal(matchSpecialSheet(" Transfer chatcall ke ASI"), "transfer chatcall ke asi");
});

test("imports every content row including archives, extra categories, and long steps", () => {
  const longSteps = Array.from({ length: 15 }, (_, index) => `Langkah ${index + 1}`).join(" → ");
  const result = parseWorkbook(workbookBuffer({
    "Akulaku Paylater (Internal)": [
      ["Pedoman Internal"],
      ["Catatan"],
      productHeaders,
      ["Limit", "Tidak bisa transaksi", "Limit tampil tapi transaksi gagal", "Mohon kirim screenshot error", "", "Cek limit\nCek merchant", "Kategori Percakapan", "", ""],
      ["Limit"],
      ["Tagihan & Pembayaran", "Cicilan belum masuk", "Pembayaran sudah 1x24 jam belum masuk", "Mohon kirim bukti bayar", "", longSteps, "Kategori Percakapan", "Buat tiket", "Menunggu Diproses"],
      ["Kategori Baru Excel", "Subtipe baru", "Kondisi baru dari workbook", "Skrip kondisi baru", "", "Selesaikan di Tier 1", "Kategori Percakapan", "", ""],
    ],
    "Auto Loan": [
      ["Auto Loan"],
      [],
      productHeaders,
      ["Collection", "Pelunasan", "Pelanggan minta surat pelunasan auto loan", "Baik, kami bantu cek", "", "Cek kontrak", "Kategori Percakapan", "", ""],
    ],
    "Produk Baru Channel": [
      productHeaders,
      ["Akun", "Reset", "Pelanggan tidak bisa masuk aplikasi channel baru", "Mohon coba reset password", "", "Arahkan reset", "Kategori Percakapan", "", ""],
    ],
    "Transfer chatcall ke ASI": [
      ["Transfer"],
      ["Judul", "Langkah", "Peringatan", "Kosong", "Skrip live", "Skrip call"],
      ["Kendala masuk lini ASI", "Pilih flow transfer", "Jangan janji waktu", "", "Baik Kak, kami hubungkan ke tim ASI", "Makro call"],
    ],
    "List (New)": [
      ["Produk", "Kategori", "Sub Tipe", "Eskalasi"],
      ["Akulaku Paylater (Internal)", "Tagihan & Pembayaran", "Cicilan belum masuk", "Ya"],
    ],
    "Raw Data": [
      ["Dump", "Tidak jadi pedoman"],
    ],
  }), "Salinan dari (NEW) AFI Pedoman & Operasi Manual Tier 1.xlsx");

  const titles = result.guides.map((guide) => guide.title);
  assert.equal(result.summary.skippedSheets.length, 0);
  assert.ok(titles.includes("Limit tampil tapi transaksi gagal"));
  assert.ok(titles.includes("Pembayaran sudah 1x24 jam belum masuk"));
  assert.ok(titles.includes("Kondisi baru dari workbook"));
  assert.ok(titles.includes("Pelanggan minta surat pelunasan auto loan"));
  assert.ok(titles.includes("Pelanggan tidak bisa masuk aplikasi channel baru"));
  assert.ok(titles.includes("Kendala masuk lini ASI"));
  assert.equal(result.guides.filter((guide) => guide.title === "Kondisi pelanggan belum diisi").length, 0);

  const longGuide = result.guides.find((guide) => guide.title.startsWith("Pembayaran sudah"));
  assert.ok(longGuide);
  assert.equal(longGuide.outcomes.find((outcome) => outcome.type === "tier_1")?.agentSteps.length, 15);
  assert.ok(longGuide.outcomes.some((outcome) => outcome.type === "tier_2_3"));

  const catalog = buildProductCatalog(result.guides);
  const internal = catalog.find((product) => product.id === "akulaku-internal");
  const autoLoan = catalog.find((product) => product.id === "auto-loan");
  const extraProduct = catalog.find((product) => product.name === "Produk Baru Channel");
  assert.ok(internal?.categories.some((category) => category.name === "Kategori Baru Excel"));
  assert.ok(autoLoan);
  assert.ok(extraProduct);
  assert.equal(categoryGuideCount(result.guides, internal!, "Kategori Baru Excel"), 1);

  const modules = buildOperationalModules(result.guides);
  assert.ok(modules.some((module) => /transfer chat/i.test(module.name)));
});

test("keeps every screenshot URL from a single agent case", () => {
  const urls = [
    "https://ibb.co/aaa111",
    "https://ibb.co/bbb222",
    "https://drive.google.com/drive/u/0/file/d/FILEID333/view?usp=sharing",
  ];
  const packed = extractImageReferences(`SS ${urls[0]},${urls[1]}https://${urls[2].slice("https://".length)}`);
  assert.equal(packed.length, 3);

  const result = parseWorkbook(workbookBuffer({
    "Akulaku Paylater (Internal)": [
      ["Pedoman Internal"],
      ["Catatan"],
      productHeaders,
      ["Limit", "Tidak bisa transaksi", `Kendala dengan 3 screenshot\nLink: ${urls[0]},${urls[1]}`, "Mohon kirim bukti", "", "Cek console", "Kategori Percakapan", "", "", urls[2]],
      ["", "", "", "", "", "", "", "", "", "https://i.ibb.co/ccc444/ss4.png"],
    ],
  }), "afi.xlsx");

  const guide = result.guides.find((item) => item.title.includes("3 screenshot"));
  assert.ok(guide);
  assert.equal(guide.images?.length, 4);
  assert.deepEqual((guide.images ?? []).map((image) => image.label), ["Screenshot 1", "Screenshot 2", "Screenshot 3", "Screenshot 4"]);
  assert.equal(result.embeddedDrawings.mediaFiles, 0);
  assert.ok(result.qc.checks.some((check) => check.id === "pasted-images" && check.status === "pass"));
});

test("collects concatenated screenshot URLs without dropping later links", () => {
  const urls = collectImageUrls("https://ibb.co/one,https://ibb.co/twohttps://ibb.co/three");
  assert.equal(urls.filter((url) => url.includes("ibb.co/")).length, 3);
});
