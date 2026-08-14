"use client";

import { useState, type ReactNode } from "react";
import { ArrowLeft, Check, CheckCircle2, ChevronRight, Copy, Zap } from "lucide-react";
import type { Guide, GuideImage, ScenarioOutcome } from "@/lib/mock-data";
import type { GuideFeedbackInput } from "@/lib/ops-types";
import { defaultOutcomeId, escalationStepsForDisplay, outcomeLabel, outcomeTone } from "@/lib/guide-ui";
import { formatScriptForCopy, hasExplicitListMarkers, isUserReplyMarker, normalizeScriptLine, prepareGuideForDisplay, splitGuidePoints, splitInternalScriptNotes, splitStableScriptContent, withoutDuplicateTitle } from "@/lib/guide-display";
import { GuideFeedbackRow } from "@/components/guide-feedback";

function GuideText({ value, className = "" }: { value: string; className?: string }) {
  const lines = value.replace(/\r/g, "").split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return null;
  const isConditionBlock = className.includes("condition-points");
  return <div className={`guide-text ${className} ${isConditionBlock ? "condition-highlights" : ""}`}>{lines.map((line, index) => <p className={isConditionBlock && /\b(?:user\s+share\s+password|usp|account\s+take\s+over|ato|penipuan\s+virtual\s+account|pemalsuan\s+akun|kondisi\s+tidak\s+jelas)\b/i.test(line) ? "condition-keyword" : undefined} key={`${line}-${index}`}>{line}</p>)}</div>;
}

function GuideImageCard({ image, index }: { image: GuideImage; index: number }) {
  const [mode, setMode] = useState<"proxy" | "source" | "failed">("proxy");
  const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(image.url)}`;
  const src = mode === "proxy" ? proxyUrl : image.url;
  return <figure className="guide-image-card"><div className="guide-image-frame">{mode === "failed" ? <div className="guide-image-fallback"><span>Gambar tidak dapat dimuat otomatis.</span><a href={image.url} target="_blank" rel="noreferrer">Buka sumber gambar</a></div> : <img src={src} alt={image.label || `Screenshot ${index + 1}`} loading="eager" decoding="async" onError={() => setMode((current) => current === "proxy" ? "source" : "failed")} />}</div><figcaption>{image.label || `Screenshot ${index + 1}`}</figcaption></figure>;
}

function GuideImageGallery({ images }: { images?: GuideImage[] }) {
  if (!images?.length) return null;
  return <section className="guide-images"><div className="guide-images-heading"><div><strong>Screenshot pendukung</strong><span>Gambar ditampilkan langsung dari pedoman.</span></div><em>{images.length} gambar</em></div><div className="guide-image-stack">{images.map((image, index) => <GuideImageCard key={`${image.url}-${index}`} image={image} index={index} />)}</div></section>;
}

export function ConditionSummary({ value }: { value: string }) {
  const points = splitGuidePoints(value);
  const visiblePoints = points.slice(0, 2);
  if (!visiblePoints.length) return null;
  const numbered = points.length > 1 && hasExplicitListMarkers(value);
  return <div className="condition-summary">{visiblePoints.map((point, index) => <p key={`${point}-${index}`}>{numbered && <span>{String(index + 1).padStart(2, "0")}</span>}{point}</p>)}{points.length > visiblePoints.length && <small>+{points.length - visiblePoints.length} poin lainnya</small>}</div>;
}

function ScriptLine({ value }: { value: string }) {
  return <p className={isUserReplyMarker(value) ? "script-user-reply" : undefined}>{value}</p>;
}

function InternalScriptNotes({ notes }: { notes: string[] }) {
  if (!notes.length) return null;
  return <aside className="script-internal-notes"><div><strong>Langkah internal</strong><span>Tidak ikut disalin ke pelanggan</span></div>{notes.map((note, index) => <p key={`${note}-${index}`}>{note.replace(/^[([]\s*/, "").replace(/[)\]]\s*$/, "")}</p>)}</aside>;
}

function CopySegmentButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const text = formatScriptForCopy(value);
    if (!text) return;
    await navigator.clipboard?.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };
  return <button className="script-segment-copy" onClick={() => void copy()}>{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? "Tersalin" : "Salin bagian"}</button>;
}

function ScriptMessageContent({ value }: { value: string }) {
  const { intro, points, numbered } = splitStableScriptContent(value);
  const introLines = intro.split(/\n+/).map(normalizeScriptLine).filter(Boolean);
  return <>{introLines.length > 0 && <div className="script-intro">{introLines.map((line, index) => <ScriptLine key={`${line}-${index}`} value={line} />)}</div>}{numbered && points.length > 1 ? <div className="guide-points script-list">{points.map((point, index) => <div key={`${point}-${index}`}><span>{index + 1}.</span><ScriptLine value={point} /></div>)}</div> : points.map((point, index) => <ScriptLine key={`${point}-${index}`} value={point} />)}</>;
}

function ScriptPointList({ value }: { value: string }) {
  const separated = splitInternalScriptNotes(value);
  const segmented = separated.segments.length > 1;
  return <div className={`script-points ${segmented ? "script-segment-list" : ""}`}>{separated.segments.map((segment, index) => segment.type === "internal" ? <InternalScriptNotes key={`${segment.text}-${index}`} notes={[segment.text]} /> : <div className={segmented ? "script-message-block" : ""} key={`${segment.text}-${index}`}><ScriptMessageContent value={segment.text} />{segmented && <CopySegmentButton value={segment.text} />}</div>)}</div>;
}

function GuidePointList({ value, className = "" }: { value: string; className?: string }) {
  if (className.includes("script-points")) return <ScriptPointList value={value} />;
  const separated = splitInternalScriptNotes(value);
  const points = splitGuidePoints(separated.content);
  if (!points.length) return <InternalScriptNotes notes={separated.notes} />;
  const numbered = points.length > 1 && hasExplicitListMarkers(separated.content);
  if (!numbered) return <div className={className}><GuideText value={separated.content} /><InternalScriptNotes notes={separated.notes} /></div>;
  return <div className={`guide-points ${className}`}>{points.map((point, index) => <div className={numbered ? "" : "single"} key={`${point}-${index}`}>{numbered && <span>{String(index + 1).padStart(2, "0")}</span>}<p>{point}</p></div>)}<InternalScriptNotes notes={separated.notes} /></div>;
}

function CaseBriefSectionHead({ step, title, detail }: { step: string; title: string; detail: string }) {
  return <div className="case-brief-section-head"><span>{step}</span><div><strong>{title}</strong><small>{detail}</small></div></div>;
}

function CaseBriefOutcomePanel({ guide, activeOutcome, onSelectOutcome }: { guide: Guide; activeOutcome?: ScenarioOutcome; onSelectOutcome: (id: string) => void }) {
  const focusedSteps = activeOutcome ? Array.from(new Set(escalationStepsForDisplay(activeOutcome, guide))) : [];
  return <section className="case-brief-section case-brief-outcome"><CaseBriefSectionHead step="03" title="Hasil penanganan" detail={guide.outcomes.length > 1 ? "Pilih jalur sesuai kondisi pelanggan." : "Jalur penanganan dari pedoman."} />{guide.outcomes.length > 1 && <div className="case-brief-outcome-tabs">{guide.outcomes.map((outcome, index) => <button type="button" key={`${outcome.id}-${index}`} className={`${outcomeTone(outcome.type)} ${outcome.id === activeOutcome?.id ? "active" : ""}`} onClick={() => onSelectOutcome(outcome.id)}><strong>{outcomeLabel(outcome.type)}</strong><small>{outcome.decision}</small></button>)}</div>}{activeOutcome && <div className="case-brief-outcome-body"><div className={`case-brief-result ${outcomeTone(activeOutcome.type)}`}><strong>{outcomeLabel(activeOutcome.type)}</strong><p>{activeOutcome.decision}</p></div>{focusedSteps.length > 0 && <div className="case-brief-operation"><div><strong>Agent operation</strong><small>Ikuti langkah ini untuk jalur yang dipilih.</small></div><ol>{focusedSteps.map((stepText, index) => <li key={`${stepText}-${index}`}>{stepText}</li>)}</ol></div>}{activeOutcome.type !== "tier_1" && <div className="case-brief-crm"><strong>{activeOutcome.type === "reference" ? "Urutan penanganan" : "Proses CRM"}</strong><p>{activeOutcome.crmProcess}</p>{activeOutcome.type !== "reference" && activeOutcome.ticketStatus && <small>Status tiket: {activeOutcome.ticketStatus}</small>}</div>}</div>}</section>;
}

function CaseBriefProductGuideDetail({ guide: sourceGuide, onBack, onSubmitFeedback }: { guide: Guide; onBack: () => void; onSubmitFeedback?: (input: GuideFeedbackInput) => Promise<void> }) {
  const [copied, setCopied] = useState(false);
  const [outcomeId, setOutcomeId] = useState(defaultOutcomeId(sourceGuide));
  const guide = prepareGuideForDisplay(sourceGuide);
  const activeOutcome = guide.outcomes.find((outcome) => outcome.id === outcomeId) ?? guide.outcomes[0];

  async function copyScript() {
    await navigator.clipboard?.writeText(formatScriptForCopy(guide.script));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return <section className="case-brief guide-detail"><button className="back-link" onClick={onBack}><ArrowLeft size={15} /> Kembali ke pilihan kondisi</button><div className="guide-path"><span>{guide.product}</span><ChevronRight size={13} /><span>{guide.category}</span><ChevronRight size={13} /><span>{guide.subtype}</span></div><header className="case-brief-header"><div><span className="eyebrow muted">Kondisi pelanggan</span><h1>{guide.title}</h1></div><span className="published-mark"><CheckCircle2 size={15} /> Published</span></header>{guide.warning && <div className="guide-warning"><Zap size={17} /><div><strong>Perhatian</strong><p>{guide.warning}</p></div></div>}<section className="case-brief-section case-brief-context"><CaseBriefSectionHead step="01" title="Bukti & konteks" detail="Pahami kendala dan lihat bukti sebelum merespons." /><div className="case-brief-condition"><strong>Kondisi pelanggan</strong><GuideText value={guide.condition} className="condition-points" /></div>{guide.images?.length ? <GuideImageGallery images={guide.images} /> : <p className="case-brief-empty">Tidak ada screenshot pada sumber pedoman.</p>}</section><section className="case-brief-section case-brief-script"><div className="case-brief-script-head"><CaseBriefSectionHead step="02" title="Skrip siap kirim" detail="Salin hanya teks yang akan disampaikan kepada pelanggan." /><button type="button" onClick={copyScript}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "Tersalin" : "Salin skrip"}</button></div><div className="case-brief-script-content"><GuidePointList value={guide.script} className="script-points" /></div></section><CaseBriefOutcomePanel guide={guide} activeOutcome={activeOutcome} onSelectOutcome={setOutcomeId} />{onSubmitFeedback ? <GuideFeedbackRow guide={sourceGuide} onSubmit={onSubmitFeedback} /> : null}</section>;
}

function CaseBriefOperationalGuideDetail({ guide: sourceGuide, onBack, onSubmitFeedback }: { guide: Guide; onBack: () => void; onSubmitFeedback?: (input: GuideFeedbackInput) => Promise<void> }) {
  const [copied, setCopied] = useState(false);
  const [outcomeId, setOutcomeId] = useState(defaultOutcomeId(sourceGuide));
  const guide = prepareGuideForDisplay(sourceGuide);
  const isOtherAppContact = guide.sourceType === "other_contact";
  const detailSource = guide.script && !guide.script.toLowerCase().includes("belum diisi") ? guide.script : guide.condition;
  const detailText = withoutDuplicateTitle(guide.title, detailSource);
  const activeOutcome = guide.outcomes.find((outcome) => outcome.id === outcomeId) ?? guide.outcomes[0];

  async function copyInformation() {
    await navigator.clipboard?.writeText(formatScriptForCopy(detailText));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return <section className="case-brief operational-guide-detail guide-detail"><button className="back-link" onClick={onBack}><ArrowLeft size={15} /> Kembali ke Pedoman Operasional</button><div className="guide-path"><span>Pedoman Operasional</span><ChevronRight size={13} /><span>{guide.category}</span><ChevronRight size={13} /><span>{guide.subtype}</span></div><header className="case-brief-header"><div><span className="eyebrow muted">Kondisi pedoman</span><h1>{guide.title}</h1></div><span className="published-mark"><CheckCircle2 size={15} /> Published</span></header>{guide.warning && <div className="guide-warning"><Zap size={17} /><div><strong>Perhatian</strong><p>{guide.warning}</p></div></div>}<section className="case-brief-section case-brief-context"><CaseBriefSectionHead step="01" title={isOtherAppContact ? "Informasi & bukti" : "Bukti & konteks"} detail="Baca informasi sumber sebelum mengikuti flow." /><div className="case-brief-condition"><strong>{isOtherAppContact ? "Informasi kontak" : "Kondisi pedoman"}</strong><GuideText value={detailText} className="condition-points" /></div>{guide.images?.length ? <GuideImageGallery images={guide.images} /> : null}</section><section className="case-brief-section case-brief-script"><div className="case-brief-script-head"><CaseBriefSectionHead step="02" title={isOtherAppContact ? "Informasi siap disalin" : "Skrip siap kirim"} detail="Salin teks sesuai kebutuhan Agent." /><button type="button" onClick={copyInformation}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "Tersalin" : isOtherAppContact ? "Salin informasi" : "Salin isi"}</button></div>{!isOtherAppContact && <div className="case-brief-script-content"><GuidePointList value={detailText} className="script-points" /></div>}</section><CaseBriefOutcomePanel guide={guide} activeOutcome={activeOutcome} onSelectOutcome={setOutcomeId} />{onSubmitFeedback ? <GuideFeedbackRow guide={sourceGuide} onSubmit={onSubmitFeedback} /> : null}</section>;
}

export function GuideDetail({ guide, onBack, onSubmitFeedback }: { guide: Guide; onBack: () => void; onSubmitFeedback?: (input: GuideFeedbackInput) => Promise<void> }) {
  return guide.product === "Pedoman Operasional"
    ? <CaseBriefOperationalGuideDetail guide={guide} onBack={onBack} onSubmitFeedback={onSubmitFeedback} />
    : <CaseBriefProductGuideDetail guide={guide} onBack={onBack} onSubmitFeedback={onSubmitFeedback} />;
}

export function EmptyState({ title, detail, children }: { title: string; detail: string; children?: ReactNode }) {
  return <div className="empty-state-v4"><strong>{title}</strong><p>{detail}</p>{children}</div>;
}

export function LoadingState({ detail }: { detail: string }) {
  return <div className="empty-state-v4 loading-state"><Zap size={25} className="spin" /><strong>Memuat pedoman...</strong><p>{detail}</p></div>;
}
