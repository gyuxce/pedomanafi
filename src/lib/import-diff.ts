import type { Guide } from "@/lib/mock-data";

export type GuideChangeField =
  | "judul"
  | "kondisi"
  | "skrip"
  | "screenshot"
  | "hasil penanganan"
  | "langkah agent / CRM"
  | "peringatan"
  | "status";

export type ChangedGuide = {
  previous: Guide;
  next: Guide;
  fields: GuideChangeField[];
};

export type ImportDiff = {
  added: Guide[];
  changed: ChangedGuide[];
  removed: Guide[];
  unchanged: Guide[];
};

function compact(value: string | undefined) {
  return (value || "").normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase("id-ID");
}

export function guideIdentity(guide: Guide) {
  const variant = (guide.sourceVariant || "").split("|")[0] || "scenario";
  if (guide.sourceSheet && guide.sourceRow) {
    return `source:${compact(guide.sourceSheet)}:${guide.sourceRow}:${compact(variant)}`;
  }
  return `content:${compact([guide.product, guide.category, guide.subtype, guide.title].join("|"))}`;
}

function outcomeFingerprint(guide: Guide) {
  return guide.outcomes
    .map((outcome) => [outcome.type, compact(outcome.decision), compact(outcome.agentSteps.join("\n")), compact(outcome.ticketStatus), compact(outcome.crmProcess), compact(outcome.escalationTeam)].join("|"))
    .sort()
    .join("||");
}

function imageFingerprint(guide: Guide) {
  return (guide.images ?? []).map((image) => image.url).sort().join("|");
}

export function changedFields(previous: Guide, next: Guide): GuideChangeField[] {
  const fields: GuideChangeField[] = [];
  if (compact(previous.title) !== compact(next.title)) fields.push("judul");
  if (compact(previous.condition) !== compact(next.condition)) fields.push("kondisi");
  if (compact(previous.script) !== compact(next.script)) fields.push("skrip");
  if (imageFingerprint(previous) !== imageFingerprint(next)) fields.push("screenshot");
  const previousTypes = previous.outcomes.map((outcome) => outcome.type).sort().join(",");
  const nextTypes = next.outcomes.map((outcome) => outcome.type).sort().join(",");
  if (previousTypes !== nextTypes) fields.push("hasil penanganan");
  if (outcomeFingerprint(previous) !== outcomeFingerprint(next) && previousTypes === nextTypes) fields.push("langkah agent / CRM");
  if (compact(previous.warning) !== compact(next.warning)) fields.push("peringatan");
  if (previous.status !== next.status) fields.push("status");
  return fields;
}

export function diffGuides(previous: Guide[], next: Guide[]): ImportDiff {
  const previousById = new Map(previous.map((guide) => [guideIdentity(guide), guide]));
  const nextIds = new Set<string>();
  const added: Guide[] = [];
  const changed: ChangedGuide[] = [];
  const unchanged: Guide[] = [];

  for (const guide of next) {
    const id = guideIdentity(guide);
    nextIds.add(id);
    const before = previousById.get(id);
    if (!before) {
      added.push(guide);
      continue;
    }
    const fields = changedFields(before, guide);
    if (fields.length) changed.push({ previous: before, next: guide, fields });
    else unchanged.push(guide);
  }

  const removed = previous.filter((guide) => !nextIds.has(guideIdentity(guide)));
  return { added, changed, removed, unchanged };
}

export function importHasChanges(diff: ImportDiff) {
  return diff.added.length > 0 || diff.changed.length > 0 || diff.removed.length > 0;
}

export function summarizeImportDiff(diff: ImportDiff) {
  return {
    added: diff.added.length,
    changed: diff.changed.length,
    removed: diff.removed.length,
    unchanged: diff.unchanged.length,
  };
}
