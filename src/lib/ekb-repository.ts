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
  updated_at?: string | null;
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
  const investigation = stringList(row.investigation);
  const normalizedCondition = row.condition.replace(/\s+/g, " ").trim().toLocaleLowerCase("id-ID");
  const normalizedInvestigation = investigation.join(" ").replace(/\s+/g, " ").trim().toLocaleLowerCase("id-ID");
  return {
    id: row.id,
    productId: row.product_id ?? undefined,
    product: row.product,
    category: row.category,
    subtype: row.ticket_subtype,
    title: row.title,
    condition: row.condition,
    investigation: normalizedCondition && normalizedCondition === normalizedInvestigation ? [] : investigation,
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

function guidePayload(guide: Guide, status: Guide["status"]) {
  return {
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
    status,
    important: Boolean(guide.important),
    needs_review: status !== "Published" && Boolean(guide.needsReview),
    review_reason: status !== "Published" ? guide.reviewReason ?? null : null,
  };
}

async function loadScenarioRows(client: SupabaseClient, publishedOnly: boolean, importId?: string) {
  const rows: ScenarioRow[] = [];
  const batchSize = 1000;
  for (let offset = 0; ; offset += batchSize) {
    let query = client
      .from("ekb_scenarios")
      .select("*, ekb_outcomes(*)")
      .order(publishedOnly ? "product" : "updated_at", { ascending: !publishedOnly })
      .range(offset, offset + batchSize - 1);
    if (publishedOnly) query = query.eq("status", "Published");
    if (importId) query = query.eq("import_id", importId);
    const { data, error } = await query;
    if (error) throw error;
    const batch = (data ?? []) as ScenarioRow[];
    rows.push(...batch);
    if (batch.length < batchSize) break;
  }
  return rows;
}

export async function loadPublishedGuides(client: SupabaseClient) {
  const { data: latestImport, error } = await client
    .from("ekb_imports")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!latestImport) return [];
  return (await loadScenarioRows(client, true, latestImport.id as string)).map(toGuide);
}

export async function loadAdminGuides(client: SupabaseClient) {
  const { data: latestImport, error } = await client
    .from("ekb_imports")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!latestImport) return [];
  return (await loadScenarioRows(client, false, latestImport.id as string)).map(toGuide);
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

  try {
    for (const scenarioBatch of batches(scenarioRows)) {
      const { error } = await client.from("ekb_scenarios").insert(scenarioBatch);
      if (error) throw error;
    }

    const outcomeRows = scenarioRows.flatMap((scenario, index) => {
      const seenTypes = new Set<OutcomeType>();
      return result.guides[index].outcomes.flatMap((outcome) => {
        if (seenTypes.has(outcome.type)) return [];
        seenTypes.add(outcome.type);
        return [{
          id: makeId(),
          scenario_id: scenario.id,
          type: outcome.type,
          decision: outcome.decision,
          agent_steps: outcome.agentSteps,
          ticket_status: outcome.ticketStatus,
          crm_process: outcome.crmProcess,
          escalation_team: outcome.escalationTeam ?? null,
        }];
      });
    });
    for (const outcomeBatch of batches(outcomeRows)) {
      const { error } = await client.from("ekb_outcomes").insert(outcomeBatch);
      if (error) throw error;
    }

    const { error: auditError } = await client.from("ekb_audit_log").insert({ actor_id: user.id, action: "import_published", entity_type: "ekb_import", entity_id: importRow.id, metadata: { file_name: result.summary.fileName, scenarios: result.summary.scenarios } });
    if (auditError) throw auditError;
    const { error: publishImportError } = await client
      .from("ekb_imports")
      .update({ status: "published" })
      .eq("id", importRow.id);
    if (publishImportError) throw publishImportError;
    return importRow.id as string;
  } catch (error) {
    // Avoid leaving half an import behind when a batch fails.
    await client.from("ekb_scenarios").delete().eq("import_id", importRow.id);
    await client.from("ekb_imports").delete().eq("id", importRow.id);
    throw error;
  }
}

export async function updateScenarioInDatabase(client: SupabaseClient, guide: Guide, user: User, publish = false) {
  const status: Guide["status"] = publish ? "Published" : "Draft";
  if (new Set(guide.outcomes.map((outcome) => outcome.type)).size !== guide.outcomes.length) {
    throw new Error("Satu jenis hasil penanganan hanya boleh dipakai satu kali.");
  }
  const { error: scenarioError } = await client
    .from("ekb_scenarios")
    .update(guidePayload(guide, status))
    .eq("id", guide.id);
  if (scenarioError) throw scenarioError;

  const { error: deleteOutcomeError } = await client.from("ekb_outcomes").delete().eq("scenario_id", guide.id);
  if (deleteOutcomeError) throw deleteOutcomeError;
  if (guide.outcomes.length > 0) {
    const { error: outcomeError } = await client.from("ekb_outcomes").insert(guide.outcomes.map((outcome) => ({
      scenario_id: guide.id,
      type: outcome.type,
      decision: outcome.decision,
      agent_steps: outcome.agentSteps,
      ticket_status: outcome.ticketStatus,
      crm_process: outcome.crmProcess,
      escalation_team: outcome.escalationTeam ?? null,
    })));
    if (outcomeError) throw outcomeError;
  }

  const { error: auditError } = await client.from("ekb_audit_log").insert({
    actor_id: user.id,
    action: publish ? "scenario_published" : "scenario_updated",
    entity_type: "ekb_scenario",
    entity_id: guide.id,
    metadata: { title: guide.title, status },
  });
  if (auditError) throw auditError;
}

export function roleFromUser(user: User | null) {
  const role = user?.app_metadata?.role;
  return role === "admin" || role === "quality" ? "admin" : "agent";
}
