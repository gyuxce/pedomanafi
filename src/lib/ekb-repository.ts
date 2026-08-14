import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Guide, GuideImage, OutcomeType, ScenarioOutcome } from "@/lib/mock-data";
import type { ImportResult } from "@/lib/excel-importer";
import { diffGuides, importHasChanges, type ImportDiff } from "@/lib/import-diff";
import type { Announcement, AnnouncementTone, GuideFeedbackInput, GuideFeedbackRecord } from "@/lib/ops-types";
import { readJson, writeJson } from "@/lib/local-fallback";

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
  images: unknown;
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

function imageList(value: unknown): GuideImage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || !("url" in item)) return [];
    const url = String((item as { url?: unknown }).url ?? "").trim();
    if (!url) return [];
    const label = String((item as { label?: unknown }).label ?? "").trim();
    return [{ url, label: label || undefined }];
  });
}

function normalizeStoredOutcome(outcome: ScenarioOutcome, sourceType: string | null): ScenarioOutcome {
  if (sourceType === "special_transfer" || outcome.type !== "transfer_asi") return outcome;
  const hasExplicitAsi = /\basi\b/i.test(outcome.agentSteps.join(" ")) || /\basi\b/i.test(outcome.escalationTeam ?? "");
  if (hasExplicitAsi) return outcome;
  return {
    ...outcome,
    type: "tier_2_3",
    decision: "Pilih jika kondisi memenuhi syarat eskalasi atau membutuhkan tindak lanjut tim lain.",
    crmProcess: "Buat tiket eskalasi dan lampirkan detail kondisi serta bukti yang tersedia.",
    escalationTeam: outcome.escalationTeam,
  };
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
    images: imageList(row.images),
    outcomes: (row.ekb_outcomes ?? []).map((outcome): ScenarioOutcome => normalizeStoredOutcome({
      id: outcome.id,
      type: outcome.type,
      decision: outcome.decision,
      agentSteps: stringList(outcome.agent_steps),
      ticketStatus: outcome.ticket_status,
      crmProcess: outcome.crm_process,
      escalationTeam: outcome.escalation_team ?? undefined,
    }, row.source_type)),
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
    images: guide.images ?? [],
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

const KEEP_IMPORTS = 3;
const ANNOUNCEMENT_STORAGE_KEY = "kora-announcements-v1";
const FEEDBACK_STORAGE_KEY = "kora-guide-feedback-v1";

export type SaveImportResult = {
  importId: string | null;
  skipped: boolean;
  pruned: number;
  diff: ImportDiff;
};

function isMissingRelation(error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  const message = error && typeof error === "object" && "message" in error ? String((error as { message?: unknown }).message ?? "") : String(error ?? "");
  return code === "42P01" || code === "PGRST205" || /does not exist|schema cache|could not find the table/i.test(message);
}

async function latestImportId(client: SupabaseClient) {
  const { data, error } = await client
    .from("ekb_imports")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data?.id as string | undefined) ?? null;
}

async function pruneOldImports(client: SupabaseClient, keep = KEEP_IMPORTS) {
  const { data, error } = await client
    .from("ekb_imports")
    .select("id")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const stale = (data ?? []).slice(keep);
  for (const row of stale) {
    const importId = row.id as string;
    const { error: scenarioError } = await client.from("ekb_scenarios").delete().eq("import_id", importId);
    if (scenarioError) throw scenarioError;
    const { error: importError } = await client.from("ekb_imports").delete().eq("id", importId);
    if (importError) throw importError;
  }
  return stale.length;
}

export async function saveImportToDatabase(client: SupabaseClient, result: ImportResult, user: User, previousGuides: Guide[] = []): Promise<SaveImportResult> {
  const diff = diffGuides(previousGuides, result.guides);
  if (previousGuides.length > 0 && !importHasChanges(diff)) {
    return { importId: await latestImportId(client), skipped: true, pruned: 0, diff };
  }

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
    images: guide.images ?? [],
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

    const { error: auditError } = await client.from("ekb_audit_log").insert({
      actor_id: user.id,
      action: "import_published",
      entity_type: "ekb_import",
      entity_id: importRow.id,
      metadata: {
        file_name: result.summary.fileName,
        scenarios: result.summary.scenarios,
        added: diff.added.length,
        changed: diff.changed.length,
        removed: diff.removed.length,
        unchanged: diff.unchanged.length,
      },
    });
    if (auditError) throw auditError;
    const { error: publishImportError } = await client
      .from("ekb_imports")
      .update({ status: "published" })
      .eq("id", importRow.id);
    if (publishImportError) throw publishImportError;
    const pruned = await pruneOldImports(client);
    return { importId: importRow.id as string, skipped: false, pruned, diff };
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

type AnnouncementRow = {
  id: string;
  title: string;
  detail: string;
  tone: AnnouncementTone;
  published: boolean;
  created_at: string;
  updated_at?: string | null;
};

function toAnnouncement(row: AnnouncementRow): Announcement {
  return {
    id: row.id,
    title: row.title,
    detail: row.detail,
    tone: row.tone,
    published: row.published,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined,
  };
}

function localAnnouncements(publishedOnly = false) {
  const items = readJson<Announcement[]>(ANNOUNCEMENT_STORAGE_KEY, []);
  return publishedOnly ? items.filter((item) => item.published) : items;
}

function saveLocalAnnouncements(items: Announcement[]) {
  writeJson(ANNOUNCEMENT_STORAGE_KEY, items);
}

export async function loadAnnouncements(client: SupabaseClient | null, publishedOnly = false): Promise<{ items: Announcement[]; localOnly: boolean }> {
  if (!client) return { items: localAnnouncements(publishedOnly), localOnly: true };
  let query = client.from("ekb_announcements").select("*").order("created_at", { ascending: false });
  if (publishedOnly) query = query.eq("published", true);
  const { data, error } = await query;
  if (error) {
    if (isMissingRelation(error)) return { items: localAnnouncements(publishedOnly), localOnly: true };
    throw error;
  }
  return { items: ((data ?? []) as AnnouncementRow[]).map(toAnnouncement), localOnly: false };
}

export async function saveAnnouncement(client: SupabaseClient | null, user: User | null, draft: { id?: string; title: string; detail: string; tone: AnnouncementTone; published: boolean }): Promise<{ item: Announcement; localOnly: boolean }> {
  const title = draft.title.trim();
  const detail = draft.detail.trim();
  if (!title || !detail) throw new Error("Judul dan isi update penting wajib diisi.");
  const now = new Date().toISOString();
  if (!client || !user) {
    const items = localAnnouncements();
    const item: Announcement = draft.id
      ? { ...(items.find((entry) => entry.id === draft.id) ?? { id: draft.id, createdAt: now }), title, detail, tone: draft.tone, published: draft.published, updatedAt: now }
      : { id: makeId(), title, detail, tone: draft.tone, published: draft.published, createdAt: now };
    saveLocalAnnouncements(draft.id ? items.map((entry) => entry.id === item.id ? item : entry) : [item, ...items]);
    return { item, localOnly: true };
  }
  const payload = { title, detail, tone: draft.tone, published: draft.published, updated_by: user.id };
  if (draft.id) {
    const { data, error } = await client.from("ekb_announcements").update(payload).eq("id", draft.id).select("*").single();
    if (error) {
      if (isMissingRelation(error)) return saveAnnouncement(null, null, draft);
      throw error;
    }
    return { item: toAnnouncement(data as AnnouncementRow), localOnly: false };
  }
  const { data, error } = await client.from("ekb_announcements").insert({ ...payload, created_by: user.id }).select("*").single();
  if (error) {
    if (isMissingRelation(error)) return saveAnnouncement(null, null, draft);
    throw error;
  }
  return { item: toAnnouncement(data as AnnouncementRow), localOnly: false };
}

export async function deleteAnnouncement(client: SupabaseClient | null, id: string) {
  if (!client) {
    saveLocalAnnouncements(localAnnouncements().filter((item) => item.id !== id));
    return { localOnly: true };
  }
  const { error } = await client.from("ekb_announcements").delete().eq("id", id);
  if (error) {
    if (isMissingRelation(error)) {
      saveLocalAnnouncements(localAnnouncements().filter((item) => item.id !== id));
      return { localOnly: true };
    }
    throw error;
  }
  return { localOnly: false };
}

type FeedbackRow = {
  id: string;
  guide_id: string;
  guide_title: string;
  product: string;
  category: string;
  subtype: string;
  source_sheet: string | null;
  source_row: number | null;
  helpful: boolean;
  comment: string | null;
  created_at: string;
  created_by: string | null;
};

function toFeedback(row: FeedbackRow): GuideFeedbackRecord {
  return {
    id: row.id,
    guideId: row.guide_id,
    guideTitle: row.guide_title,
    product: row.product,
    category: row.category,
    subtype: row.subtype,
    sourceSheet: row.source_sheet ?? undefined,
    sourceRow: row.source_row ?? undefined,
    helpful: row.helpful,
    comment: row.comment,
    createdAt: row.created_at,
    createdBy: row.created_by ?? undefined,
  };
}

function localFeedback() {
  return readJson<GuideFeedbackRecord[]>(FEEDBACK_STORAGE_KEY, []);
}

export async function loadGuideFeedback(client: SupabaseClient | null): Promise<{ items: GuideFeedbackRecord[]; localOnly: boolean }> {
  if (!client) return { items: localFeedback(), localOnly: true };
  const { data, error } = await client.from("ekb_guide_feedback").select("*").order("created_at", { ascending: false }).limit(500);
  if (error) {
    if (isMissingRelation(error)) return { items: localFeedback(), localOnly: true };
    throw error;
  }
  return { items: ((data ?? []) as FeedbackRow[]).map(toFeedback), localOnly: false };
}

export async function saveGuideFeedback(client: SupabaseClient | null, user: User | null, input: GuideFeedbackInput): Promise<{ item: GuideFeedbackRecord; localOnly: boolean }> {
  const comment = input.comment?.trim() || null;
  if (!input.helpful && !comment) throw new Error("Tuliskan singkat masalahnya agar Quality bisa menindaklanjuti.");
  const now = new Date().toISOString();
  const localItem: GuideFeedbackRecord = {
    id: makeId(),
    guideId: input.guideId,
    guideTitle: input.guideTitle,
    product: input.product,
    category: input.category,
    subtype: input.subtype,
    sourceSheet: input.sourceSheet,
    sourceRow: input.sourceRow,
    helpful: input.helpful,
    comment,
    createdAt: now,
    createdBy: user?.id,
  };
  if (!client || !user) {
    writeJson(FEEDBACK_STORAGE_KEY, [localItem, ...localFeedback()].slice(0, 500));
    return { item: localItem, localOnly: true };
  }
  const { data, error } = await client.from("ekb_guide_feedback").insert({
    guide_id: input.guideId,
    guide_title: input.guideTitle,
    product: input.product,
    category: input.category,
    subtype: input.subtype,
    source_sheet: input.sourceSheet ?? null,
    source_row: input.sourceRow ?? null,
    helpful: input.helpful,
    comment,
    created_by: user.id,
  }).select("*").single();
  if (error) {
    if (isMissingRelation(error)) {
      writeJson(FEEDBACK_STORAGE_KEY, [localItem, ...localFeedback()].slice(0, 500));
      return { item: localItem, localOnly: true };
    }
    throw error;
  }
  return { item: toFeedback(data as FeedbackRow), localOnly: false };
}
