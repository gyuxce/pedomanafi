import type { Guide } from "@/lib/mock-data";

export function splitGuidePoints(value: string) {
  return value
    .replace(/\r/g, "")
    .split(/\n+|(?=\d+[.)]\s)|(?=[*•](?:\s|[A-Za-z]))|(?=-\s)/g)
    .map((part) => part.replace(/^\s*(?:\d+[.)]\s*|[A-Za-z][.)]\s*|[*•-]\s*)/, "").trim())
    .filter(Boolean);
}

export function hasExplicitListMarkers(value: string) {
  return /(?:^|\n)\s*(?:\d+[.)]|[A-Za-z][.)]|[-*•])\s+/.test(value);
}

function splitScriptContent(value: string) {
  const lines = value.replace(/\r/g, "").split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return { intro: "", points: [] as string[], numbered: false };
  const markerPattern = /^\s*(?:\d+[.)]|[A-Za-z][.)]|[-*•])\s+/;
  const markerIndex = lines.findIndex((line, index) => index > 0 && markerPattern.test(line));
  if (markerIndex > 0) return { intro: lines.slice(0, markerIndex).join("\n"), points: splitGuidePoints(lines.slice(markerIndex).join("\n")), numbered: true };
  const colonIndex = lines.findIndex((line, index) => index < lines.length - 1 && /:\s*$/.test(line));
  if (colonIndex >= 0) return { intro: lines.slice(0, colonIndex + 1).join("\n"), points: lines.slice(colonIndex + 1), numbered: true };
  return { intro: "", points: splitGuidePoints(value), numbered: hasExplicitListMarkers(value) };
}

export type ScriptSegment = { type: "customer" | "internal"; text: string };
export type InternalScriptSplit = { content: string; notes: string[]; segments: ScriptSegment[] };

function isStandaloneInternalScriptNote(value: string) {
  const line = value.trim();
  return line.length > 2 && ((line.startsWith("(") && line.endsWith(")")) || (line.startsWith("[") && line.endsWith("]")));
}

function isLikelyInternalScriptNote(value: string) {
  const text = value.replace(/^[([]\s*/, "").replace(/[)\]]\s*$/, "").trim();
  return /(?:pelanggan|user|customer)\s+menjawab|agent\s+(?:membuat|melakukan|menunggu)|jika\s+email|email\s+terdaftar/i.test(text);
}

export function splitInternalScriptNotes(value: string): InternalScriptSplit {
  const lines = value.replace(/\r\n?/g, "\n").split(/\n+/).map(normalizeScriptLine).filter(Boolean);
  const segments: ScriptSegment[] = [];
  const customerLines: string[] = [];
  let noteBuffer = "";
  const flushCustomer = () => {
    if (customerLines.length) {
      segments.push({ type: "customer", text: customerLines.join("\n") });
      customerLines.length = 0;
    }
  };
  const pushInternal = (text: string) => {
    flushCustomer();
    segments.push({ type: "internal", text });
  };
  const splitInlineNotes = (line: string) => {
    const markerPattern = /\([^()\n]+\)|\[[^\[\]\n]+\]/g;
    let cursor = 0;
    let match: RegExpExecArray | null;
    let found = false;
    while ((match = markerPattern.exec(line))) {
      if (!isLikelyInternalScriptNote(match[0])) continue;
      const before = line.slice(cursor, match.index).trim();
      if (before) customerLines.push(before);
      pushInternal(match[0]);
      cursor = match.index + match[0].length;
      found = true;
    }
    if (found) {
      const after = line.slice(cursor).trim();
      if (after) customerLines.push(after);
    } else {
      customerLines.push(line);
    }
  };
  for (const line of lines) {
    if (noteBuffer) {
      noteBuffer = `${noteBuffer} ${line}`.trim();
      if (/[)\]]\s*$/.test(noteBuffer)) {
        pushInternal(noteBuffer);
        noteBuffer = "";
      }
      continue;
    }
    if (isStandaloneInternalScriptNote(line)) {
      pushInternal(line);
    } else if (/^[([]/.test(line) && !/^[([]\s*\d+[.)]\s/.test(line) && !/[)\]]\s*$/.test(line)) {
      noteBuffer = line;
    } else {
      splitInlineNotes(line);
    }
  }
  if (noteBuffer) pushInternal(noteBuffer);
  flushCustomer();
  return {
    content: segments.filter((segment) => segment.type === "customer").map((segment) => segment.text).join("\n"),
    notes: segments.filter((segment) => segment.type === "internal").map((segment) => segment.text),
    segments,
  };
}

const stableScriptMarkerPattern = /^\s*(?:(?:\d+|[A-Za-z])[.)]\s+|[-*\u2022]\s+|\u00e2\u20ac\u00a2\s+|[\u2460-\u2473]\s*)/;
const stableInlineScriptMarkerPattern = /(?=(?:(?<![A-Za-z0-9_@])(?:\d+|[A-Za-z])[.)]\s+|(?<![A-Za-z0-9_@])[-*\u2022]\s+|(?<![A-Za-z0-9_@])\u00e2\u20ac\u00a2\s+|(?<![A-Za-z0-9_@])[\u2460-\u2473]))/;

function preserveScriptWordCase(match: string, replacement: string) {
  if (match === match.toUpperCase()) return replacement.toUpperCase();
  if (match[0] === match[0].toUpperCase()) return replacement[0].toUpperCase() + replacement.slice(1);
  return replacement;
}

export function normalizeScriptLine(value: string) {
  const compact = value
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,;:!?])(?=[A-Za-zÀ-ÿ])/g, "$1 ")
    .replace(/([A-Za-z0-9._%+-])\s*@\s*([A-Za-z0-9])/g, "$1@$2")
    .replace(/(@[A-Za-z0-9-]+)\s*\.\s*([A-Za-z0-9-]+)/g, "$1.$2")
    .trim();

  return compact
    .replace(/\bpelangggan\b/gi, (match) => preserveScriptWordCase(match, "pelanggan"))
    .replace(/\bketidaknyamananya\b/gi, (match) => preserveScriptWordCase(match, "ketidaknyamanannya"))
    .replace(/\bmenggunakakan\b/gi, (match) => preserveScriptWordCase(match, "menggunakan"))
    .replace(/\binformsi\b/gi, (match) => preserveScriptWordCase(match, "informasi"))
    .replace(/\binfomasikan\b/gi, (match) => preserveScriptWordCase(match, "informasikan"))
    .replace(/\bmenetukan\b/gi, (match) => preserveScriptWordCase(match, "menentukan"))
    .replace(/\bterimakasi(h)?\b/gi, (match) => preserveScriptWordCase(match, "terima kasih"))
    .replace(/\bkaka\b/gi, (match) => preserveScriptWordCase(match, "kakak"))
    .replace(/\bpilian\b/gi, (match) => preserveScriptWordCase(match, "pilihan"))
    .replace(/\bdimiiliki\b/gi, (match) => preserveScriptWordCase(match, "dimiliki"))
    .replace(/\bya\s*,?\s*kak?\b/gi, (match) => preserveScriptWordCase(match, "ya, kak"));
}

export function isUserReplyMarker(value: string) {
  return /^\s*[([]?\s*\.{0,3}\s*(?:pelanggan|user|customer)\s+menjawab\s*\.{0,3}\s*[)\]]?\s*$/i.test(value);
}

function stripStableScriptMarker(value: string) {
  return value.replace(/^\s*(?:(?:\d+|[A-Za-z])[.)]\s+|[-*\u2022]\s+|\u00e2\u20ac\u00a2\s+|[\u2460-\u2473]\s*)/, "").trim();
}

export function splitStableScriptContent(value: string) {
  const lines = value
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .split(/\n+/)
    .map(normalizeScriptLine)
    .filter(Boolean)
    .filter((line) => line !== "0");
  if (!lines.length) return splitScriptContent(value);

  const chunks = lines.flatMap((line) => line.split(stableInlineScriptMarkerPattern)).map(normalizeScriptLine).filter(Boolean).filter((line) => line !== "0");
  const markerIndex = chunks.findIndex((chunk) => stableScriptMarkerPattern.test(chunk));
  if (markerIndex < 0) return { intro: "", points: lines, numbered: false };

  const points: string[] = [];
  for (const chunk of chunks.slice(markerIndex)) {
    if (stableScriptMarkerPattern.test(chunk)) {
      points.push(stripStableScriptMarker(chunk));
    } else if (points.length) {
      points[points.length - 1] = normalizeScriptLine(`${points[points.length - 1]} ${chunk}`);
    }
  }
  return { intro: chunks.slice(0, markerIndex).join("\n"), points: points.filter(Boolean), numbered: points.length > 1 };
}

export function formatScriptForCopy(value: string) {
  const separated = splitInternalScriptNotes(value);
  const content = splitStableScriptContent(separated.content);
  const points = content.points.map(normalizeScriptLine).filter(Boolean);
  if (!points.length) return normalizeScriptLine(separated.content);
  const body = content.numbered && points.length > 1
    ? points.map((point, index) => `${index + 1}. ${point}`).join("\n")
    : points.join("\n");
  return [content.intro, body].filter(Boolean).join("\n").trim();
}

export function withoutDuplicateTitle(title: string, value: string) {
  const normalize = (text: string) => text.replace(/\s+/g, " ").trim().toLocaleLowerCase("id-ID");
  const lines = value.replace(/\r\n?/g, "\n").split(/\n+/).map(normalizeScriptLine).filter(Boolean);
  if (!lines.length) return "";
  const first = lines[0];
  const normalizedFirst = normalize(first);
  const normalizedTitle = normalize(title);
  if (normalizedFirst === normalizedTitle) return lines.slice(1).join("\n");
  if (normalizedTitle && normalizedFirst.startsWith(normalizedTitle)) {
    const remainder = first.slice(title.length).trim().replace(/^[\-–—:;|]+/, "").trim();
    return [remainder, ...lines.slice(1)].filter(Boolean).join("\n");
  }
  return lines.join("\n");
}

export function repairImportedTitle(title: string, condition: string) {
  const first = condition.replace(/\r\n?/g, "\n").split(/\n+/).map(normalizeScriptLine).find(Boolean) ?? "";
  if (!first || !title) return title;
  const normalize = (text: string) => text.replace(/\s+/g, " ").trim().toLocaleLowerCase("id-ID");
  if (normalize(first) === normalize(title) || !normalize(first).startsWith(normalize(title))) return title;
  const remainder = first.slice(title.length).trimStart();
  return /^[A-Za-zÀ-ÿ]/.test(remainder) ? first : title;
}

export function prepareGuideForDisplay(sourceGuide: Guide) {
  const isOtherAppContact = sourceGuide.sourceType === "other_contact";
  const title = repairImportedTitle(sourceGuide.title, sourceGuide.condition);
  return {
    ...sourceGuide,
    title,
    condition: withoutDuplicateTitle(title, sourceGuide.condition),
    script: isOtherAppContact && sourceGuide.warning && sourceGuide.script.toLowerCase().includes("belum diisi") ? sourceGuide.warning : sourceGuide.script,
    warning: isOtherAppContact ? undefined : sourceGuide.warning,
  };
}
