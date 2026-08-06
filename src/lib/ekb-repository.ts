import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Guide, OutcomeType, ScenarioOutcome } from "@/lib/mock-data";
import type { ImportResult } from "@/lib/excel-importer";

type ScenarioRow = {
  id: string;
  product_id: string | null;
  product: string;
  category: string;
  ticket_subtype: string;
  title: string;
  condition: string;
  investigation: unknown;
  script_livechat: string;
  script_callcenter: string | null;
  warning: string | null;
  status: Guide["status"];
  important: boolean;
  source_sheet: string | null;
  source_row: number | null;
  source_variant: string | null;
  source_type: string | null;
  duplicate_count: number;
  needs_review: boolean;
  review_reason: string | null;
  ekb_outcomes?: OutcomeRow[];
};

type OutcomeRow = {
  id: string;
  type: OutcomeType;
  decision: string;
  agent_steps: unknown;
  ticket_status: string;
  crm_process: string;
  escalation_team: string | null;
};

function stringList(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function toGuide(row: ScenarioRow): Guide {
  return {
    id: row.id,
    productId: row.product_id ?? undefined,
    product: row.product,
    category: row.category,
    subtype: row.ticket_subtype,
    title: row.title,
    condition: row.condition,
    investigation: stringList(row.investigation),
    script: row.script_livechat,
    outcomes: (row.ekb_outcomes ?? []).map((outcome): ScenarioOutcome => ({
      id: outcome.id,
      type: outcome.type,
      decision: outcome.decision,
      agentSteps: stringList(outcome.agent_steps),
      ticketStatus: outcome.ticket_status,
      crmProcess: outcome.crm_process,
      escalationTeam: outcome.escalation_team ?? undefined,
    })),
    warning: row.warning ?? undefined,
    updated: "Dari database",
    status: row.status,
    important: row.important,
    sourceSheet: row.source_sheet ?? undefined,
    sourceRow: row.source_row ?? undefined,
    sourceVariant: row.source_variant ?? undefined,
    sourceType: row.source_type ?? undefined,
    sourceCallScript: row.script_callcenter ?? undefined,
    needsReview: row.needs_review,
    reviewReason: row.review_reason ?? undefined,
  };
}

export async function loadPublishedGuides(client: SupabaseClient) {
  const { data, error } = await client
    .from("ekb_scenarios")
    .select("*, ekb_outcomes(*)")
    .eq("status", "Published")
    .order("product", { ascending: true })
    .order("category", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as ScenarioRow[]).map(toGuide);
}

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function batches<T>(items: T[], size = 100) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

export async function saveImportToDatabase(client: SupabaseClient, result: ImportResult, user: User) {
  const { data: importRow, error: importError } = await client
    .from("ekb_imports")
    .insert({
      file_name: result.summary.fileName,
      source_rows: result.summary.sourceRows,
      scenario_count: result.summary.scenarios,
      outcome_count: result.summary.outcomes,
      review_count: result.summary.reviewCount,
      duplicate_count: result.summary.duplicateRows,
      status: "staged",
      created_by: user.id,
    })
    .select("id")
    .single();
  if (importError || !importRow) throw importError ?? new Error("Import record tidak dapat dibuat.");

  const scenarioRows = result.guides.map((guide) => ({
    id: makeId(),
    import_id: importRow.id,
    product_id: guide.productId ?? null,
    product: guide.product,
    category: guide.category,
    ticket_subtype: guide.subtype,
    title: guide.title,
    condition: guide.condition,
    investigation: guide.investigation,
    script_livechat: guide.script,
    script_callcenter: guide.sourceCallScript ?? null,
    warning: guide.warning ?? null,
    status: guide.status,
    important: Boolean(guide.important),
    source_sheet: guide.sourceSheet ?? null,
    source_row: guide.sourceRow ?? null,
    source_variant: guide.sourceVariant ?? null,
    source_type: guide.sourceType ?? null,
    duplicate_count: guide.duplicateCount ?? 1,
    needs_review: Boolean(guide.needsReview),
    review_reason: guide.reviewReason ?? null,
    created_by: user.id,
  }));

  for (const scenarioBatch of batches(scenarioRows)) {
    const { error } = await client.from("ekb_scenarios").insert(scenarioBatch);
    if (error) throw error;
  }

  const outcomeRows = scenarioRows.flatMap((scenario, index) => result.guides[index].outcomes.map((outcome) => ({
    id: makeId(),
    scenario_id: scenario.id,
    type: outcome.type,
    decision: outcome.decision,
    agent_steps: outcome.agentSteps,
    ticket_status: outcome.ticketStatus,
    crm_process: outcome.crmProcess,
    escalation_team: outcome.escalationTeam ?? null,
  })));
  for (const outcomeBatch of batches(outcomeRows)) {
    const { error } = await client.from("ekb_outcomes").insert(outcomeBatch);
    if (error) throw error;
  }

  await client.from("ekb_audit_log").insert({ actor_id: user.id, action: "import_staged", entity_type: "ekb_import", entity_id: importRow.id, metadata: { file_name: result.summary.fileName, scenarios: result.summary.scenarios } });
  return importRow.id as string;
}

export function roleFromUser(user: User | null) {
  const role = user?.user_metadata?.role;
  return role === "admin" || role === "quality" ? "admin" : "agent";
}
