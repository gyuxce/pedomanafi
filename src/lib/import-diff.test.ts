import assert from "node:assert/strict";
import test from "node:test";
import { changedFields, diffGuides, guideIdentity, importHasChanges } from "./import-diff";
import type { Guide, ScenarioOutcome } from "./mock-data";

function guide(partial: Partial<Guide> & Pick<Guide, "title">): Guide {
  const outcome: ScenarioOutcome = {
    id: "o1",
    type: "tier_1",
    decision: "Selesai di Tier 1",
    agentSteps: ["Cek console"],
    ticketStatus: "Kategori Percakapan",
    crmProcess: "Tutup percakapan",
  };
  return {
    id: partial.id ?? "g1",
    product: "Akulaku Paylater Internal",
    category: "Limit",
    subtype: "Tidak bisa transaksi",
    condition: partial.title,
    investigation: [],
    script: "Mohon kirim screenshot",
    outcomes: [outcome],
    updated: "test",
    status: "Published",
    sourceSheet: "Akulaku Paylater (Internal)",
    sourceRow: 4,
    sourceVariant: "scenario",
    ...partial,
  };
}

test("identity stays stable for the same source row", () => {
  const first = guide({ title: "A", sourceRow: 120, sourceVariant: "scenario|has-tier2|escalasi-yes" });
  const second = guide({ title: "B", sourceRow: 120, sourceVariant: "scenario|escalasi-no" });
  assert.equal(guideIdentity(first), guideIdentity(second));
});

test("diff reports added, changed, removed, and unchanged rows", () => {
  const previous = [
    guide({ id: "keep", title: "Sama", sourceRow: 10, script: "Skrip lama" }),
    guide({ id: "edit", title: "Akan berubah", sourceRow: 120, script: "Skrip lama" }),
    guide({ id: "gone", title: "Akan hilang", sourceRow: 200 }),
  ];
  const next = [
    guide({ id: "keep", title: "Sama", sourceRow: 10, script: "Skrip lama" }),
    guide({ id: "edit", title: "Akan berubah", sourceRow: 120, script: "Skrip baru" }),
    guide({ id: "new", title: "Baris baru", sourceRow: 300 }),
  ];
  const diff = diffGuides(previous, next);
  assert.equal(diff.unchanged.length, 1);
  assert.equal(diff.added.length, 1);
  assert.equal(diff.removed.length, 1);
  assert.equal(diff.changed.length, 1);
  assert.deepEqual(diff.changed[0].fields, ["skrip"]);
  assert.equal(importHasChanges(diff), true);
  assert.deepEqual(changedFields(previous[0], next[0]), []);
});

test("identical snapshots have no changes", () => {
  const snapshot = [guide({ title: "Tetap", sourceRow: 4 })];
  const diff = diffGuides(snapshot, snapshot);
  assert.equal(importHasChanges(diff), false);
  assert.equal(diff.unchanged.length, 1);
});
