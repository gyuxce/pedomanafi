"use client";

import { FormEvent, useState } from "react";
import { CheckCircle2, LifeBuoy } from "lucide-react";
import type { Guide } from "@/lib/mock-data";
import type { GuideFeedbackInput } from "@/lib/ops-types";

export function GuideFeedbackRow({ guide, onSubmit }: { guide: Guide; onSubmit: (input: GuideFeedbackInput) => Promise<void> }) {
  const [mode, setMode] = useState<"idle" | "report" | "saved" | "error">("idle");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(helpful: boolean, note?: string) {
    setBusy(true);
    setMessage("");
    try {
      await onSubmit({
        guideId: guide.id,
        guideTitle: guide.title,
        product: guide.product,
        category: guide.category,
        subtype: guide.subtype,
        sourceSheet: guide.sourceSheet,
        sourceRow: guide.sourceRow,
        helpful,
        comment: note,
      });
      setMode("saved");
      setMessage(helpful ? "Terima kasih. Masukan tersimpan untuk Quality." : "Laporan tersimpan. Quality bisa melihat pedoman ini.");
    } catch (error) {
      setMode("error");
      setMessage(error instanceof Error ? error.message : "Masukan belum berhasil disimpan.");
    } finally {
      setBusy(false);
    }
  }

  function handleReport(event: FormEvent) {
    event.preventDefault();
    void submit(false, comment);
  }

  if (mode === "saved") {
    return <div className="feedback-row saved"><CheckCircle2 size={15} /><span>{message}</span></div>;
  }

  return <div className="feedback-row">
    <span>Apakah pedoman ini membantu?</span>
    <button type="button" disabled={busy} onClick={() => void submit(true)}><CheckCircle2 size={15} /> Membantu</button>
    <button type="button" disabled={busy} onClick={() => setMode("report")}><LifeBuoy size={15} /> Laporkan masalah</button>
    {mode === "report" && <form className="feedback-report" onSubmit={handleReport}>
      <textarea rows={3} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Contoh: langkah eskalasi tidak sesuai, skrip usang, screenshot salah..." required />
      <div className="feedback-report-actions">
        <button type="button" className="secondary-button" onClick={() => setMode("idle")} disabled={busy}>Batal</button>
        <button type="submit" className="primary-button" disabled={busy}>{busy ? "Menyimpan..." : "Kirim laporan"}</button>
      </div>
    </form>}
    {mode === "error" && <small className="feedback-error">{message}</small>}
  </div>;
}
