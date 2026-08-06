import * as XLSX from "xlsx";
import { products, type Guide, type OutcomeType, type ScenarioOutcome } from "@/lib/mock-data";

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
};

type Row = string[];

const standardSheets: Record<string, { productId: string; product: string }> = {
  "akulaku paylater (internal)": { productId: "akulaku-internal", product: "Akulaku Paylater Internal" },
  "openpay (online)": { productId: "openpay-online", product: "Openpay Online" },
  "openpay (offline)": { productId: "openpay-offline", product: "Openpay Offline" },
  "akulaku paylater di toko (afi a": { productId: "paylater-toko", product: "Akulaku Paylater di Toko" },
  "cicilan motor listrik": { productId: "cicilan-motor", product: "Cicilan Motor Listrik" },
  "lazada paylater": { productId: "lazada-paylater", product: "Lazada PayLater" },
  "tiktok paylater": { productId: "tiktok-paylater", product: "TikTok PayLater" },
  general: { productId: "general", product: "General" },
};

const ignoredSheets = new Set([
  "raw data",
  "list",
  "list (new)",
  "akulaku elite card",
  "auto loan",
]);

function clean(value: unknown) {
  return String(value ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function normalized(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function rowsForSheet(sheet: XLSX.WorkSheet): Row[] {
  return (XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false }) as unknown[][]).map((row) => row.map(clean));
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
  return items.length ? items.slice(0, 12) : ["Ikuti ketentuan pada pedoman sumber sebelum menentukan hasil penanganan."];
}

function hasValue(...values: string[]) {
  return values.some((value) => Boolean(value.trim()));
}

function hasTransferMarker(...values: string[]) {
  const text = normalized(values.join(" "));
  return text.includes("transfer") && text.includes("asi");
}

function outcome(type: OutcomeType, sourceRow: number, decision: string, agentSteps: string, crmStatus: string, crmProcess: string, team?: string): ScenarioOutcome {
  return {
    id: `import-${sourceRow}-${type}`,
    type,
    decision,
    agentSteps: toChecklist(agentSteps),
    ticketStatus: crmStatus || (type === "tier_1" ? "Kategori Percakapan" : "Menunggu Diproses"),
    crmProcess: crmProcess || "Ikuti proses CRM sesuai ketentuan pada sumber.",
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
  team?: string;
}): Guide {
  const condition = args.condition || args.subtype || "Kondisi pelanggan belum diisi";
  const outcomes: ScenarioOutcome[] = [];
  if (args.forceOutcome === "transfer_asi" || hasTransferMarker(args.condition, args.script, args.tier1Steps || "", args.tier2Steps || "")) {
    outcomes.push(outcome("transfer_asi", args.sourceRow, "Gunakan setelah memastikan kendala perlu dialihkan ke lini ASI.", args.tier1Steps || args.tier2Steps || args.script, args.tier1Status || args.tier2Status || "Prioritas Rendah", "Pilih flow transfer ASI, kirim makro, lalu transfer percakapan kepada tim tujuan.", args.team || "ASI"));
  } else {
    if (args.forceOutcome === "tier_1" || hasValue(args.tier1Steps || "", args.tier1Status || "")) outcomes.push(outcome("tier_1", args.sourceRow, "Pilih jika kasus dapat diselesaikan sesuai informasi dan pengecekan pada pedoman.", args.tier1Steps || "", args.tier1Status || "Kategori Percakapan", "Catat hasil pengecekan dan tutup percakapan setelah pelanggan menerima informasi."));
    if (args.forceOutcome === "tier_2_3" || hasValue(args.tier2Steps || "", args.tier2Status || "")) outcomes.push(outcome("tier_2_3", args.sourceRow, "Pilih jika kondisi memenuhi syarat eskalasi atau membutuhkan tindak lanjut tim lain.", args.tier2Steps || "", args.tier2Status || "Menunggu Diproses", "Buat tiket eskalasi dan lampirkan detail kondisi serta bukti yang tersedia.", args.team));
  }
  if (!outcomes.length) outcomes.push(outcome("reference", args.sourceRow, "Referensi saja; lengkapi tindakan sebelum diterbitkan.", args.tier1Steps || args.tier2Steps || "", args.tier1Status || args.tier2Status || "", "Lengkapi outcome dan proses CRM sebelum menerbitkan pedoman."));

  const reasons: string[] = [];
  if (!args.condition) reasons.push("Kondisi pelanggan kosong");
  if (!args.script && args.forceOutcome !== "transfer_asi") reasons.push("Skrip Live Chat kosong");
  if (!args.tier1Steps && !args.tier2Steps && !args.forceOutcome) reasons.push("Outcome belum memiliki langkah agent");
  if (!args.subtype) reasons.push("Sub tipe tiket kosong");
  if (outcomes[0].type === "reference") reasons.push("Jenis tindakan belum dapat ditentukan dari sumber");

  const safeSource = args.sourceSheet.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const safeRow = `${args.sourceRow}-${args.sourceVariant}`;
  return {
    id: `import-${safeSource}-${safeRow}`,
    productId: args.productId,
    product: args.product,
    category: args.category || "Belum dikategorikan",
    subtype: args.subtype || "Belum dikategorikan",
    title: firstLine(condition).slice(0, 140),
    condition,
    investigation: toChecklist(condition),
    script: args.script || "Skrip Live Chat belum diisi pada sumber.",
    outcomes,
    warning: args.warning || undefined,
    updated: "Baru diimpor",
    status: reasons.length ? "Perlu diperiksa" : "Draft",
    important: args.priority === "Special Case",
    sourceSheet: args.sourceSheet,
    sourceRow: args.sourceRow,
    sourceVariant: args.sourceVariant,
    sourceType: args.sourceType,
    sourceCallScript: args.callScript || undefined,
    needsReview: Boolean(reasons.length),
    reviewReason: reasons.join("; "),
  };
}

function readStandardSheet(sheetName: string, rows: Row[], productId: string, product: string) {
  const guides: Guide[] = [];
  let category = "";
  let subtype = "";
  for (let index = 3; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row.some(Boolean)) continue;
    category = row[0] || category;
    subtype = row[1] || subtype;
    guides.push(buildGuide({ productId, product, category, subtype, condition: row[2], script: row[3], callScript: row[4], tier1Steps: row[5], tier1Status: row[6], tier2Steps: row[7], tier2Status: row[8], sourceSheet: sheetName, sourceRow: index + 1, sourceVariant: "scenario", sourceType: "standard" }));
  }
  return guides;
}

function readSpecialSheet(sheetName: string, rows: Row[]) {
  const guides: Guide[] = [];
  const key = normalized(sheetName);
  if (key === "ketentuan verifikasi data") {
    for (let index = 2; index < rows.length; index += 1) {
      const row = rows[index];
      if (!row.some(Boolean)) continue;
      const livechat = row[1] || row[0];
      guides.push(buildGuide({ product: "Pedoman Operasional", category: "Ketentuan Verifikasi Data", subtype: `Verifikasi data ${index - 1}`, condition: livechat, script: livechat, callScript: row[0], tier1Steps: livechat, tier1Status: "Kategori Percakapan", sourceSheet: sheetName, sourceRow: index + 1, sourceVariant: "livechat", sourceType: "operational_verification" }));
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
      guides.push(buildGuide({ product: "Pedoman Operasional", category: "Logika Pembuatan Tiket", subtype: section, condition: content, script: "", tier1Steps: content, tier1Status: "Kategori Percakapan", sourceSheet: sheetName, sourceRow: index + 1, sourceVariant: "tier1", sourceType: "operational_ticket_logic" }));
    }
  } else if (key === "ojk special case") {
    for (let index = 2; index < rows.length; index += 1) {
      const row = rows[index];
      if (!row.some(Boolean)) continue;
      guides.push(buildGuide({ product: "Pedoman Operasional", category: "OJK Special Case", subtype: row[1], condition: row[2], script: row[3], callScript: row[4], tier1Steps: row[5], tier1Status: row[6], tier2Steps: row[7], tier2Status: row[8], sourceSheet: sheetName, sourceRow: index + 1, sourceVariant: "scenario", sourceType: "special_ojk", priority: "Special Case" }));
    }
  } else if (key === "transfer chatcall ke asi") {
    for (let index = 2; index < rows.length; index += 1) {
      const row = rows[index];
      if (!row.some(Boolean)) continue;
      guides.push(buildGuide({ product: "Pedoman Operasional", category: "Transfer Chat/Call ke ASI", subtype: "Transfer chat/call ke ASI", condition: row[0], script: row[4], callScript: row[5], tier1Steps: row[1], warning: row[2], sourceSheet: sheetName, sourceRow: index + 1, sourceVariant: "transfer", sourceType: "special_transfer", priority: "Low", forceOutcome: "transfer_asi", team: "ASI" }));
    }
  } else if (key === "special treatmentreminder") {
    for (let index = 2; index < rows.length; index += 1) {
      const row = rows[index];
      if (!row.some(Boolean)) continue;
      guides.push(buildGuide({ product: "Pedoman Operasional", category: "Special Treatment / Reminder", subtype: "Special Treatment", condition: row[0], script: "", tier2Steps: row[1], warning: [row[3], row[4]].filter(Boolean).join("\n\n"), sourceSheet: sheetName, sourceRow: index + 1, sourceVariant: "escalation", sourceType: "special_treatment", priority: "Special Case", team: row[2] }));
    }
  } else if (key === "anomali ticketcase") {
    for (let index = 1; index < rows.length; index += 1) {
      const row = rows[index];
      if (!row.some(Boolean)) continue;
      guides.push(buildGuide({ product: "Pedoman Operasional", category: "Anomali Ticket/Case", subtype: row[0] ? `Anomali ${row[0]}` : "Anomali Ticket/Case", condition: row[1], script: "", tier1Steps: row[2], sourceSheet: sheetName, sourceRow: index + 1, sourceVariant: "reference", sourceType: "special_anomaly", priority: "Special Case" }));
    }
  } else if (key === "other app contact") {
    for (let index = 1; index < rows.length; index += 1) {
      const row = rows[index];
      if (!row.some(Boolean)) continue;
      guides.push(buildGuide({ product: "Pedoman Operasional", category: "Other App Contact", subtype: `Kontak ${row[0] || "Platform lain"}`, condition: `Informasi kontak ${row[0] || "platform lain"}`, script: "", warning: row[1], sourceSheet: sheetName, sourceRow: index + 1, sourceVariant: "reference", sourceType: "other_contact" }));
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
    duplicateRows.add(key);
    existing.needsReview = true;
    existing.status = "Perlu diperiksa";
    existing.reviewReason = [existing.reviewReason, "Duplikat persis sumber"].filter(Boolean).join("; ");
  }
  return { guides: Array.from(seen.values()), duplicateRows: duplicateRows.size };
}

export function parseWorkbook(data: ArrayBuffer, fileName: string): ImportResult {
  const workbook = XLSX.read(data, { type: "array", cellDates: true });
  const imported: Guide[] = [];
  const skippedSheets: string[] = [];
  let sourceRows = 0;

  for (const sheetName of workbook.SheetNames) {
    const key = normalized(sheetName);
    const rows = rowsForSheet(workbook.Sheets[sheetName]);
    const standard = standardSheets[key] || Object.entries(standardSheets).find(([name]) => key.startsWith(name))?.[1];
    if (standard) {
      const parsed = readStandardSheet(sheetName, rows, standard.productId, standard.product);
      sourceRows += parsed.length;
      imported.push(...parsed);
    } else if (["ketentuan verifikasi data", "logika pembuatan tiket", "ojk special case", "transfer chatcall ke asi", "special treatmentreminder", "anomali ticketcase", "other app contact"].includes(key)) {
      const parsed = readSpecialSheet(sheetName, rows);
      sourceRows += parsed.length;
      imported.push(...parsed);
    } else if (!ignoredSheets.has(key)) {
      skippedSheets.push(sheetName);
    }
  }

  const deduped = deduplicate(imported);
  const reviewCount = deduped.guides.filter((guide) => guide.needsReview).length;
  const outcomes = deduped.guides.reduce((total, guide) => total + guide.outcomes.length, 0);
  const reasons = new Map<string, number>();
  for (const guide of deduped.guides) {
    for (const reason of (guide.reviewReason || "").split("; ").filter(Boolean)) reasons.set(reason, (reasons.get(reason) || 0) + 1);
  }
  return {
    guides: deduped.guides,
    summary: { fileName, sourceRows, scenarios: deduped.guides.length, outcomes, reviewCount, duplicateRows: deduped.duplicateRows, skippedSheets, importedAt: new Date().toISOString() },
    issues: Array.from(reasons, ([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
  };
}

export async function parseExcelFile(file: File) {
  return parseWorkbook(await file.arrayBuffer(), file.name);
}

export function isKnownProduct(productId: string | undefined) {
  return Boolean(products.find((product) => product.id === productId));
}
