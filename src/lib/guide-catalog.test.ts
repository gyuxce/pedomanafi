import assert from "node:assert/strict";
import test from "node:test";
import { buildProductCatalog, categoryGuideCount } from "./guide-catalog";
import type { Guide } from "./mock-data";

function guide(partial: Partial<Guide>): Guide {
  return {
    id: partial.id ?? "g1",
    productId: partial.productId,
    product: partial.product ?? "Akulaku Paylater Internal",
    category: partial.category ?? "Limit",
    subtype: partial.subtype ?? "Sub",
    title: partial.title ?? "Judul",
    condition: partial.condition ?? "Kondisi",
    investigation: [],
    script: "Skrip",
    outcomes: [],
    updated: "now",
    status: "Published",
  };
}

test("catalog includes imported categories that are missing from the hardcoded taxonomy", () => {
  const guides = [
    guide({ productId: "akulaku-internal", category: "Kategori Baru Excel", title: "Kondisi A" }),
    guide({ productId: "akulaku-internal", category: "Limit", title: "Kondisi B" }),
    guide({ id: "op", product: "Pedoman Operasional", category: "OJK Special Case", title: "OJK" }),
  ];
  const catalog = buildProductCatalog(guides);
  const internal = catalog.find((product) => product.id === "akulaku-internal");
  assert.ok(internal);
  assert.ok(internal.categories.some((category) => category.name === "Kategori Baru Excel"));
  assert.equal(categoryGuideCount(guides, internal, "Kategori Baru Excel"), 1);
  assert.equal(catalog.some((product) => product.id === "openpay-online"), false);
});
