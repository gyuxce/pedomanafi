"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, ChevronRight, ClipboardCheck, Database, LifeBuoy, LogOut, Search, Upload, X, Zap } from "lucide-react";
import { guides, operationalGuides, type Guide, type OutcomeType, type Product } from "@/lib/mock-data";
import { parseExcelFile, type ImportQcSummary, type ImportResult, type ImportSummary } from "@/lib/excel-importer";
import { diffGuides, importHasChanges, summarizeImportDiff, type ImportDiff } from "@/lib/import-diff";
import type { SaveImportResult } from "@/lib/ekb-repository";
import type { Announcement, AnnouncementTone, GuideFeedbackRecord } from "@/lib/ops-types";
import { KoraMark } from "@/components/kora-mark";
import { GuideDetail } from "@/components/guide-detail";
import { HighlightedText } from "@/components/highlighted-text";
import { buildOperationalModules, buildProductCatalog, categoryTaxonomyKey, guideMatchesProduct, isOperationalGuide, taxonomyKey, uniqueTaxonomyLabels } from "@/lib/guide-catalog";
import { normalizeSearchText, outcomeLabel } from "@/lib/guide-ui";
import { useDebouncedValue } from "@/lib/use-debounced-value";

type AdminView = "content" | "import" | "review" | "updates" | "feedback";
type AdminScenarioSort = "default" | "source_asc" | "source_desc";
type AdminBrowseArea = "products" | "operational";
type AdminBrowseSelection = {
  area: AdminBrowseArea;
  productId: string | null;
  category: string | null;
  subtype: string | null;
};

export type AdminConsoleProps = {
  importedGuides: Guide[];
  importSummary: ImportSummary | null;
  onImport: (result: ImportResult) => Promise<SaveImportResult | void>;
  onSaveScenario: (guide: Guide, publish: boolean) => Promise<void>;
  announcements: Announcement[];
  announcementsLocalOnly: boolean;
  onSaveAnnouncement: (draft: { id?: string; title: string; detail: string; tone: AnnouncementTone; published: boolean }) => Promise<void>;
  onDeleteAnnouncement: (id: string) => Promise<void>;
  feedbackItems: GuideFeedbackRecord[];
  feedbackLocalOnly: boolean;
  onSignOut: () => void;
};

function AdminCategoryNavigator({ guides: allGuides, selection, onChange }: { guides: Guide[]; selection: AdminBrowseSelection; onChange: (selection: AdminBrowseSelection) => void }) {
  const catalog = buildProductCatalog(allGuides);
  const selectedProduct = catalog.find((product) => product.id === selection.productId) ?? null;
  const productGuideCount = (product: Product) => allGuides.filter((guide) => guideMatchesProduct(guide, product)).length;
  const productCategoryNames = selectedProduct
    ? uniqueTaxonomyLabels(selectedProduct.categories.map((category) => category.name))
    : [];
  const operationalGuideList = allGuides.filter(isOperationalGuide);
  const operationalCatalog = buildOperationalModules(allGuides);
  const operationalCategoryNames = uniqueTaxonomyLabels(operationalCatalog.map((module) => module.name));
  const categoryNames = selection.area === "operational" ? operationalCategoryNames : productCategoryNames;
  const selectedCategoryGuides = selection.area === "operational"
    ? operationalGuideList.filter((guide) => taxonomyKey(guide.category) === taxonomyKey(selection.category ?? ""))
    : selectedProduct ? allGuides.filter((guide) => guideMatchesProduct(guide, selectedProduct) && categoryTaxonomyKey(selectedProduct.id, guide.category) === categoryTaxonomyKey(selectedProduct.id, selection.category ?? "")) : [];
  const subtypeNames = uniqueTaxonomyLabels(selectedCategoryGuides.map((guide) => guide.subtype));

  function selectArea(area: AdminBrowseArea) {
    onChange({ area, productId: null, category: null, subtype: null });
  }

  return <section className="admin-browser"><div className="admin-browser-head"><div><span className="eyebrow muted">Navigasi pedoman</span><strong>Pilih produk dan kategori</strong><small>Gunakan menu ini untuk membuka kumpulan scenario tanpa mencari satu per satu.</small></div><button className={!selection.productId && !selection.category ? "active" : ""} onClick={() => onChange({ area: selection.area, productId: null, category: null, subtype: null })}>Semua scenario</button></div><div className="admin-browser-tabs"><button className={selection.area === "products" ? "active" : ""} onClick={() => selectArea("products")}>Produk</button><button className={selection.area === "operational" ? "active" : ""} onClick={() => selectArea("operational")}>Pedoman Operasional</button></div>{selection.area === "products" ? <><div className="admin-browser-label"><strong>Produk</strong><span>{catalog.length} pilihan</span></div><div className="admin-browser-grid products">{catalog.map((product) => <button key={product.id} className={selection.productId === product.id ? "active" : ""} onClick={() => onChange({ area: "products", productId: product.id, category: null, subtype: null })}><span><strong>{product.shortName}</strong><small>{productGuideCount(product).toLocaleString("id-ID")} scenario</small></span><ChevronRight size={15} /></button>)}</div>{selectedProduct && <><div className="admin-browser-label"><strong>Kategori kendala · {selectedProduct.shortName}</strong><span>{categoryNames.length} pilihan</span></div><div className="admin-browser-grid categories">{categoryNames.map((categoryName) => { const categoryCount = allGuides.filter((guide) => guideMatchesProduct(guide, selectedProduct) && categoryTaxonomyKey(selectedProduct.id, guide.category) === categoryTaxonomyKey(selectedProduct.id, categoryName)).length; const category = selectedProduct.categories.find((item) => categoryTaxonomyKey(selectedProduct.id, item.name) === categoryTaxonomyKey(selectedProduct.id, categoryName)); return <button key={categoryName} className={taxonomyKey(selection.category ?? "") === taxonomyKey(categoryName) ? "active" : ""} onClick={() => onChange({ area: "products", productId: selectedProduct.id, category: categoryName, subtype: null })}><span><strong>{categoryName}</strong><small>{categoryCount.toLocaleString("id-ID")} scenario{category?.description ? ` · ${category.description}` : ""}</small></span><ChevronRight size={15} /></button>; })}</div></>}</> : <><div className="admin-browser-label"><strong>Pedoman Operasional</strong><span>{categoryNames.length} modul</span></div><div className="admin-browser-grid categories">{categoryNames.map((categoryName) => { const operationalModule = operationalCatalog.find((item) => taxonomyKey(item.name) === taxonomyKey(categoryName)); const categoryCount = operationalGuideList.filter((guide) => taxonomyKey(guide.category) === taxonomyKey(categoryName)).length; return <button key={categoryName} className={taxonomyKey(selection.category ?? "") === taxonomyKey(categoryName) ? "active" : ""} onClick={() => onChange({ area: "operational", productId: null, category: categoryName, subtype: null })}><span><strong>{categoryName}</strong><small>{categoryCount.toLocaleString("id-ID")} scenario{operationalModule?.description ? ` · ${operationalModule.description}` : ""}</small></span><ChevronRight size={15} /></button>; })}</div></>}{selection.category && <><div className="admin-browser-label"><strong>Subkategori / sub tipe tiket · {selection.category}</strong><span>{subtypeNames.length} pilihan</span></div><div className="admin-browser-subtypes"><button className={!selection.subtype ? "active" : ""} onClick={() => onChange({ ...selection, subtype: null })}>Semua sub tipe</button>{subtypeNames.map((subtype) => <button key={subtype} className={selection.subtype === subtype ? "active" : ""} onClick={() => onChange({ ...selection, subtype })}>{subtype}</button>)}</div></>}</section>;
}

function qcStatusText(status: "pass" | "warning" | "error") {
  if (status === "error") return "Perlu diperbaiki";
  if (status === "warning") return "Ada catatan";
  return "Lolos";
}

function qcStatusIcon(status: "pass" | "warning" | "error") {
  if (status === "error" || status === "warning") return <AlertTriangle size={15} />;
  return <CheckCircle2 size={15} />;
}

function ImportQcDashboard({ report }: { report: ImportQcSummary }) {
  const errorCount = report.checks.filter((check) => check.status === "error").length;
  const warningCount = report.checks.filter((check) => check.status === "warning").length;
  const overallStatus = errorCount ? "error" : warningCount ? "warning" : "pass";
  const visibleExceptions = report.exceptions.slice(0, 8);
  return <section className="qc-dashboard" aria-labelledby="qc-import-title">
    <div className="qc-dashboard-head"><div className="qc-dashboard-title"><span className="qc-icon"><ClipboardCheck size={18} /></span><div><strong id="qc-import-title">QC import sebelum publish</strong><p>Periksa cakupan workbook dan alur pedoman sebelum snapshot terbaru disimpan.</p></div></div><span className={`qc-overall ${overallStatus}`}>{qcStatusIcon(overallStatus)}{qcStatusText(overallStatus)}</span></div>
    <div className="qc-check-grid">{report.checks.map((check) => <div className={`qc-check ${check.status}`} key={check.id}><div className="qc-check-top"><span>{qcStatusIcon(check.status)}<strong>{check.label}</strong></span><b>{check.metric}</b></div><p>{check.detail}</p></div>)}</div>
    <div className="qc-metrics"><div><span>Alur pertanyaan–edukasi</span><strong>{report.linkedFlows.toLocaleString("id-ID")}</strong></div><div><span>Referensi belum tersambung</span><strong>{report.standaloneReferences.toLocaleString("id-ID")}</strong></div><div><span>Flow eskalasi Tier 2/3</span><strong>{report.outcomeCounts.tier_2_3.toLocaleString("id-ID")}</strong></div><div><span>Transfer ASI dari F/G</span><strong>{report.escalation.transferFromTier1.toLocaleString("id-ID")}</strong></div></div>
    <details className="qc-detail" open><summary><span>Cakupan tab sumber</span><b>{report.tabs.length} tab</b></summary><div className="qc-tab-list">{report.tabs.map((tab) => <div key={tab.name} className={`qc-tab-row ${tab.status}`}><div><strong>{tab.name}</strong><small>{tab.note}</small></div><span>{tab.status === "mapping" ? "Mapping" : tab.status === "imported" ? `${tab.scenarios.toLocaleString("id-ID")} scenario` : tab.status === "ignored" ? "Dilewati" : "Belum dipetakan"}</span></div>)}</div></details>
    <details className="qc-detail"><summary><span>Pengecualian yang perlu dibuka</span><b>{report.exceptionTotal.toLocaleString("id-ID")}</b></summary>{report.exceptionTotal ? <div className="qc-exception-list">{visibleExceptions.map((item) => <div className={`qc-exception ${item.severity}`} key={item.id}><div><strong>{item.title}</strong><small>{item.reason}</small></div><span>{item.sourceSheet}{item.sourceRow ? ` · baris ${item.sourceRow}` : ""}</span></div>)}{report.exceptionTotal > visibleExceptions.length && <small className="qc-more">Menampilkan {visibleExceptions.length} contoh pertama. Semua catatan tetap tercatat pada hasil QC.</small>}</div> : <p className="qc-empty">Tidak ada pengecualian dari pemeriksaan ini.</p>}</details>
  </section>;
}

function ImportDiffPanel({ diff }: { diff: ImportDiff }) {
  const summary = summarizeImportDiff(diff);
  const changedPreview = diff.changed.slice(0, 8);
  const addedPreview = diff.added.slice(0, 5);
  const removedPreview = diff.removed.slice(0, 5);
  return <section className="import-diff">
    <div className="import-diff-head"><strong>Perubahan dibanding snapshot aktif</strong><p>Workbook utuh tetap diunggah, tetapi Admin melihat baris mana yang benar-benar berubah. Snapshot identik tidak disimpan ulang. Riwayat lama hanya disimpan 3 import terakhir.</p></div>
    <div className="import-diff-grid">
      <div><span>Baru</span><strong>{summary.added.toLocaleString("id-ID")}</strong></div>
      <div><span>Berubah</span><strong>{summary.changed.toLocaleString("id-ID")}</strong></div>
      <div><span>Hilang dari workbook</span><strong>{summary.removed.toLocaleString("id-ID")}</strong></div>
      <div><span>Tidak berubah</span><strong>{summary.unchanged.toLocaleString("id-ID")}</strong></div>
    </div>
    {!importHasChanges(diff) && <p className="import-note">Tidak ada perbedaan isi. Menyimpan tidak akan membuat snapshot baru.</p>}
    {changedPreview.length > 0 && <div className="import-diff-list"><strong>Contoh baris berubah</strong>{changedPreview.map((item) => <div key={item.next.id}><span>{item.next.sourceSheet || "Tab"} · baris {item.next.sourceRow ?? "-"}</span><b>{item.next.title}</b><small>{item.fields.join(", ")}</small></div>)}</div>}
    {addedPreview.length > 0 && <div className="import-diff-list"><strong>Contoh baris baru</strong>{addedPreview.map((guide) => <div key={guide.id}><span>{guide.sourceSheet || "Tab"} · baris {guide.sourceRow ?? "-"}</span><b>{guide.title}</b></div>)}</div>}
    {removedPreview.length > 0 && <div className="import-diff-list"><strong>Contoh baris yang tidak ada di file ini</strong>{removedPreview.map((guide) => <div key={guide.id}><span>{guide.sourceSheet || "Tab"} · baris {guide.sourceRow ?? "-"}</span><b>{guide.title}</b></div>)}</div>}
  </section>;
}

type MappingFilter = "all" | "matched" | "missing" | "review";

function qcMappingKey(guide: Guide) {
  const variant = (guide.sourceVariant || "").split("|")[0];
  if (guide.sourceSheet && guide.sourceRow) return `source:${normalizeSearchText(guide.sourceSheet)}:${guide.sourceRow}:${normalizeSearchText(variant)}`;
  return `content:${normalizeSearchText([guide.product, guide.category, guide.subtype, guide.title].join(" "))}`;
}

function qcComparableText(value: string | undefined) {
  return normalizeSearchText(value || "");
}

function qcFlowIssues(source: Guide, current?: Guide) {
  if (!current) return ["Belum ada di data aktif"];
  const issues: string[] = [];
  if (qcComparableText(source.title) !== qcComparableText(current.title)) issues.push("Judul berbeda");
  if (qcComparableText(source.condition) !== qcComparableText(current.condition)) issues.push("Kondisi berbeda");
  if (qcComparableText(source.script) !== qcComparableText(current.script)) issues.push("Skrip berbeda");
  const sourceOutcomes = source.outcomes.map((outcome) => outcome.type).sort().join(",");
  const currentOutcomes = current.outcomes.map((outcome) => outcome.type).sort().join(",");
  if (sourceOutcomes !== currentOutcomes) issues.push("Hasil penanganan berbeda");
  const sourceFlow = source.outcomes.map((outcome) => [outcome.type, outcome.agentSteps.join(" "), outcome.ticketStatus, outcome.crmProcess].join(" ")).sort().join("|");
  const currentFlow = current.outcomes.map((outcome) => [outcome.type, outcome.agentSteps.join(" "), outcome.ticketStatus, outcome.crmProcess].join(" ")).sort().join("|");
  if (qcComparableText(sourceFlow) !== qcComparableText(currentFlow)) issues.push("Agent operation/CRM berbeda");
  if (source.images?.length !== current.images?.length) issues.push("Jumlah screenshot berbeda");
  return issues;
}

function AdminQcMapping({ sourceGuides, currentGuides, onOpenGuide }: { sourceGuides: Guide[]; currentGuides: Guide[]; onOpenGuide: (guide: Guide) => void }) {
  const [filter, setFilter] = useState<MappingFilter>("all");
  const [search, setSearch] = useState("");
  const [checked, setChecked] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const saved = JSON.parse(window.localStorage.getItem("kora-qc-checked-v1") || "[]");
      return new Set(Array.isArray(saved) ? saved.filter((item): item is string => typeof item === "string") : []);
    } catch {
      return new Set();
    }
  });
  useEffect(() => {
    window.localStorage.setItem("kora-qc-checked-v1", JSON.stringify([...checked]));
  }, [checked]);
  const activeByKey = useMemo(() => new Map(currentGuides.map((guide) => [qcMappingKey(guide), guide])), [currentGuides]);
  const rows = useMemo(() => sourceGuides.map((source) => {
    const current = activeByKey.get(qcMappingKey(source));
    const issues = qcFlowIssues(source, current);
    return { source, current, issues, status: !current ? "missing" as const : issues.length ? "review" as const : "matched" as const };
  }), [activeByKey, sourceGuides]);
  const filteredRows = useMemo(() => {
    const term = normalizeSearchText(search);
    return rows.filter((row) => {
      if (filter !== "all" && row.status !== filter) return false;
      if (!term) return true;
      const text = normalizeSearchText([row.source.sourceSheet, row.source.product, row.source.category, row.source.subtype, row.source.title, row.issues.join(" ")].filter(Boolean).join(" "));
      return term.split(" ").filter(Boolean).every((token) => text.includes(token));
    });
  }, [filter, rows, search]);
  const counts = useMemo(() => rows.reduce((result, row) => { result[row.status] += 1; return result; }, { matched: 0, missing: 0, review: 0 } as Record<Exclude<MappingFilter, "all">, number>), [rows]);
  const checkedCount = rows.filter((row) => checked.has(qcMappingKey(row.source))).length;

  function toggleChecked(key: string) {
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  return <section className="admin-qc-mapping" aria-labelledby="admin-qc-mapping-title">
    <div className="admin-qc-head"><div><span className="eyebrow muted">QC manual sebelum review tim</span><h2 id="admin-qc-mapping-title">Mapping workbook ke pedoman aktif</h2><p>Bandingkan setiap baris sumber dengan data yang tersimpan. Urutan QC mengikuti tab, kategori, subtipe, lalu baris sumber.</p></div><span className="admin-qc-checked">{checkedCount.toLocaleString("id-ID")} sudah dicek · tersimpan di browser ini</span></div>
    <div className="admin-qc-summary"><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}><strong>{rows.length.toLocaleString("id-ID")}</strong><span>Total sumber</span></button><button className={filter === "matched" ? "active matched" : "matched"} onClick={() => setFilter("matched")}><strong>{counts.matched.toLocaleString("id-ID")}</strong><span>Cocok</span></button><button className={filter === "review" ? "active review" : "review"} onClick={() => setFilter("review")}><strong>{counts.review.toLocaleString("id-ID")}</strong><span>Perlu cek flow</span></button><button className={filter === "missing" ? "active missing" : "missing"} onClick={() => setFilter("missing")}><strong>{counts.missing.toLocaleString("id-ID")}</strong><span>Belum ada</span></button></div>
    <div className="admin-qc-toolbar"><div className="scenario-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari judul, tab, kategori..." aria-label="Cari mapping QC" /></div><span>{filteredRows.length.toLocaleString("id-ID")} baris ditampilkan</span></div>
    <div className="admin-qc-list">{filteredRows.map((row) => { const key = qcMappingKey(row.source); return <div className={`admin-qc-row ${row.status}`} key={key}><label className="admin-qc-check"><input type="checkbox" checked={checked.has(key)} onChange={() => toggleChecked(key)} /><span /></label><div className="admin-qc-row-main"><div className="admin-qc-row-title"><strong>{row.source.title}</strong><span className={`admin-qc-status ${row.status}`}>{row.status === "matched" ? "✓ Cocok" : row.status === "missing" ? "Belum ada" : "Perlu cek flow"}</span></div><small>{row.source.sourceSheet || "Tab tidak diketahui"} · baris {row.source.sourceRow ?? "-"} · {row.source.category} · {row.source.subtype}</small>{row.issues.length > 0 && <p>{row.issues.join(" · ")}</p>}</div><button className="secondary-button" onClick={() => onOpenGuide(row.current ?? row.source)}>{row.current ? "Lihat flow" : "Lihat sumber"}<ChevronRight size={14} /></button></div>; })}</div>
    {!filteredRows.length && <div className="admin-empty">Tidak ada baris yang sesuai filter QC.</div>}
  </section>;
}

function AdminFlowPreview({ guide, onClose }: { guide: Guide; onClose: () => void }) {
  return <section className="admin-flow-preview"><div className="admin-flow-preview-head"><div><span className="eyebrow muted">Pratinjau untuk QC tim</span><strong>Flow lengkap seperti Agent</strong><small>Screenshot, kondisi, skrip, dan hasil penanganan ditampilkan dalam satu alur.</small></div><button className="secondary-button" onClick={onClose}>Tutup pratinjau</button></div><GuideDetail guide={guide} onBack={onClose} /></section>;
}

const outcomeTypes: OutcomeType[] = ["tier_1", "tier_2_3", "transfer_asi", "reference"];

function cloneGuide(guide: Guide): Guide {
  return { ...guide, investigation: [...guide.investigation], outcomes: guide.outcomes.map((outcome) => ({ ...outcome, agentSteps: [...outcome.agentSteps] })) };
}

function textToList(value: string) {
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

function listToText(value: string[]) {
  return value.join("\n");
}

function validateForPublish(guide: Guide) {
  const errors: string[] = [];
  if (!guide.title.trim()) errors.push("Judul kondisi belum diisi.");
  if (!guide.condition.trim()) errors.push("Kondisi pelanggan belum diisi.");
  if (!guide.script.trim() || guide.script.toLowerCase().includes("belum diisi")) errors.push("Skrip Live Chat belum lengkap.");
  if (!guide.outcomes.length) errors.push("Tambahkan minimal satu hasil penanganan.");
  guide.outcomes.forEach((outcome, index) => {
    if (!outcome.decision.trim()) errors.push("Opsi " + (index + 1) + ": kapan dipilih belum diisi.");
    if (!outcome.agentSteps.length) errors.push("Opsi " + (index + 1) + ": langkah agent belum diisi.");
    if (!outcome.ticketStatus.trim()) errors.push("Opsi " + (index + 1) + ": status tiket belum diisi.");
    if (!outcome.crmProcess.trim()) errors.push("Opsi " + (index + 1) + ": proses CRM belum diisi.");
  });
  if (new Set(guide.outcomes.map((outcome) => outcome.type)).size !== guide.outcomes.length) errors.push("Satu jenis hasil penanganan hanya boleh dipakai satu kali.");
  return errors;
}

function ScenarioEditor({ guide, onCancel, onSave }: { guide: Guide; onCancel: () => void; onSave: (guide: Guide, publish: boolean) => Promise<void> }) {
  const [draft, setDraft] = useState(() => cloneGuide(guide));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function updateDraft(patch: Partial<Guide>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function updateOutcome(index: number, patch: Partial<Guide["outcomes"][number]>) {
    setDraft((current) => ({ ...current, outcomes: current.outcomes.map((outcome, outcomeIndex) => outcomeIndex === index ? { ...outcome, ...patch } : outcome) }));
  }

  function addOutcome() {
    const nextType = outcomeTypes.find((type) => !draft.outcomes.some((outcome) => outcome.type === type));
    if (!nextType) {
      setError("Semua jenis hasil penanganan sudah tersedia.");
      return;
    }
    setDraft((current) => ({ ...current, outcomes: [...current.outcomes, { id: "draft-" + Date.now(), type: nextType, decision: "", agentSteps: [], ticketStatus: "", crmProcess: "", escalationTeam: "" }] }));
  }

  function removeOutcome(index: number) {
    setDraft((current) => ({ ...current, outcomes: current.outcomes.filter((_, outcomeIndex) => outcomeIndex !== index) }));
  }

  async function submit(publish: boolean) {
    const prepared = { ...draft, investigation: draft.investigation.filter(Boolean), outcomes: draft.outcomes.map((outcome) => ({ ...outcome, decision: outcome.decision.trim(), agentSteps: outcome.agentSteps.filter(Boolean), ticketStatus: outcome.ticketStatus.trim(), crmProcess: outcome.crmProcess.trim(), escalationTeam: outcome.escalationTeam?.trim() || undefined })) };
    if (publish) {
      const validationErrors = validateForPublish(prepared);
      if (validationErrors.length) {
        setError(validationErrors.slice(0, 4).join(" "));
        return;
      }
    }
    setBusy(true);
    setError("");
    try {
      await onSave({ ...prepared, status: publish ? "Published" : "Draft", needsReview: !publish && Boolean(prepared.needsReview) }, publish);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Perubahan belum berhasil disimpan.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="scenario-editor"><div className="editor-header"><div><button className="back-link" onClick={onCancel}><ArrowLeft size={15} /> Kembali ke daftar skenario</button><span className="eyebrow muted">Edit satu kondisi</span><h1>{draft.title || "Kondisi pelanggan"}</h1><p>Perubahan hanya berlaku untuk kondisi ini, bukan seluruh kategori.</p></div><span className={"scenario-status " + (draft.status === "Published" ? "published" : draft.status === "Perlu diperiksa" ? "review" : "draft")}>{draft.status}</span></div><div className="editor-context"><strong>{draft.product}</strong><span>›</span><span>{draft.category}</span><span>›</span><span>{draft.subtype}</span></div><section className="editor-section"><div className="editor-section-title"><span>01</span><div><h2>Informasi kondisi</h2><p>Perbaiki inti pedoman yang dibaca Agent.</p></div></div><div className="editor-grid"><label className="editor-field full">Judul kondisi<input value={draft.title} onChange={(event) => updateDraft({ title: event.target.value })} /></label><label className="editor-field full">Kondisi pelanggan<textarea rows={3} value={draft.condition} onChange={(event) => updateDraft({ condition: event.target.value, title: draft.title || event.target.value.split(/\r?\n/)[0] })} /></label><label className="editor-field full">Cek / penyelidikan <small>Opsional; satu langkah per baris jika tersedia</small><textarea rows={5} value={listToText(draft.investigation)} onChange={(event) => updateDraft({ investigation: textToList(event.target.value) })} /></label><label className="editor-field full">Skrip Live Chat<textarea rows={5} value={draft.script} onChange={(event) => updateDraft({ script: event.target.value })} /></label><label className="editor-field full">Catatan perhatian <small>Opsional</small><textarea rows={3} value={draft.warning ?? ""} onChange={(event) => updateDraft({ warning: event.target.value || undefined })} /></label></div></section><section className="editor-section"><div className="editor-section-title"><span>02</span><div><h2>Hasil penanganan</h2><p>Pilih kalimat yang langsung dipahami Agent.</p></div><button className="secondary-button" onClick={addOutcome}>Tambah hasil</button></div><div className="editor-outcomes">{draft.outcomes.map((outcome, index) => <article className="editor-outcome" key={outcome.id}><div className="editor-outcome-head"><strong>Hasil {index + 1}</strong><button className="text-danger" onClick={() => removeOutcome(index)}>Hapus</button></div><label className="editor-field">Jenis hasil<select value={outcome.type} onChange={(event) => updateOutcome(index, { type: event.target.value as OutcomeType })}>{outcomeTypes.map((type) => <option key={type} value={type}>{outcomeLabel(type)}</option>)}</select></label><label className="editor-field">Kapan dipilih<textarea rows={3} value={outcome.decision} onChange={(event) => updateOutcome(index, { decision: event.target.value })} /></label><label className="editor-field">Langkah agent <small>Satu langkah per baris</small><textarea rows={4} value={listToText(outcome.agentSteps)} onChange={(event) => updateOutcome(index, { agentSteps: textToList(event.target.value) })} /></label><div className="editor-grid compact"><label className="editor-field">Status tiket<input value={outcome.ticketStatus} onChange={(event) => updateOutcome(index, { ticketStatus: event.target.value })} /></label><label className="editor-field">Tim tujuan <small>Opsional</small><input value={outcome.escalationTeam ?? ""} onChange={(event) => updateOutcome(index, { escalationTeam: event.target.value })} /></label></div><label className="editor-field">Proses CRM<textarea rows={3} value={outcome.crmProcess} onChange={(event) => updateOutcome(index, { crmProcess: event.target.value })} /></label></article>)}</div></section>{error && <div className="editor-error"><X size={16} /><span>{error}</span></div>}<div className="editor-actions"><button className="secondary-button" onClick={onCancel} disabled={busy}>Batal</button><button className="secondary-button" onClick={() => void submit(false)} disabled={busy}>{busy ? "Menyimpan..." : "Simpan Draft"}</button><button className="primary-button" onClick={() => void submit(true)} disabled={busy}>{busy ? "Menyimpan..." : "Publish"}</button></div></div>;
}

function AnnouncementsPanel({ items, localOnly, onSave, onDelete }: { items: Announcement[]; localOnly: boolean; onSave: AdminConsoleProps["onSaveAnnouncement"]; onDelete: AdminConsoleProps["onDeleteAnnouncement"] }) {
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [tone, setTone] = useState<AnnouncementTone>("info");
  const [published, setPublished] = useState(true);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function startEdit(item: Announcement) {
    setEditingId(item.id);
    setTitle(item.title);
    setDetail(item.detail);
    setTone(item.tone);
    setPublished(item.published);
    setError("");
  }

  function resetForm() {
    setEditingId(undefined);
    setTitle("");
    setDetail("");
    setTone("info");
    setPublished(true);
  }

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await onSave({ id: editingId, title, detail, tone, published });
      resetForm();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Pengumuman belum tersimpan.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="ops-panel">
    <span className="eyebrow muted">Beranda Agent</span>
    <h1>Update penting</h1>
    <p>Tulis pengumuman yang tampil di beranda Agent. Data contoh lama sudah tidak dipakai.</p>
    {localOnly && <div className="ops-local-note">Tabel database belum tersedia. Pengumuman tersimpan di browser ini sampai SQL `supabase/add-announcements-and-feedback.sql` dijalankan.</div>}
    <div className="announcement-form">
      <label>Judul<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Contoh: Skrip pembayaran diperbarui" /></label>
      <label>Isi / konteks<textarea rows={3} value={detail} onChange={(event) => setDetail(event.target.value)} placeholder="Produk, tanggal, atau ringkasan perubahan" /></label>
      <div className="announcement-form-row">
        <label>Nada<select value={tone} onChange={(event) => setTone(event.target.value as AnnouncementTone)}><option value="info">Informasi</option><option value="warning">Perlu perhatian</option><option value="success">Selesai / diverifikasi</option></select></label>
        <label className="announcement-publish"><input type="checkbox" checked={published} onChange={(event) => setPublished(event.target.checked)} /> Tampilkan ke Agent</label>
      </div>
      {error && <div className="import-error"><X size={16} /><span>{error}</span></div>}
      <div className="editor-actions"><button className="secondary-button" type="button" onClick={resetForm} disabled={busy}>Batal</button><button className="primary-button" type="button" onClick={() => void submit()} disabled={busy}>{busy ? "Menyimpan..." : editingId ? "Simpan perubahan" : "Terbitkan update"}</button></div>
    </div>
    <div className="announcement-list">{items.length ? items.map((item) => <article key={item.id} className={`announcement-card ${item.published ? "published" : "draft"}`}><div><strong>{item.title}</strong><p>{item.detail}</p><small>{item.published ? "Tampil di Agent" : "Draft"} · {new Date(item.createdAt).toLocaleString("id-ID")}</small></div><div className="announcement-card-actions"><button className="secondary-button" onClick={() => startEdit(item)}>Edit</button><button className="text-danger" onClick={() => void onDelete(item.id)}>Hapus</button></div></article>) : <div className="empty-state-v4"><strong>Belum ada update penting</strong><p>Agent akan melihat kotak kosong sampai ada pengumuman yang dipublish.</p></div>}</div>
  </section>;
}

function FeedbackPanel({ items, localOnly }: { items: GuideFeedbackRecord[]; localOnly: boolean }) {
  const reports = items.filter((item) => !item.helpful);
  const helpful = items.filter((item) => item.helpful);
  const grouped = new Map<string, { title: string; product: string; reports: number; helpful: number }>();
  for (const item of items) {
    const current = grouped.get(item.guideId) ?? { title: item.guideTitle, product: item.product, reports: 0, helpful: 0 };
    if (item.helpful) current.helpful += 1;
    else current.reports += 1;
    grouped.set(item.guideId, current);
  }
  const ranked = [...grouped.values()].sort((left, right) => right.reports - left.reports || right.helpful - left.helpful);
  return <section className="ops-panel">
    <span className="eyebrow muted">Quality</span>
    <h1>Masukan Agent</h1>
    <p>Tombol “Membantu” dan “Laporkan masalah” sekarang tersimpan. Quality bisa melihat pedoman mana yang sering bermasalah.</p>
    {localOnly && <div className="ops-local-note">Tabel database belum tersedia. Masukan Agent tersimpan di browser ini sampai SQL `supabase/add-announcements-and-feedback.sql` dijalankan.</div>}
    <div className="scenario-summary"><div><span>Laporan masalah</span><strong>{reports.length.toLocaleString("id-ID")}</strong></div><div><span>Dinyatakan membantu</span><strong>{helpful.length.toLocaleString("id-ID")}</strong></div><div><span>Pedoman dengan masukan</span><strong>{ranked.length.toLocaleString("id-ID")}</strong></div></div>
    {ranked.length > 0 && <div className="feedback-rank"><strong>Pedoman dengan masukan</strong>{ranked.slice(0, 20).map((row) => <div key={row.title + row.product}><b>{row.title}</b><small>{row.product} · {row.reports} laporan · {row.helpful} membantu</small></div>)}</div>}
    <div className="admin-review-list">{reports.length ? reports.map((item) => <div key={item.id} className="admin-review-item feedback-item"><div><strong>{item.guideTitle}</strong><small>{item.comment || "Tanpa catatan"}</small><em>{item.product} · {item.category} · {item.sourceSheet || "tanpa tab"}{item.sourceRow ? ` · baris ${item.sourceRow}` : ""} · {new Date(item.createdAt).toLocaleString("id-ID")}</em></div></div>) : <div className="empty-state-v4"><LifeBuoy size={25} /><strong>Belum ada laporan masalah</strong><p>Kalau Agent menekan “Laporkan masalah”, isinya muncul di sini.</p></div>}</div>
  </section>;
}

function AdminConsoleBody(props: AdminConsoleProps) {
  const { importedGuides, importSummary, onImport, onSaveScenario, onSignOut } = props;
  const [view, setView] = useState<AdminView>("content");
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [previewDiff, setPreviewDiff] = useState<ImportDiff | null>(null);
  const [lastImportResult, setLastImportResult] = useState<SaveImportResult | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearchInput = useDebouncedValue(searchInput, 180);
  const [qcSheet, setQcSheet] = useState("");
  const [qcCategory, setQcCategory] = useState("");
  const [qcSubtype, setQcSubtype] = useState("");
  const [qcSort, setQcSort] = useState<AdminScenarioSort>("default");
  const [page, setPage] = useState(1);
  const [editingGuide, setEditingGuide] = useState<Guide | null>(null);
  const [browseSelection, setBrowseSelection] = useState<AdminBrowseSelection>({ area: "products", productId: null, category: null, subtype: null });
  const pageSize = 100;
  const displayGuides = useMemo(() => importedGuides.length ? importedGuides : [...guides, ...operationalGuides], [importedGuides]);
  const browseGuides = useMemo(() => {
    const catalog = buildProductCatalog(displayGuides);
    if (browseSelection.area === "operational") {
      return displayGuides.filter((guide) => isOperationalGuide(guide) && (!browseSelection.category || taxonomyKey(guide.category) === taxonomyKey(browseSelection.category)) && (!browseSelection.subtype || taxonomyKey(guide.subtype) === taxonomyKey(browseSelection.subtype)));
    }
    if (!browseSelection.productId) return displayGuides;
    const product = catalog.find((item) => item.id === browseSelection.productId);
    if (!product) return displayGuides;
    return displayGuides.filter((guide) => guideMatchesProduct(guide, product) && (!browseSelection.category || categoryTaxonomyKey(product.id, guide.category) === categoryTaxonomyKey(product.id, browseSelection.category)) && (!browseSelection.subtype || taxonomyKey(guide.subtype) === taxonomyKey(browseSelection.subtype)));
  }, [browseSelection, displayGuides]);
  const qcSheetOptions = useMemo(() => [...new Set(displayGuides.map((guide) => guide.sourceSheet).filter((sheet): sheet is string => Boolean(sheet)))].sort((a, b) => a.localeCompare(b, "id")), [displayGuides]);
  const qcSheetGuides = useMemo(() => qcSheet ? displayGuides.filter((guide) => guide.sourceSheet === qcSheet) : displayGuides, [displayGuides, qcSheet]);
  const qcCategoryOptions = useMemo(() => uniqueTaxonomyLabels(qcSheetGuides.map((guide) => guide.category)).sort((a, b) => a.localeCompare(b, "id")), [qcSheetGuides]);
  const qcCategoryGuides = useMemo(() => qcCategory ? qcSheetGuides.filter((guide) => taxonomyKey(guide.category) === taxonomyKey(qcCategory)) : qcSheetGuides, [qcCategory, qcSheetGuides]);
  const qcSubtypeOptions = useMemo(() => uniqueTaxonomyLabels(qcCategoryGuides.map((guide) => guide.subtype)).sort((a, b) => a.localeCompare(b, "id")), [qcCategoryGuides]);
  const filteredGuides = useMemo(() => {
    const term = normalizeSearchText(debouncedSearchInput);
    const tokens = term.split(" ").filter(Boolean);
    const candidates = browseGuides.filter((guide) => (!qcSheet || guide.sourceSheet === qcSheet) && (!qcCategory || taxonomyKey(guide.category) === taxonomyKey(qcCategory)) && (!qcSubtype || taxonomyKey(guide.subtype) === taxonomyKey(qcSubtype)));
    const searched = !term ? candidates : candidates.filter((guide) => {
      const text = normalizeSearchText([guide.product, guide.category, guide.subtype, guide.title, guide.condition, guide.status, guide.reviewReason].filter(Boolean).join(" "));
      return tokens.every((token) => text.includes(token));
    });
    if (qcSort === "default") return searched;
    return [...searched].sort((a, b) => {
      const sourceSheetCompare = (a.sourceSheet ?? "").localeCompare(b.sourceSheet ?? "", "id");
      if (sourceSheetCompare !== 0) return sourceSheetCompare;
      const aRow = a.sourceRow ?? Number.MAX_SAFE_INTEGER;
      const bRow = b.sourceRow ?? Number.MAX_SAFE_INTEGER;
      return qcSort === "source_asc" ? aRow - bRow : bRow - aRow;
    });
  }, [browseGuides, debouncedSearchInput, qcCategory, qcSheet, qcSort, qcSubtype]);
  const totalPages = Math.max(1, Math.ceil(filteredGuides.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visibleGuides = filteredGuides.slice((safePage - 1) * pageSize, safePage * pageSize);
  const reviewGuides = displayGuides.filter((guide) => Boolean(guide.reviewReason) || guide.needsReview || guide.status === "Perlu diperiksa");
  const activeScenarioCount = displayGuides.length;
  const tier1Count = displayGuides.flatMap((guide) => guide.outcomes).filter((outcome) => outcome.type === "tier_1").length;
  const escalationCount = displayGuides.flatMap((guide) => guide.outcomes).filter((outcome) => outcome.type === "tier_2_3").length;
  const qcErrorCount = preview?.qc.checks.filter((check) => check.status === "error").length ?? 0;

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsParsing(true);
    setError("");
    try {
      const parsed = await parseExcelFile(file);
      setPreview(parsed);
      setPreviewDiff(diffGuides(importedGuides, parsed.guides));
      setLastImportResult(null);
    } catch (parseError) {
      setPreview(null);
      setPreviewDiff(null);
      setError(parseError instanceof Error ? parseError.message : "File Excel tidak dapat dibaca.");
    } finally {
      setIsParsing(false);
      event.target.value = "";
    }
  }

  async function confirmImport() {
    if (!preview) return;
    setError("");
    setIsSaving(true);
    try {
      const saved = await onImport(preview);
      setLastImportResult(saved ?? null);
      setPreview(null);
      setPreviewDiff(null);
      setView("review");
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : typeof saveError === "object" && saveError !== null && "message" in saveError ? String((saveError as { message?: unknown }).message ?? "") : "";
      setError(message ? "Staging lokal tersimpan, tetapi database gagal: " + message : "Staging lokal tersimpan, tetapi database gagal menerima data.");
    } finally {
      setIsSaving(false);
    }
  }

  return <main className="admin-app"><header className="admin-topbar"><div className="agent-brand"><span className="brand-mark"><KoraMark size={19} /></span><span className="brand-lockup"><strong>KORA</strong><span>Knowledge Operations &amp; Resolution Access</span></span><em>Admin KM</em></div><button className="icon-button" onClick={onSignOut} aria-label="Keluar"><LogOut size={17} /></button></header><div className="admin-layout"><aside>
    <button className={view === "content" && !editingGuide ? "active" : ""} onClick={() => { setEditingGuide(null); setView("content"); }}><Database size={16} />Skenario</button>
    <button className={view === "import" && !editingGuide ? "active" : ""} onClick={() => { setEditingGuide(null); setView("import"); }}><Upload size={16} />Import Excel</button>
    <button className={view === "review" && !editingGuide ? "active" : ""} onClick={() => { setEditingGuide(null); setView("review"); }}><ClipboardCheck size={16} />Catatan import</button>
    <button className={view === "updates" && !editingGuide ? "active" : ""} onClick={() => { setEditingGuide(null); setView("updates"); }}><Zap size={16} />Pengumuman</button>
    <button className={view === "feedback" && !editingGuide ? "active" : ""} onClick={() => { setEditingGuide(null); setView("feedback"); }}><LifeBuoy size={16} />Masukan Agent</button>
  </aside><section className="admin-content-v4">{editingGuide ? <ScenarioEditor guide={editingGuide} onCancel={() => setEditingGuide(null)} onSave={async (guide, publish) => { await onSaveScenario(guide, publish); setEditingGuide(null); }} /> : <>
    {view === "content" && <><span className="eyebrow muted">Knowledge Management</span><h1>Kelola Skenario</h1><p>Satu kondisi pelanggan memiliki satu pedoman. Perubahan dilakukan per kondisi, bukan per seluruh kategori.</p><div className="scenario-summary"><div><span>Scenario aktif</span><strong>{activeScenarioCount.toLocaleString("id-ID")}</strong></div><div><span>Selesai Tier 1</span><strong>{tier1Count.toLocaleString("id-ID")}</strong></div><div><span>Eskalasi ke Tier 2/3</span><strong>{escalationCount.toLocaleString("id-ID")}</strong></div></div>{importSummary && <div className="import-status-line"><CheckCircle2 size={15} /><span>Import terakhir: <strong>{importSummary.fileName}</strong> · {importSummary.scenarios.toLocaleString("id-ID")} scenario menjadi snapshot terbaru</span></div>}<div className="qc-manual-tools"><div className="qc-manual-copy"><ClipboardCheck size={15} /><div><strong>QC manual</strong><small>Pilih tab sumber, lalu kategori dan subtipe tiket.</small></div></div><div className="qc-manual-controls"><label><span>Tab sumber</span><select value={qcSheet} onChange={(event) => { setQcSheet(event.target.value); setQcCategory(""); setQcSubtype(""); setPage(1); }}><option value="">Semua tab</option>{qcSheetOptions.map((sheet) => <option key={sheet} value={sheet}>{sheet}</option>)}</select></label><label><span>Kategori</span><select value={qcCategory} disabled={!qcSheet} onChange={(event) => { setQcCategory(event.target.value); setQcSubtype(""); setPage(1); }}><option value="">{qcSheet ? "Semua kategori" : "Pilih tab dulu"}</option>{qcCategoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}</select></label><label><span>Subtipe tiket</span><select value={qcSubtype} disabled={!qcCategory} onChange={(event) => { setQcSubtype(event.target.value); setPage(1); }}><option value="">{qcCategory ? "Semua subtipe" : "Pilih kategori dulu"}</option>{qcSubtypeOptions.map((subtype) => <option key={subtype} value={subtype}>{subtype}</option>)}</select></label><label><span>Urutkan</span><select value={qcSort} onChange={(event) => { setQcSort(event.target.value as AdminScenarioSort); setPage(1); }}><option value="default">Urutan tampilan</option><option value="source_asc">Baris sumber: kecil ke besar</option><option value="source_desc">Baris sumber: besar ke kecil</option></select></label></div></div><AdminCategoryNavigator guides={displayGuides} selection={browseSelection} onChange={(nextSelection) => { setBrowseSelection(nextSelection); setQcSheet(""); setQcCategory(""); setQcSubtype(""); setSearchInput(""); setPage(1); }} /><div className="scenario-toolbar"><div className="scenario-search"><Search size={16} /><input value={searchInput} onChange={(event) => { setSearchInput(event.target.value); setPage(1); }} placeholder="Ketik kondisi, produk, kategori..." aria-label="Cari scenario" /></div><span>{filteredGuides.length.toLocaleString("id-ID")} scenario ditemukan</span></div><div className="scenario-table">{visibleGuides.map((guide) => <div key={guide.id}><div><strong><HighlightedText text={guide.title} query={searchInput} /></strong><small><HighlightedText text={guide.product + " · " + guide.category + " · " + guide.subtype} query={searchInput} /></small></div><span className={"scenario-status " + (guide.status === "Published" ? "published" : guide.status === "Perlu diperiksa" ? "review" : "draft")}>{guide.status}</span>{guide.sourceRow ? <span className="scenario-source-row">Baris {guide.sourceRow}</span> : null}<button onClick={() => { setEditingGuide(guide); setError(""); }}>Edit <ChevronRight size={14} /></button></div>)}</div>{visibleGuides.length === 0 && <div className="admin-empty">Tidak ada scenario yang cocok dengan pencarian.</div>}<div className="scenario-pagination"><span>Menampilkan {filteredGuides.length ? ((safePage - 1) * pageSize) + 1 : 0}–{Math.min(safePage * pageSize, filteredGuides.length)} dari {filteredGuides.length.toLocaleString("id-ID")} · 100 per halaman</span><div><button disabled={safePage === 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Sebelumnya</button><strong>Halaman {safePage} dari {totalPages}</strong><button disabled={safePage === totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Berikutnya</button></div></div></>}
    {view === "import" && <><span className="eyebrow muted">Bulk import</span><h1>Import Scenario dari Excel</h1><p>Unggah workbook utuh. Sistem membandingkan dengan snapshot aktif, menampilkan baris yang berubah, dan hanya menyimpan snapshot baru jika ada perbedaan. Riwayat lama dibersihkan sampai 3 import terakhir.</p><label className={"import-drop-v4 " + (preview ? "ready" : "")} htmlFor="excel-import-input">{isParsing ? <Zap size={26} className="spin" /> : preview ? <CheckCircle2 size={26} /> : <Upload size={26} />}<strong>{isParsing ? "Sedang membaca workbook..." : preview ? preview.summary.fileName + " siap direview" : "Klik untuk memilih file Excel"}</strong><span>{preview ? "Periksa diff dan QC di bawah sebelum menyimpan snapshot." : "Format .xlsx atau .xls · screenshot harus berupa URL di sel, bukan gambar tempel."}</span><input id="excel-import-input" className="import-file-input" type="file" accept=".xlsx,.xls" onChange={handleFile} /></label>{error && <div className="import-error"><X size={16} /><span>{error}</span></div>}{preview && <><div className="import-preview-head"><div><span className="eyebrow muted">Preview hasil import</span><h2>{preview.summary.scenarios.toLocaleString("id-ID")} scenario terdeteksi</h2></div><button className="secondary-button" onClick={() => { setPreview(null); setPreviewDiff(null); }}>Pilih file lain</button></div><div className="import-summary-grid"><div><span>Baris sumber</span><strong>{preview.summary.sourceRows.toLocaleString("id-ID")}</strong></div><div><span>Hasil penanganan</span><strong>{preview.summary.outcomes.toLocaleString("id-ID")}</strong></div><div><span>Catatan import</span><strong>{preview.summary.reviewCount.toLocaleString("id-ID")}</strong></div><div><span>Duplikat digabung</span><strong>{preview.summary.duplicateRows.toLocaleString("id-ID")}</strong></div></div>{previewDiff && <ImportDiffPanel diff={previewDiff} />}{preview.embeddedDrawings.mediaFiles > 0 && <div className="import-issues pasted-images"><strong>Gambar tempel terdeteksi ({preview.embeddedDrawings.mediaFiles} file)</strong><div><span>Gambar yang di-paste ke Excel tidak ikut ke web. Letakkan link Drive atau ibb.co di sel screenshot. Kalau sheet kurang rapi, jangan tempel gambar mengambang — taruh URL di kolom yang sama dengan kasusnya.</span></div></div>}<ImportQcDashboard report={preview.qc} />{preview.issues.length > 0 && <div className="import-issues"><strong>Catatan import (tidak menghambat publish)</strong>{preview.issues.slice(0, 5).map((issue) => <div key={issue.reason}><span>{issue.reason}</span><b>{issue.count.toLocaleString("id-ID")}</b></div>)}</div>}{preview.summary.skippedSheets.length > 0 && <p className="import-note">Sheet di luar mapping dilewati: {preview.summary.skippedSheets.join(", ")}</p>}<button className="primary-button" onClick={confirmImport} disabled={isSaving || qcErrorCount > 0 || Boolean(previewDiff && !importHasChanges(previewDiff) && importedGuides.length)}>{isSaving ? "Sedang menyimpan ke database..." : qcErrorCount ? "Perbaiki QC sebelum publish" : previewDiff && !importHasChanges(previewDiff) && importedGuides.length ? "Tidak ada perubahan untuk disimpan" : "Simpan snapshot terbaru"} <ArrowRight size={16} /></button></>}</>}
    {view === "review" && <><span className="eyebrow muted">Catatan import</span><h1>Catatan import</h1>{lastImportResult && <div className="import-status-line"><CheckCircle2 size={15} /><span>{lastImportResult.skipped ? "File sama dengan snapshot aktif, tidak disimpan ulang." : `Snapshot baru disimpan. ${lastImportResult.diff.changed.length} berubah · ${lastImportResult.diff.added.length} baru · ${lastImportResult.diff.removed.length} hilang.`}{lastImportResult.pruned ? ` ${lastImportResult.pruned} import lama dihapus.` : ""}</span></div>}{lastImportResult && !lastImportResult.skipped && <ImportDiffPanel diff={lastImportResult.diff} />}<p>{reviewGuides.length.toLocaleString("id-ID")} scenario memiliki catatan dari sumber (tidak menghambat publish).</p>{reviewGuides.length ? <div className="admin-review-list">{reviewGuides.slice(0, 100).map((guide) => <button key={guide.id} className="admin-review-item" onClick={() => { setEditingGuide(guide); setError(""); }}><div><strong>{guide.title}</strong><small>{guide.reviewReason || "Catatan dari sumber; perbaikan bersifat opsional."}</small></div><ChevronRight size={17} /></button>)}</div> : <div className="empty-state-v4"><ClipboardCheck size={25} /><strong>Belum ada catatan import</strong><p>Import berikutnya akan menampilkan catatan sumber di halaman ini.</p></div>}</>}
    {view === "updates" && <AnnouncementsPanel items={props.announcements} localOnly={props.announcementsLocalOnly} onSave={props.onSaveAnnouncement} onDelete={props.onDeleteAnnouncement} />}
    {view === "feedback" && <FeedbackPanel items={props.feedbackItems} localOnly={props.feedbackLocalOnly} />}
  </>}</section></div></main>;
}

function AdminQcWorkspace({ importedGuides, onBack, onSignOut }: { importedGuides: Guide[]; onBack: () => void; onSignOut: () => void }) {
  const [sourcePreview, setSourcePreview] = useState<ImportResult | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState("");
  const [selectedGuide, setSelectedGuide] = useState<Guide | null>(null);
  const currentGuides = useMemo(() => importedGuides.length ? importedGuides : [...guides, ...operationalGuides], [importedGuides]);

  async function handleSourceFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsParsing(true);
    setError("");
    try {
      setSourcePreview(await parseExcelFile(file));
      setSelectedGuide(null);
    } catch (parseError) {
      setSourcePreview(null);
      setError(parseError instanceof Error ? parseError.message : "File Excel tidak dapat dibaca.");
    } finally {
      setIsParsing(false);
      event.target.value = "";
    }
  }

  return <main className="admin-app"><header className="admin-topbar"><div className="agent-brand"><span className="brand-mark"><KoraMark size={19} /></span><span className="brand-lockup"><strong>KORA</strong><span>Knowledge Operations &amp; Resolution Access</span></span><em>Admin KM</em></div><div className="admin-qc-top-actions"><button className="secondary-button" onClick={onBack}>Kembali ke skenario</button><button className="icon-button" onClick={onSignOut} aria-label="Keluar"><LogOut size={17} /></button></div></header><div className="admin-layout"><aside><button className="active"><ClipboardCheck size={16} />QC mapping</button><button onClick={onBack}><Database size={16} />Skenario</button></aside><section className="admin-content-v4 admin-qc-workspace"><span className="eyebrow muted">QC manual</span><h1>Mapping pedoman sumber</h1><p>Upload workbook yang ingin dicek. KORA akan mencocokkan tab, baris sumber, kategori, subtipe, isi, screenshot, dan hasil penanganan dengan data aktif.</p><label className={`import-drop-v4 qc-upload ${sourcePreview ? "ready" : ""}`} htmlFor="qc-source-input">{isParsing ? <Zap size={26} className="spin" /> : sourcePreview ? <CheckCircle2 size={26} /> : <Upload size={26} />}<strong>{isParsing ? "Sedang membaca workbook..." : sourcePreview ? `${sourcePreview.summary.fileName} siap dipetakan` : "Pilih workbook sumber untuk QC"}</strong><span>File tidak disimpan ulang. Pemeriksaan dilakukan di browser dan hasilnya bisa ditandai tim.</span><input id="qc-source-input" className="import-file-input" type="file" accept=".xlsx,.xls" onChange={handleSourceFile} /></label>{error && <div className="import-error"><X size={16} /><span>{error}</span></div>}{sourcePreview && !selectedGuide && <AdminQcMapping sourceGuides={sourcePreview.guides} currentGuides={currentGuides} onOpenGuide={setSelectedGuide} />}{sourcePreview && selectedGuide && <><button className="back-link admin-qc-back" onClick={() => setSelectedGuide(null)}><ArrowLeft size={15} /> Kembali ke hasil mapping</button><AdminFlowPreview guide={selectedGuide} onClose={() => setSelectedGuide(null)} /></>}</section></div></main>;
}

export function AdminConsole(props: AdminConsoleProps) {
  const [qcOpen, setQcOpen] = useState(false);
  if (qcOpen) return <AdminQcWorkspace importedGuides={props.importedGuides} onBack={() => setQcOpen(false)} onSignOut={props.onSignOut} />;
  return <><button className="admin-qc-launcher" onClick={() => setQcOpen(true)}><ClipboardCheck size={15} />QC mapping</button><AdminConsoleBody {...props} /></>;
}
