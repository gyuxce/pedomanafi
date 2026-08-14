import type { Guide, OutcomeType, ScenarioOutcome } from "@/lib/mock-data";

export const SEARCH_RESULT_LIMIT = 2000;

export function outcomeLabel(type: OutcomeType) {
  if (type === "tier_1") return "Selesai di Tier 1";
  if (type === "tier_2_3") return "Eskalasi ke Tier 2/3";
  if (type === "transfer_asi") return "Transfer ke ASI";
  return "Pertanyaan awal";
}

export function outcomeTone(type: OutcomeType) {
  if (type === "tier_1") return "success";
  if (type === "tier_2_3") return "warning";
  if (type === "transfer_asi") return "teal";
  return "slate";
}

function specificEscalationSteps(outcome: ScenarioOutcome) {
  if (outcome.type === "tier_1") return [];
  const marker = /transfer\s*(investigasi|chat|call|asi)|unblokir|ktp|lainnya|^\s*(iya|tidak)\s*[.)\-:]?\s*$/i;
  return outcome.agentSteps.filter((step) => marker.test(step));
}

export function escalationFlag(guide?: Guide) {
  const variant = guide?.sourceVariant?.toLocaleLowerCase("id-ID") || "";
  if (variant.includes("escalasi-no")) return "no";
  if (variant.includes("escalasi-yes")) return "yes";
  return undefined;
}

export function defaultOutcomeId(guide: Guide) {
  const escalationOutcome = guide.outcomes.find((outcome) => outcome.type === "tier_2_3");
  return escalationOutcome?.id ?? guide.outcomes[0]?.id ?? "";
}

export function escalationStepsForDisplay(outcome: ScenarioOutcome, guide?: Guide) {
  if (outcome.type === "tier_1" || outcome.type === "reference") return [];
  const variants = guide?.sourceVariant?.toLocaleLowerCase("id-ID").split("|") || [];
  if (variants.includes("has-tier2") || escalationFlag(guide) === "yes" || outcome.type === "tier_2_3" || outcome.type === "transfer_asi") return outcome.agentSteps;
  const specific = specificEscalationSteps(outcome);
  return specific.length ? specific : outcome.agentSteps;
}

export function normalizeSearchText(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("id-ID").replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}
