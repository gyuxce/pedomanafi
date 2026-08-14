import * as XLSX from "xlsx";
import { products, type Guide, type GuideImage, type OutcomeType, type ScenarioOutcome } from "./mock-data";
import { slugifyId } from "./guide-catalog";

export type ImportIssue = {
  reason: string;
  count: number;
};

export type ImportSummary = {
  fileName: string;
  sourceRows: number;
  scenarios: number;
  outcomes: number;
  reviewCount: number;
  duplicateRows: number;
  skippedSheets: string[];
  importedAt: string;
};

export type ImportResult = {
  guides: Guide[];
  summary: ImportSummary;
  issues: ImportIssue[];
  qc: ImportQcSummary;
};

export type ImportQcStatus = "pass" | "warning" | "error";

export type ImportQcTab = {
  name: string;
  status: "imported" | "mapping" | "ignored" | "skipped";
  rows: number;
  scenarios: number;
  note: string;
};

export type ImportQcCheck = {
  id: string;
  label: string;
  status: ImportQcStatus;
  metric: string;
  detail: string;
};

export type ImportQcException = {
  id: string;
  severity: "warning" | "error";
  title: string;
  reason: string;
  sourceSheet: string;
  sourceRow?: number;
};

export type ImportQcSummary = {
  tabs: ImportQcTab[];
  checks: ImportQcCheck[];
  linkedFlows: number;
  standaloneReferences: number;
  outcomeCounts: Record<OutcomeType, number>;
  escalation: {
    yes: number;
    no: number;
    unmatched: number;
    yesWithoutTier2: number;
    noWithTier2: number;
    transferFromTier1: number;
    transferOutsideTier1: number;
  };
  exceptions: ImportQcException[];
  exceptionTotal: number;
};

type Row = string[];

const standardSheets: Record<string, { productId: string; product: string }> = {
  "akulaku paylater (internal)": { productId: "akulaku-internal", product: "Akulaku Paylater Internal" },
  "openpay (online)": { productId: "openpay-online", product: "Openpay Online" },
  "openpay (offline)": { productId: "openpay-offline", product: "Openpay Offline" },
  "akulaku paylater di toko (afi a": { productId: "paylater-toko", product: "Akulaku Paylater di Toko" },
  "akulaku paylater di toko": { productId: "paylater-toko", product: "Akulaku Paylater di Toko" },
  "cicilan motor listrik": { productId: "cicilan-motor", product: "Cicilan Motor Listrik" },
  "lazada paylater": { productId: "lazada-paylater", product: "Lazada PayLater" },
  "tiktok paylater": { productId: "tiktok-paylater", product: "TikTok PayLater" },
  general: { productId: "general", product: "General" },
  "akulaku elite card": { productId: "elite-card", product: "Akulaku Elite Card" },
  "auto loan": { productId: "auto-loan", product: "Auto Loan" },
};

const mappingSheets = new Set(["raw data", "list", "list (new)"]);

const specialSheetKeys = {
  ketentuanverifikasidata: "ketentuan verifikasi data",
  logikapembuatantiket: "logika pembuatan tiket",
  ojkspecialcase: "ojk special case",
  transferchatcallkeasi: "transfer chatcall ke asi",
  specialtreatmentreminder: "special treatmentreminder",
  anomaliticketcase: "anomali ticketcase",
  otherappcontact: "other app contact",
} as const;

type SpecialSheetKind = (typeof specialSheetKeys)[keyof typeof specialSheetKeys];

function clean(value: unknown) {
  return String(value ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function imageSourceUrl(value: string) {
  return value.replace(/[.,;:!?]+(?=\s|$)/g, "").replace(/[)\]}]+$/g, "").trim();
}

const hyperlinkMetadataPattern = /\s*\[KORA_LINK:\s*https?:\/\/[^\]]+\]\s*/gi;

function stripHyperlinkMetadata(value: string | undefined) {
  return clean(value).replace(hyperlinkMetadataPattern, " ").replace(/\s+/g, " ").trim();
}

function isImageReference(value: string) {
  return /(?:drive\.google\.com\/(?:file\/d\/|uc\?|open\?)|docs\.google\.com\/uc\?|ibb\.co\/|i\.ibb\.co\/|imgbb\.com\/|\.(?:png|jpe?g|webp|gif)(?:[?#]|$))/i.test(value);
}

function extractImageReferences(...values: Array<string | undefined>) {
  const seen = new Set<string>();
  const images: GuideImage[] = [];
  for (const value of values) {
    const urls = value?.match(/https?:\/\/[^\s<>"']+/gi) ?? [];
    for (const rawUrl of urls) {
      const url = imageSourceUrl(rawUrl);
      if (!isImageReference(url) || seen.has(url)) continue;
      seen.add(url);
      images.push({ url, label: `Screenshot ${images.length + 1}` });
    }
  }
  return images;
}

function mergeImageReferences(...groups: Array<GuideImage[] | undefined>) {
  const seen = new Set<string>();
  return groups.flatMap((group) => group ?? []).filter((image) => {
    if (!image.url || seen.has(image.url)) return false;
    seen.add(image.url);
    return true;
  }).map((image, index) => ({ ...image, label: image.label || `Screenshot ${index + 1}` }));
}

function normalized(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function compactSheetKey(value: string) {
  return normalized(value).replace(/[^a-z0-9]+/g, "");
}

function isMappingSheet(sheetName: string) {
  return mappingSheets.has(normalized(sheetName));
}

export function matchStandardSheet(sheetName: string) {
  const compact = compactSheetKey(sheetName);
  const entries = Object.entries(standardSheets);
  const exact = entries.find(([name]) => compactSheetKey(name) === compact);
  if (exact) return exact[1];
  const prefix = entries
    .filter(([name]) => {
      const known = compactSheetKey(name);
      if (known.length < 10 || compact.length < 10) return false;
      return compact.startsWith(known) || known.startsWith(compact);
    })
    .sort((left, right) => compactSheetKey(right[0]).length - compactSheetKey(left[0]).length);
  return prefix[0]?.[1];
}

export function matchSpecialSheet(sheetName: string): SpecialSheetKind | undefined {
  const compact = compactSheetKey(sheetName);
  const exact = (Object.entries(specialSheetKeys) as Array<[string, SpecialSheetKind]>).find(([key]) => key === compact);
  if (exact) return exact[1];
  const fuzzy = (Object.entries(specialSheetKeys) as Array<[string, SpecialSheetKind]>).find(([key]) => compact.includes(key) || key.includes(compact));
  return fuzzy?.[1];
}

function isHeaderLikeRow(row: Row) {
  const first = normalized(row[0] || "");
  const second = normalized(row[1] || "");
  return /^(category|kategori)$/.test(first) && /^(sub\s*tipe|subtipe|sub\s*type)\b/.test(second);
}

export function findStandardHeaderRow(rows: Row[]) {
  for (let index = 0; index < Math.min(rows.length, 10); index += 1) {
    if (isHeaderLikeRow(rows[index])) return index;
  }
  return -1;
}

function looksLikeStandardProductSheet(rows: Row[]) {
  return findStandardHeaderRow(rows) >= 0;
}

function normalizedProduct(value: string) {
  // The List (New) tab uses labels such as "Akulaku Paylater (Internal)"
  // and "Akulaku Paylater Di Toko (AFI App)", while product sheets omit
  // the parenthetical channel label. They must resolve to one key.
  return normalized(value)
    .replace(/\(\s*internal\s*\)/g, " internal")
    .replace(/\(\s*afi\s+app\s*\)/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escalationKey(product: string, category: string, subtype: string) {
  return [normalizedProduct(product), normalized(category), normalized(subtype)].join("|");
}

function readEscalationList(rows: Row[]) {
  const flags = new Map<string, "yes" | "no">();
  let product = "";
  let category = "";
  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row.some(Boolean)) continue;
    product = row[0] || product;
    category = row[1] || category;
    const subtype = row[2];
    const escalation = normalized(row[3]);
    if (!subtype || !/^(ya|yes|tidak|no)$/i.test(escalation)) continue;
    flags.set(escalationKey(product, category, subtype), /^(ya|yes)$/i.test(escalation) ? "yes" : "no");
  }
  return flags;
}

function applyEscalationFlags(guides: Guide[], flags: Map<string, "yes" | "no">) {
  for (const guide of guides) {
    const flag = flags.get(escalationKey(guide.product, guide.category, guide.subtype));
    if (!flag) continue;
    const variants = (guide.sourceVariant || "scenario").split("|").filter(Boolean);
    const baseVariant = variants[0] || "scenario";
    const auditVariants = variants.filter((variant) => variant !== "has-tier2" && !variant.startsWith("escalasi-"));
    const hasTier2Operation = variants.includes("has-tier2") || guide.outcomes.some((outcome) => outcome.type === "tier_2_3");
    guide.sourceVariant = [baseVariant, ...auditVariants, hasTier2Operation ? "has-tier2" : "", `escalasi-${flag}`].filter(Boolean).join("|");

    if (flag !== "yes") continue;

    // A source row can contain "Transfer ASI" in F/G while column H says
    // Eskalasi = Ya. Keep the source steps, but expose the decision as the
    // escalation outcome so Agent does not receive the wrong action badge.
    const transferOutcome = guide.outcomes.find((outcome) => outcome.type === "transfer_asi");
    const tier2Outcome = guide.outcomes.find((outcome) => outcome.type === "tier_2_3");
    if (!tier2Outcome && transferOutcome) {
      transferOutcome.type = "tier_2_3";
      transferOutcome.decision = "Pilih jika kondisi memenuhi syarat eskalasi pada kolom Eskalasi = Ya.";
      transferOutcome.ticketStatus = transferOutcome.ticketStatus || "Eskalasi ke Tier 2/3";
      transferOutcome.crmProcess = transferOutcome.crmProcess || "Buat tiket eskalasi dan lampirkan detail kondisi serta bukti yang tersedia.";
      transferOutcome.escalationTeam = transferOutcome.escalationTeam || "Tier 2/3";
    }
  }
  return guides;
}

function rowsForSheet(sheet: XLSX.WorkSheet): Row[] {
  const rows = (XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false }) as unknown[][]).map((row) => row.map(clean));
  const ref = sheet["!ref"];
  if (!ref) return rows;
  const range = XLSX.utils.decode_range(ref);
  for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex += 1) {
    for (let columnIndex = range.s.c; columnIndex <= range.e.c; columnIndex += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })] as XLSX.CellObject | undefined;
      const target = cell?.l?.Target?.trim();
      if (!target || !/^https?:\/\//i.test(target)) continue;
      const outputRow = rowIndex - range.s.r;
      const outputColumn = columnIndex - range.s.c;
      if (!rows[outputRow]) rows[outputRow] = [];
      const displayValue = rows[outputRow][outputColumn] || "";
      if (!displayValue.includes(target)) rows[outputRow][outputColumn] = `${displayValue}${displayValue ? "\n" : ""}[KORA_LINK:${target}]`;
    }
  }
  return rows;
}

function firstLine(value: string) {
  const line = value.split("\n").map((part) => part.replace(/^[\s\-–—•]+/, "").trim()).find((part) => part && !/^(kondisi|status di console|link)\s*:/i.test(part));
  return line || "Pedoman tanpa judul";
}

function toChecklist(value: string) {
  const items = value
    .split(/\n+|\s*→\s*|\s*;\s*/)
    .map((item) => item.replace(/^\d+[.)]\s*/, "").trim())
    .filter(Boolean);
  return items.length ? items : ["Ikuti ketentuan pada pedoman sumber sebelum menentukan hasil penanganan."];
}

function hasValue(...values: string[]) {
  return values.some((value) => Boolean(value.trim()));
}

function hasTransferMarker(...values: string[]) {
  const text = normalized(values.join(" "));
  return /\btf\s*asi\b/i.test(text) || (/\btransfer\b/i.test(text) && /\basi\b/i.test(text));
}

function outcome(type: OutcomeType, sourceRow: number, decision: string, agentSteps: string, crmStatus: string, crmProcess: string, team?: string): ScenarioOutcome {
  return {
    id: `import-${sourceRow}-${type}`,
    type,
    decision,
    // Referensi tidak memiliki Agent Operation atau tiket CRM. Skripnya
    // sendiri berisi pertanyaan yang harus diajukan sebelum edukasi.
    agentSteps: agentSteps.trim() ? toChecklist(agentSteps) : (type === "reference" ? [] : toChecklist("")),
    ticketStatus: crmStatus || (type === "reference" ? "Referensi" : type === "tier_1" ? "Kategori Percakapan" : "Menunggu Diproses"),
    crmProcess: crmProcess || (type === "reference" ? "Tanyakan informasi yang diperlukan terlebih dahulu, lalu sampaikan edukasi sesuai jawaban pelanggan." : "Ikuti proses CRM sesuai ketentuan pada sumber."),
    escalationTeam: team || undefined,
  };
}

function buildGuide(args: {
  productId?: string;
  product: string;
  category: string;
  subtype: string;
  condition: string;
  script: string;
  callScript?: string;
  images?: GuideImage[];
  tier1Steps?: string;
  tier1Status?: string;
  tier2Steps?: string;
  tier2Status?: string;
  warning?: string;
  sourceSheet: string;
  sourceRow: number;
  sourceVariant: string;
  sourceType: string;
  priority?: string;
  forceOutcome?: OutcomeType;
  escalationFlag?: "yes" | "no";
  team?: string;
}): Guide {
  args = {
    ...args,
    product: stripHyperlinkMetadata(args.product),
    category: stripHyperlinkMetadata(args.category),
    subtype: stripHyperlinkMetadata(args.subtype),
    condition: stripHyperlinkMetadata(args.condition),
    script: stripHyperlinkMetadata(args.script),
    callScript: stripHyperlinkMetadata(args.callScript),
    tier1Steps: stripHyperlinkMetadata(args.tier1Steps),
    tier1Status: stripHyperlinkMetadata(args.tier1Status),
    tier2Steps: stripHyperlinkMetadata(args.tier2Steps),
    tier2Status: stripHyperlinkMetadata(args.tier2Status),
    warning: stripHyperlinkMetadata(args.warning),
  };
  const condition = args.condition || args.subtype || "Kondisi pelanggan belum diisi";
  const outcomes: ScenarioOutcome[] = [];
  const mustEscalate = args.escalationFlag === "yes";
  // List (New) is the source of truth for escalation. A "Transfer ASI" text
  // in columns F/G must not override an explicit Eskalasi = Ya in column H.
  if (mustEscalate) {
    const tier1IsTransfer = hasTransferMarker(args.tier1Steps || "", args.tier1Status || "");
    if (hasValue(args.tier1Steps || "", args.tier1Status || "") && !tier1IsTransfer) {
      outcomes.push(outcome("tier_1", args.sourceRow, "Pilih jika kasus dapat diselesaikan sesuai informasi dan pengecekan pada pedoman.", args.tier1Steps || "", args.tier1Status || "Kategori Percakapan", "Catat hasil pengecekan dan lanjutkan ke hasil eskalasi bila syaratnya terpenuhi."));
    }
    outcomes.push(outcome("tier_2_3", args.sourceRow, "Pilih jika kondisi memenuhi syarat eskalasi pada kolom Eskalasi = Ya.", args.tier2Steps || args.tier1Steps || args.script, args.tier2Status || "Eskalasi ke Tier 2/3", "Buat tiket eskalasi dan lampirkan detail kondisi serta bukti yang tersedia.", args.team));
  } else if (
    args.forceOutcome === "transfer_asi"
    || hasTransferMarker(
      args.condition,
      args.script,
      args.tier1Steps || "",
      // Tier 2/3 (column H) is never used to infer Transfer ASI. The
      // transfer decision belongs to the Tier 1/transfer fields (F/G).
      "",
    )
  ) {
    outcomes.push(outcome("transfer_asi", args.sourceRow, "Gunakan setelah memastikan kendala perlu dialihkan ke lini ASI.", args.tier1Steps || args.tier2Steps || args.script, args.tier1Status || args.tier2Status || "Prioritas Rendah", "Pilih flow transfer ASI, kirim makro, lalu transfer percakapan kepada tim tujuan.", args.team || "ASI"));
  } else {
    if (args.forceOutcome === "tier_1" || hasValue(args.tier1Steps || "", args.tier1Status || "")) outcomes.push(outcome("tier_1", args.sourceRow, "Pilih jika kasus dapat diselesaikan sesuai informasi dan pengecekan pada pedoman.", args.tier1Steps || "", args.tier1Status || "Kategori Percakapan", "Catat hasil pengecekan dan tutup percakapan setelah pelanggan menerima informasi."));
    if (args.escalationFlag !== "no" && (args.forceOutcome === "tier_2_3" || hasValue(args.tier2Steps || "", args.tier2Status || ""))) outcomes.push(outcome("tier_2_3", args.sourceRow, "Pilih jika kondisi memenuhi syarat eskalasi atau membutuhkan tindak lanjut tim lain.", args.tier2Steps || "", args.tier2Status || "Menunggu Diproses", "Buat tiket eskalasi dan lampirkan detail kondisi serta bukti yang tersedia.", args.team));
  }
  if (!outcomes.length) outcomes.push(outcome("reference", args.sourceRow, "Tanyakan terlebih dahulu, lalu sampaikan edukasi sesuai jawaban pelanggan.", "", "Referensi", "Tanyakan informasi yang diperlukan terlebih dahulu, lalu sampaikan edukasi sesuai jawaban pelanggan."));

  const reasons: string[] = [];
  if (!args.condition) reasons.push("Kondisi pelanggan kosong");
  if (!args.script && args.forceOutcome !== "transfer_asi") reasons.push("Skrip Live Chat kosong");
  if (!args.tier1Steps && !args.tier2Steps && !args.forceOutcome && outcomes[0].type !== "reference") reasons.push("Outcome belum memiliki langkah agent");
  if (!args.subtype) reasons.push("Sub tipe tiket kosong");

  const safeSource = args.sourceSheet.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const safeRow = `${args.sourceRow}-${args.sourceVariant}`;
  const sourceVariant = [
    args.sourceVariant,
    hasValue(args.tier2Steps || "") ? "has-tier2" : "",
    hasTransferMarker(args.tier1Steps || "", args.tier1Status || "") ? "transfer-fg" : "",
    hasTransferMarker(args.condition, args.script) && !hasTransferMarker(args.tier1Steps || "", args.tier1Status || "") ? "transfer-other" : "",
    args.escalationFlag ? `escalasi-${args.escalationFlag}` : "",
  ].filter(Boolean).join("|");
  return {
    id: `import-${safeSource}-${safeRow}`,
    productId: args.productId,
    product: args.product,
    category: args.category || "Belum dikategorikan",
    subtype: args.subtype || "Belum dikategorikan",
    // Simpan judul utuh. Pemotongan karakter membuat kata terakhir terbelah
    // dan sisa teks muncul sebagai potongan kondisi (misalnya "u tidak").
    title: firstLine(condition),
    condition,
    // Tidak semua baris sumber memiliki langkah penyelidikan terpisah.
    // Kondisi pelanggan tetap ditampilkan apa adanya di halaman detail.
    investigation: [],
    script: args.script || "Skrip Live Chat belum diisi pada sumber.",
    images: mergeImageReferences(args.images),
    outcomes,
    warning: args.warning || undefined,
    updated: "Baru diimpor",
    // Workbook sudah melalui persetujuan pemilik pedoman. Catatan kelengkapan
    // tetap disimpan sebagai informasi, tetapi tidak menghambat penggunaan.
    status: "Published",
    important: args.priority === "Special Case",
    sourceSheet: args.sourceSheet,
    sourceRow: args.sourceRow,
    sourceVariant,
    sourceType: args.sourceType,
    sourceCallScript: args.callScript || undefined,
    duplicateCount: 1,
    needsReview: false,
    reviewReason: reasons.join("; "),
  };
}

function referenceFlowAnchor(value: string) {
  return normalized(firstLine(value)).replace(/[^a-z0-9\u00c0-\u024f]+/gi, " ").trim();
}

function isReferenceGuide(guide: Guide) {
  return guide.sourceType === "standard"
    && guide.outcomes.length === 1
    && guide.outcomes[0].type === "reference"
    && Boolean(guide.script)
    && !guide.script.toLowerCase().includes("belum diisi pada sumber");
}

function mergeReferenceFlow(parent: Guide, education: Guide) {
  const questionScript = parent.script.trim();
  const educationScript = education.script.trim();
  parent.script = [questionScript, "(Pelanggan menjawab)", educationScript].filter(Boolean).join("\n\n");
  if (parent.sourceCallScript || education.sourceCallScript) {
    parent.sourceCallScript = [parent.sourceCallScript?.trim(), "(Pelanggan menjawab)", education.sourceCallScript?.trim()].filter(Boolean).join("\n\n");
  }
  parent.outcomes = education.outcomes;
  parent.images = mergeImageReferences(parent.images, education.images);
  parent.warning = [parent.warning, education.warning].filter(Boolean).join("\n\n") || undefined;
  parent.sourceVariant = [parent.sourceVariant || "scenario", "reference-flow", `education-row-${education.sourceRow ?? "unknown"}`].join("|");
  parent.duplicateCount = (parent.duplicateCount ?? 1) + (education.duplicateCount ?? 1);
  parent.reviewReason = [parent.reviewReason, education.reviewReason].filter(Boolean).join("; ") || undefined;
  parent.needsReview = Boolean(parent.needsReview || education.needsReview);
  parent.status = education.status === "Published" ? "Published" : education.status;
}

function linkReferenceFlows(guides: Guide[]) {
  const linked = new Set<string>();
  const result: Guide[] = [];
  for (let index = 0; index < guides.length; index += 1) {
    const parent = guides[index];
    if (linked.has(parent.id) || !isReferenceGuide(parent)) continue;
    const parentAnchor = referenceFlowAnchor(parent.condition);
    if (!parentAnchor) continue;
    const childIndex = guides.findIndex((candidate, candidateIndex) => {
      if (candidateIndex <= index || candidateIndex - index > 3 || linked.has(candidate.id)) return false;
      const sameContext = candidate.sourceSheet === parent.sourceSheet
        && normalized(candidate.product) === normalized(parent.product)
        && normalized(candidate.category) === normalized(parent.category)
        && normalized(candidate.subtype) === normalized(parent.subtype)
        && referenceFlowAnchor(candidate.condition) === parentAnchor;
      return sameContext && !isReferenceGuide(candidate);
    });
    if (childIndex < 0) continue;
    const education = guides[childIndex];
    mergeReferenceFlow(parent, education);
    linked.add(education.id);
  }
  for (const guide of guides) if (!linked.has(guide.id)) result.push(guide);
  return result;
}

function readStandardSheet(sheetName: string, rows: Row[], productId: string, product: string, escalationFlags: Map<string, "yes" | "no">) {
  const guides: Guide[] = [];
  let category = "";
  let subtype = "";
  const headerRow = findStandardHeaderRow(rows);
  const start = headerRow >= 0 ? headerRow + 1 : 3;
  for (let index = start; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row.some(Boolean) || isHeaderLikeRow(row)) continue;
    category = row[0] || category;
    subtype = row[1] || subtype;
    if (!hasValue(row[2], row[3], row[4], row[5], row[6], row[7], row[8])) continue;
    guides.push(buildGuide({ productId, product, category, subtype, condition: row[2], script: row[3], callScript: row[4], images: extractImageReferences(row[2], row[3], row[4], row[5], row[6], row[7], row[8]), tier1Steps: row[5], tier1Status: row[6], tier2Steps: row[7], tier2Status: row[8], sourceSheet: sheetName, sourceRow: index + 1, sourceVariant: "scenario", sourceType: "standard", escalationFlag: escalationFlags.get(escalationKey(product, category, subtype)) }));
  }
  return guides;
}

function readSpecialSheet(sheetName: string, rows: Row[]) {
  const guides: Guide[] = [];
  const key = matchSpecialSheet(sheetName);
  if (key === "ketentuan verifikasi data") {
    for (let index = 2; index < rows.length; index += 1) {
      const row = rows[index];
      if (!row.some(Boolean)) continue;
      const livechat = row[1] || row[0];
      guides.push(buildGuide({ product: "Pedoman Operasional", category: "Ketentuan Verifikasi Data", subtype: `Verifikasi data ${index - 1}`, condition: livechat, script: livechat, callScript: row[0], images: extractImageReferences(...row), tier1Steps: livechat, tier1Status: "Kategori Percakapan", sourceSheet: sheetName, sourceRow: index + 1, sourceVariant: "livechat", sourceType: "operational_verification" }));
    }
  } else if (key === "logika pembuatan tiket") {
    let section = "Logika Tiket";
    for (let index = 2; index < rows.length; index += 1) {
      const row = rows[index];
      const content = row.find(Boolean) || "";
      if (!content) continue;
      if (content.length < 90 && !/^\d+[.)]/.test(content)) {
        section = content;
        continue;
      }
      guides.push(buildGuide({ product: "Pedoman Operasional", category: "Logika Pembuatan Tiket", subtype: section, condition: content, script: "", images: extractImageReferences(...row), tier1Steps: content, tier1Status: "Kategori Percakapan", sourceSheet: sheetName, sourceRow: index + 1, sourceVariant: "tier1", sourceType: "operational_ticket_logic" }));
    }
  } else if (key === "ojk special case") {
    for (let index = 2; index < rows.length; index += 1) {
      const row = rows[index];
      if (!row.some(Boolean)) continue;
      guides.push(buildGuide({ product: "Pedoman Operasional", category: "OJK Special Case", subtype: row[1], condition: row[2], script: row[3], callScript: row[4], images: extractImageReferences(...row.slice(1, 9)), tier1Steps: row[5], tier1Status: row[6], tier2Steps: row[7], tier2Status: row[8], sourceSheet: sheetName, sourceRow: index + 1, sourceVariant: "scenario", sourceType: "special_ojk", priority: "Special Case" }));
    }
  } else if (key === "transfer chatcall ke asi") {
    for (let index = 2; index < rows.length; index += 1) {
      const row = rows[index];
      if (!row.some(Boolean)) continue;
      guides.push(buildGuide({ product: "Pedoman Operasional", category: "Transfer Chat/Call ke ASI", subtype: "Transfer chat/call ke ASI", condition: row[0], script: row[4], callScript: row[5], images: extractImageReferences(...row), tier1Steps: row[1], warning: row[2], sourceSheet: sheetName, sourceRow: index + 1, sourceVariant: "transfer", sourceType: "special_transfer", priority: "Low", forceOutcome: "transfer_asi", team: "ASI" }));
    }
  } else if (key === "special treatmentreminder") {
    for (let index = 2; index < rows.length; index += 1) {
      const row = rows[index];
      if (!row.some(Boolean)) continue;
      guides.push(buildGuide({ product: "Pedoman Operasional", category: "Special Treatment / Reminder", subtype: "Special Treatment", condition: row[0], script: "", images: extractImageReferences(...row), tier2Steps: row[1], warning: [row[3], row[4]].filter(Boolean).join("\n\n"), sourceSheet: sheetName, sourceRow: index + 1, sourceVariant: "escalation", sourceType: "special_treatment", priority: "Special Case", team: row[2] }));
    }
  } else if (key === "anomali ticketcase") {
    for (let index = 1; index < rows.length; index += 1) {
      const row = rows[index];
      if (!row.some(Boolean)) continue;
      guides.push(buildGuide({ product: "Pedoman Operasional", category: "Anomali Ticket/Case", subtype: row[0] ? `Anomali ${row[0]}` : "Anomali Ticket/Case", condition: row[1], script: "", images: extractImageReferences(...row), tier1Steps: row[2], sourceSheet: sheetName, sourceRow: index + 1, sourceVariant: "reference", sourceType: "special_anomaly", priority: "Special Case" }));
    }
  } else if (key === "other app contact") {
    for (let index = 1; index < rows.length; index += 1) {
      const row = rows[index];
      if (!row.some(Boolean)) continue;
      guides.push(buildGuide({ product: "Pedoman Operasional", category: "Other App Contact", subtype: `Kontak ${row[0] || "Platform lain"}`, condition: `Informasi kontak ${row[0] || "platform lain"}`, script: row[1], images: extractImageReferences(...row), sourceSheet: sheetName, sourceRow: index + 1, sourceVariant: "reference", sourceType: "other_contact" }));
    }
  }
  return guides;
}

function deduplicate(guides: Guide[]) {
  const seen = new Map<string, Guide>();
  const duplicateRows = new Set<string>();
  for (const guide of guides) {
    const key = [guide.product, guide.category, guide.subtype, guide.condition, guide.script].map(normalized).join("|");
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, guide);
      continue;
    }
    const existingOutcomeKeys = new Set(existing.outcomes.map((item) => [item.type, item.agentSteps.join("|"), item.ticketStatus, item.crmProcess].join("|")));
    for (const item of guide.outcomes) {
      const outcomeKey = [item.type, item.agentSteps.join("|"), item.ticketStatus, item.crmProcess].join("|");
      if (!existingOutcomeKeys.has(outcomeKey)) {
        existing.outcomes.push(item);
        existingOutcomeKeys.add(outcomeKey);
      }
    }
    existing.images = mergeImageReferences(existing.images, guide.images);
    duplicateRows.add(key);
    existing.duplicateCount = (existing.duplicateCount ?? 1) + 1;
    // Duplikat persis sudah aman digabung otomatis. Review hanya diperlukan
    // jika penggabungan outcome menghasilkan informasi yang bertentangan.
  }
  return { guides: Array.from(seen.values()), duplicateRows: duplicateRows.size };
}

function mergeDistinctText(first: string, second: string, separator: string) {
  return Array.from(new Set([first, second].filter(Boolean))).join(separator);
}

function normalizeOutcomeTypes(guides: Guide[]) {
  for (const guide of guides) {
    const byType = new Map<OutcomeType, ScenarioOutcome>();
    let merged = false;
    for (const item of guide.outcomes) {
      const existing = byType.get(item.type);
      if (!existing) {
        byType.set(item.type, { ...item, agentSteps: [...item.agentSteps] });
        continue;
      }
      merged = true;
      existing.agentSteps = Array.from(new Set([...existing.agentSteps, ...item.agentSteps]));
      existing.decision = mergeDistinctText(existing.decision, item.decision, "\n\n");
      existing.ticketStatus = mergeDistinctText(existing.ticketStatus, item.ticketStatus, " / ");
      existing.crmProcess = mergeDistinctText(existing.crmProcess, item.crmProcess, "\n\n");
      existing.escalationTeam = mergeDistinctText(existing.escalationTeam || "", item.escalationTeam || "", " / ") || undefined;
    }
    if (merged) {
      guide.outcomes = Array.from(byType.values());
      guide.needsReview = false;
      guide.status = "Published";
      guide.reviewReason = [guide.reviewReason, "Outcome dengan jenis sama digabung; pastikan langkah dan statusnya sesuai"].filter(Boolean).join("; ");
    }
  }
  return guides;
}

function hasVariant(guide: Guide, variant: string) {
  return (guide.sourceVariant || "").split("|").includes(variant);
}

function buildImportQcSummary(guides: Guide[], tabs: ImportQcTab[]): ImportQcSummary {
  const outcomeCounts: Record<OutcomeType, number> = {
    tier_1: 0,
    tier_2_3: 0,
    transfer_asi: 0,
    reference: 0,
  };
  let linkedFlows = 0;
  let standaloneReferences = 0;
  let yes = 0;
  let no = 0;
  let unmatched = 0;
  let yesWithoutTier2 = 0;
  let noWithTier2 = 0;
  let transferFromTier1 = 0;
  let transferOutsideTier1 = 0;
  const exceptions: ImportQcException[] = [];

  const addException = (guide: Guide, severity: ImportQcException["severity"], title: string, reason: string) => {
    exceptions.push({
      id: `${guide.id}-${exceptions.length}`,
      severity,
      title,
      reason,
      sourceSheet: guide.sourceSheet || "Sumber tidak diketahui",
      sourceRow: guide.sourceRow,
    });
  };

  for (const guide of guides) {
    for (const item of guide.outcomes) outcomeCounts[item.type] += 1;
    if (hasVariant(guide, "reference-flow")) linkedFlows += 1;
    if (guide.sourceType === "standard") {
      if (hasVariant(guide, "escalasi-yes")) yes += 1;
      else if (hasVariant(guide, "escalasi-no")) no += 1;
      else unmatched += 1;
      const hasTier2 = guide.outcomes.some((item) => item.type === "tier_2_3");
      if (hasVariant(guide, "escalasi-yes") && !hasTier2) {
        yesWithoutTier2 += 1;
        addException(guide, "error", "Eskalasi = Ya tanpa flow Tier 2/3", "Periksa kolom H/I pada sumber dan pastikan hasil eskalasinya terbaca.");
      }
      if (hasVariant(guide, "escalasi-no") && hasTier2) {
        noWithTier2 += 1;
        addException(guide, "error", "Eskalasi = Tidak tetapi ada flow Tier 2/3", "Flow Tier 2/3 seharusnya tidak tampil untuk baris yang ditandai Tidak.");
      }
      if (guide.outcomes.length === 1 && guide.outcomes[0].type === "reference" && !hasVariant(guide, "reference-flow")) {
        standaloneReferences += 1;
        addException(guide, "warning", "Pertanyaan belum terhubung ke edukasi", "Baris pertanyaan tidak menemukan baris edukasi lanjutan di bawahnya pada konteks yang sama.");
      }
    }
    if (hasVariant(guide, "transfer-fg")) transferFromTier1 += 1;
    if (hasVariant(guide, "transfer-other")) {
      transferOutsideTier1 += 1;
      addException(guide, "warning", "Teks transfer ditemukan di luar kolom F/G", "QC menandai ini sebagai catatan saja. Pastikan keputusan Transfer ASI memang berasal dari kolom F/G, bukan dari teks kondisi atau skrip.");
    }
    const firstReason = (guide.reviewReason || "").split("; ").find(Boolean);
    if (firstReason && !exceptions.some((item) => item.id.startsWith(`${guide.id}-`))) {
      addException(guide, "warning", firstReason, "Catatan kelengkapan sumber ditampilkan sebagai informasi dan tidak menghambat publish.");
    }
  }

  const importedTabs = tabs.filter((tab) => tab.status === "imported");
  const skippedTabs = tabs.filter((tab) => tab.status === "skipped");
  const check = (id: string, label: string, status: ImportQcStatus, metric: string, detail: string): ImportQcCheck => ({ id, label, status, metric, detail });
  const checks: ImportQcCheck[] = [
    check(
      "coverage",
      "Cakupan tab sumber",
      skippedTabs.length ? "warning" : "pass",
      `${importedTabs.length} tab masuk`,
      skippedTabs.length ? `${skippedTabs.length} tab belum bisa dibaca sebagai pedoman dan perlu dicek.` : "Semua tab pedoman yang berisi data sudah diproses.",
    ),
    check(
      "reference-flow",
      "Pertanyaan → edukasi",
      standaloneReferences ? "warning" : "pass",
      `${linkedFlows} alur tersambung`,
      standaloneReferences ? `${standaloneReferences} pertanyaan belum menemukan edukasi lanjutan.` : "Pertanyaan yang memiliki edukasi sudah disatukan dalam satu alur.",
    ),
    check(
      "escalation",
      "Mapping eskalasi kolom H",
      yesWithoutTier2 || noWithTier2 ? "error" : unmatched ? "warning" : "pass",
      `${yes} Ya · ${no} Tidak · ${unmatched} belum dipetakan`,
      yesWithoutTier2 || noWithTier2 ? "Ada ketidaksesuaian antara flag eskalasi dan outcome yang terbentuk." : unmatched ? "Sebagian kondisi produk belum menemukan flag di List (New); cek daftar ini bila memang harus memiliki status eskalasi." : "Flag Ya/Tidak konsisten dengan outcome Tier 2/3.",
    ),
    check(
      "transfer-source",
      "Sumber Transfer ASI kolom F/G",
      transferOutsideTier1 ? "warning" : "pass",
      `${transferFromTier1} dari F/G`,
      transferOutsideTier1 ? `${transferOutsideTier1} catatan berisi kata transfer di luar F/G; cek manual bila diperlukan.` : "Keputusan Transfer ASI terbaca dari kolom Tier 1.",
    ),
    check(
      "content",
      "Kelengkapan konten",
      exceptions.some((item) => item.severity === "warning") ? "warning" : "pass",
      `${guides.length} kondisi siap`,
      exceptions.some((item) => item.severity === "warning") ? "Ada catatan sumber yang tetap ditampilkan, tetapi tidak menghambat publish." : "Konten utama tersedia untuk dipublikasikan.",
    ),
  ];

  return {
    tabs,
    checks,
    linkedFlows,
    standaloneReferences,
    outcomeCounts,
    escalation: { yes, no, unmatched, yesWithoutTier2, noWithTier2, transferFromTier1, transferOutsideTier1 },
    exceptions: exceptions.slice(0, 120),
    exceptionTotal: exceptions.length,
  };
}

export function parseWorkbook(data: ArrayBuffer, fileName: string): ImportResult {
  const workbook = XLSX.read(data, { type: "array", cellDates: true });
  const imported: Guide[] = [];
  const skippedSheets: string[] = [];
  const qcTabs: ImportQcTab[] = [];
  const escalationFlags = new Map<string, "yes" | "no">();
  let sourceRows = 0;

  // Read the escalation list first because workbook sheet order is not guaranteed.
  const escalationSheet = workbook.SheetNames.find((sheetName) => compactSheetKey(sheetName) === compactSheetKey("list (new)"));
  if (escalationSheet) {
    for (const [scenarioKey, flag] of readEscalationList(rowsForSheet(workbook.Sheets[escalationSheet]))) {
      escalationFlags.set(scenarioKey, flag);
    }
  }

  for (const sheetName of workbook.SheetNames) {
    const rows = rowsForSheet(workbook.Sheets[sheetName]);
    if (compactSheetKey(sheetName) === compactSheetKey("list (new)")) {
      qcTabs.push({ name: sheetName, status: "mapping", rows: Math.max(rows.length - 1, 0), scenarios: escalationFlags.size, note: "Dipakai sebagai sumber flag Eskalasi = Ya/Tidak; bukan konten pedoman." });
      continue;
    }
    if (isMappingSheet(sheetName)) {
      qcTabs.push({ name: sheetName, status: "ignored", rows: Math.max(rows.length - 1, 0), scenarios: 0, note: "Tab referensi/metadata, bukan pedoman yang ditampilkan ke Agent." });
      continue;
    }
    const special = matchSpecialSheet(sheetName);
    if (special) {
      const parsed = readSpecialSheet(sheetName, rows);
      sourceRows += parsed.length;
      imported.push(...parsed);
      qcTabs.push({ name: sheetName, status: "imported", rows: parsed.length, scenarios: parsed.length, note: "Tab operasional berhasil dipetakan." });
      continue;
    }
    const standard = matchStandardSheet(sheetName);
    if (standard) {
      const parsed = readStandardSheet(sheetName, rows, standard.productId, standard.product, escalationFlags);
      sourceRows += parsed.length;
      imported.push(...parsed);
      qcTabs.push({ name: sheetName, status: "imported", rows: parsed.length, scenarios: parsed.length, note: "Tab produk berhasil dipetakan." });
      continue;
    }
    if (looksLikeStandardProductSheet(rows)) {
      const product = sheetName.replace(/\s+/g, " ").trim();
      const parsed = readStandardSheet(sheetName, rows, slugifyId(product), product, escalationFlags);
      sourceRows += parsed.length;
      imported.push(...parsed);
      qcTabs.push({ name: sheetName, status: "imported", rows: parsed.length, scenarios: parsed.length, note: "Tab produk baru terbaca dari header kolom sumber." });
      continue;
    }
    skippedSheets.push(sheetName);
    qcTabs.push({ name: sheetName, status: "skipped", rows: Math.max(rows.length - 1, 0), scenarios: 0, note: "Belum ada mapping parser untuk tab ini." });
  }

  // Gabungkan baris pertanyaan dengan baris edukasi yang langsung mengikuti
  // dan masih berada pada konteks produk/kategori/subtipe yang sama.
  const linkedFlows = linkReferenceFlows(imported);
  const deduped = deduplicate(linkedFlows);
  const normalizedGuides = normalizeOutcomeTypes(deduped.guides);
  applyEscalationFlags(normalizedGuides, escalationFlags);
  const reviewCount = normalizedGuides.filter((guide) => Boolean(guide.reviewReason)).length;
  const outcomes = normalizedGuides.reduce((total, guide) => total + guide.outcomes.length, 0);
  const reasons = new Map<string, number>();
  for (const guide of normalizedGuides) {
    for (const reason of (guide.reviewReason || "").split("; ").filter(Boolean)) reasons.set(reason, (reasons.get(reason) || 0) + 1);
  }
  const qc = buildImportQcSummary(normalizedGuides, qcTabs);
  return {
    guides: normalizedGuides,
    summary: { fileName, sourceRows, scenarios: normalizedGuides.length, outcomes, reviewCount, duplicateRows: deduped.duplicateRows, skippedSheets, importedAt: new Date().toISOString() },
    issues: Array.from(reasons, ([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    qc,
  };
}

export async function parseExcelFile(file: File) {
  return parseWorkbook(await file.arrayBuffer(), file.name);
}

export function isKnownProduct(productId: string | undefined) {
  return Boolean(products.find((product) => product.id === productId));
}
