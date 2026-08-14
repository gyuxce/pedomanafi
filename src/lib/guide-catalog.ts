import { operationalModules, products, type Guide, type Product, type ProductCategory } from "./mock-data";

export function taxonomyKey(value: string) {
  return value
    .replace(/pengembalian\s*\(refund\)/gi, "refund")
    .replace(/[()]/g, "")
    .replace(/\//g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("id-ID");
}

export function categoryTaxonomyKey(productId: string | undefined, value: string) {
  const key = taxonomyKey(value);
  if (key === "informasi pelapor yang tertera di slik") return "slik";
  if (key === "no category") return "informasi umum";
  if (key === "lain-lain") return "informasi lainnya";
  if (key.includes("fast billing service")) return "fast billing service";
  if (productId === "openpay-offline") {
    if (key === "asuransi akulaku protection gadget") return "akulaku protection gadget";
    if (key === "akulaku jaminan angsuran akujaga") return "akujaga";
    if (key === "asuransi perlindungan isi rumah akusiaga") return "akusiaga";
  }
  if (productId === "cicilan-motor" && key === "asuransi cicilan motor listrik") return "asuransi cicilan motor";
  if (productId === "paylater-toko" && [
    "asuransi akulaku protection gadget",
    "akulaku jaminan angsuran akujaga",
    "asuransi perlindungan isi rumah akusiaga",
  ].includes(key)) return "produk perlindungan";
  return key;
}

export function uniqueTaxonomyLabels(values: string[]) {
  const labels = new Map<string, string>();
  values.map((value) => value.replace(/\s+/g, " ").trim()).filter(Boolean).forEach((value) => {
    const key = taxonomyKey(value);
    if (!labels.has(key)) labels.set(key, value);
  });
  return [...labels.values()];
}

export function slugifyId(value: string) {
  return taxonomyKey(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "lainnya";
}

export function isOperationalGuide(guide: Guide) {
  return taxonomyKey(guide.product) === taxonomyKey("Pedoman Operasional");
}

export function guideMatchesProduct(guide: Guide, product: Product) {
  return guide.productId === product.id || taxonomyKey(guide.product) === taxonomyKey(product.name);
}

function shortNameFor(name: string) {
  const compact = name.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
  return compact.length <= 24 ? compact : compact.slice(0, 22).trim();
}

function categoryFromGuide(productId: string, guide: Guide, known?: Product): ProductCategory {
  const catKey = categoryTaxonomyKey(productId, guide.category);
  const matched = known?.categories.find((category) => categoryTaxonomyKey(productId, category.name) === catKey);
  return matched ?? {
    id: slugifyId(guide.category),
    name: guide.category,
    description: "Kategori dari workbook pedoman.",
  };
}

export function buildProductCatalog(guides: Guide[]): Product[] {
  const source = guides.filter((guide) => !isOperationalGuide(guide));
  if (!source.length) return products;

  const byId = new Map<string, Product>();
  for (const product of products) {
    byId.set(product.id, { ...product, categories: [] });
  }

  const seenOrder: string[] = [];
  for (const guide of source) {
    const productId = guide.productId || slugifyId(guide.product);
    const known = products.find((product) => product.id === productId);
    if (!byId.has(productId)) {
      byId.set(productId, {
        id: productId,
        name: guide.product,
        shortName: shortNameFor(guide.product),
        categories: [],
      });
    }
    if (!seenOrder.includes(productId)) seenOrder.push(productId);
    if (!guide.category.trim()) continue;
    const product = byId.get(productId)!;
    const catKey = categoryTaxonomyKey(productId, guide.category);
    if (product.categories.some((category) => categoryTaxonomyKey(productId, category.name) === catKey)) continue;
    product.categories.push(categoryFromGuide(productId, guide, known));
  }

  const knownIds = products.map((product) => product.id);
  const catalog: Product[] = [];
  for (const id of knownIds) {
    const product = byId.get(id);
    if (product?.categories.length) catalog.push(product);
  }
  for (const id of seenOrder) {
    if (knownIds.includes(id)) continue;
    const product = byId.get(id);
    if (product?.categories.length) catalog.push(product);
  }
  return catalog.length ? catalog : products;
}

export function buildOperationalModules(guides: Guide[]) {
  const operational = guides.filter(isOperationalGuide);
  if (!operational.length) return operationalModules;
  return uniqueTaxonomyLabels(operational.map((guide) => guide.category)).map((name) => {
    const known = operationalModules.find((module) => taxonomyKey(module.name) === taxonomyKey(name));
    return known ?? { id: slugifyId(name), name, description: "Modul dari workbook pedoman." };
  });
}

export function categoryGuideCount(guides: Guide[], product: Product, categoryName: string) {
  const categoryKey = categoryTaxonomyKey(product.id, categoryName);
  return guides.filter((guide) => guideMatchesProduct(guide, product) && categoryTaxonomyKey(product.id, guide.category) === categoryKey).length;
}
