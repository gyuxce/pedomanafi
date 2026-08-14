"use client";

import { memo, useCallback, useDeferredValue, useMemo, useState } from "react";
import { ArrowLeft, BookOpen, CheckCircle2, ChevronRight, LogOut, Menu, Search, X, Zap } from "lucide-react";
import { products, type Guide, type Product } from "@/lib/mock-data";
import type { Announcement } from "@/lib/ops-types";
import type { GuideFeedbackInput } from "@/lib/ops-types";
import { KoraMark } from "@/components/kora-mark";
import { ConditionSummary, EmptyState, GuideDetail, LoadingState } from "@/components/guide-detail";
import { HighlightedText } from "@/components/highlighted-text";
import { buildOperationalModules, buildProductCatalog, categoryGuideCount, categoryTaxonomyKey, guideMatchesProduct, isOperationalGuide, taxonomyKey, uniqueTaxonomyLabels } from "@/lib/guide-catalog";
import { operationalModules } from "@/lib/mock-data";
import { SEARCH_RESULT_LIMIT, normalizeSearchText, outcomeLabel, outcomeTone } from "@/lib/guide-ui";
import { useDebouncedValue } from "@/lib/use-debounced-value";

type AgentView = "home" | "subtypes" | "conditions" | "detail" | "search" | "module";
type AgentArea = "products" | "operational";

function GlobalSearchBar({ query, variant, onChange }: { query: string; variant: "global"; onChange: (value: string) => void }) {
  return <div className={`global-search ${variant}`}><Search size={20} /><input value={query} onChange={(event) => onChange(event.target.value)} placeholder="Cari kendala, produk, kategori..." aria-label="Cari pedoman" /></div>;
}

function UpdateStrip({ announcements }: { announcements: Announcement[] }) {
  if (!announcements.length) {
    return <section className="update-strip empty"><div className="update-strip-head"><span className="eyebrow muted">Update penting</span><span>Dari Admin</span></div><div className="update-strip-row info"><span><BookOpen size={15} /></span><strong>Belum ada pengumuman aktif</strong><small>Admin/Quality menuliskan update di menu Pengumuman.</small></div></section>;
  }
  return <section className="update-strip"><div className="update-strip-head"><span className="eyebrow muted">Update penting</span><span>Dari Admin</span></div>{announcements.map((update) => <div key={update.id} className={`update-strip-row ${update.tone}`}><span>{update.tone === "warning" ? <Zap size={15} /> : update.tone === "success" ? <CheckCircle2 size={15} /> : <BookOpen size={15} />}</span><strong>{update.title}</strong><small>{update.detail}</small></div>)}</section>;
}

function AllProductsHome({ catalog, guides: catalogGuides, announcements, onChooseCategory }: { catalog: Product[]; guides: Guide[]; announcements: Announcement[]; onChooseCategory: (productId: string, categoryId?: string) => void }) {
  const categoryCount = catalog.reduce((total, product) => total + product.categories.length, 0);
  const scenarioCount = catalogGuides.length;
  return <>
    <section className="product-hero"><div><span className="eyebrow light">KORA · Live Chat Operations</span><h1>Semua produk dan kendala dalam satu halaman.</h1><p>Pilih kategori langsung dari beranda untuk membuka sub tipe dan pedoman yang paling sesuai.</p></div><div className="hero-guide-card"><strong>{catalog.length} produk</strong><span>{categoryCount} kategori · {scenarioCount.toLocaleString("id-ID")} kondisi</span><small>Semua pedoman dari workbook tetap mengarah ke flow per kondisi</small></div></section>
    <section className="all-products-library">{catalog.map((product) => <section className="product-overview" key={product.id}><div className="product-overview-head"><div><strong>{product.name}</strong><small>{product.categories.length} kategori kendala</small></div><span>{product.shortName}</span></div><div className="product-category-list">{product.categories.map((category, index) => { const count = categoryGuideCount(catalogGuides, product, category.name); return <button className="product-category-item" key={category.id} onClick={() => onChooseCategory(product.id, category.id)}><span className="category-index">{String(index + 1).padStart(2, "0")}</span><span className="category-list-copy"><strong>{category.name}</strong><small>{count.toLocaleString("id-ID")} kondisi · {category.description}</small></span><em>Pilih kategori</em></button>; })}</div></section>)}</section>
    <UpdateStrip announcements={announcements} />
  </>;
}

function SubtypeList({ product, category, subtypes, onBack, onChoose }: { product: string; category: string; subtypes: string[]; onBack: () => void; onChoose: (subtype: string) => void }) {
  return <section className="drill-page"><button className="back-link" onClick={onBack}><ArrowLeft size={15} /> Kembali ke kategori</button><span className="eyebrow muted">{product} · {category}</span><h1>Pilih sub tipe tiket</h1><p>Gunakan sub tipe yang paling sesuai dengan kendala pelanggan.</p>{subtypes.length ? <div className="subtype-list compact-subtype-list">{subtypes.map((subtype, index) => <button key={subtype} onClick={() => onChoose(subtype)}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{subtype}</strong><small>Lihat kondisi pelanggan yang tersedia</small></div><ChevronRight size={18} /></button>)}</div> : <EmptyState title="Sub tipe kategori ini akan tersedia setelah import" detail="Taxonomy kategori sudah siap. Konten dan kondisi pelanggan akan muncul setelah data produk dipublikasikan." />}</section>;
}

function ConditionList({ product, category, subtype, guides: conditionGuides, onBack, onOpenGuide }: { product: string; category: string; subtype: string; guides: Guide[]; onBack: () => void; onOpenGuide: (guide: Guide) => void }) {
  return <section className="drill-page"><button className="back-link" onClick={onBack}><ArrowLeft size={15} /> Kembali ke sub tipe tiket</button><span className="eyebrow muted">{product} · {category}</span><h1>{subtype}</h1><p>Pilih satu kondisi pelanggan untuk membuka pedoman lengkap.</p>{conditionGuides.length ? <div className="condition-list compact-condition-list">{conditionGuides.map((guide) => <button key={guide.id} onClick={() => onOpenGuide(guide)}><span className="condition-dot" /><div><strong>{guide.title}</strong><div className="condition-outcome-list">{guide.outcomes.map((outcome, index) => <span key={`${outcome.id}-${index}`} className={outcomeTone(outcome.type)}>{outcomeLabel(outcome.type)}</span>)}</div></div><ChevronRight size={18} /></button>)}</div> : <EmptyState title="Belum ada kondisi yang dipublikasikan" detail="Admin dapat menambahkan kondisi baru pada sub tipe ini melalui form Scenario." />}</section>;
}

function OperationalHome({ modules, onChooseModule }: { modules: typeof operationalModules; onChooseModule: (moduleId: string) => void }) {
  return <section className="operational-home"><div className="operational-hero"><span className="eyebrow light">Pedoman lintas produk</span><h1>Pedoman Operasional</h1><p>Pilih jenis pedoman yang diperlukan. Konten di bawah tidak dicampur dengan pedoman produk.</p></div><div className="operational-grid">{modules.map((module, index) => <button key={module.id} className={`operational-card tone-${index % 5}`} onClick={() => onChooseModule(module.id)}><span><BookOpen size={18} /></span><div><strong>{module.name}</strong><small>{module.description}</small></div><ChevronRight size={17} /></button>)}</div></section>;
}

function OperationalModuleView({ moduleName, guides: moduleGuides, loading, onBack, onOpenGuide }: { moduleName: string; guides: Guide[]; loading: boolean; onBack: () => void; onOpenGuide: (guide: Guide) => void }) {
  return <section className="drill-page"><button className="back-link" onClick={onBack}><ArrowLeft size={15} /> Kembali ke Pedoman Operasional</button><span className="eyebrow muted">Pedoman Operasional</span><h1>{moduleName}</h1><p>Konten dari sheet ini tersimpan dan dikelola secara terpisah dari pedoman produk.</p>{loading ? <LoadingState detail="Sedang mengambil isi modul dari database." /> : moduleGuides.length ? <div className="condition-list compact-condition-list">{moduleGuides.map((guide) => <button key={guide.id} onClick={() => onOpenGuide(guide)}><span className="condition-dot" /><div><strong>{guide.title}</strong><ConditionSummary value={guide.condition} /><small>{guide.outcomes.map((outcome, index) => <span key={`${outcome.id}-${index}`}>{index ? " · " : ""}{outcomeLabel(outcome.type)}</span>)}</small></div><ChevronRight size={18} /></button>)}</div> : <EmptyState title="Isi modul belum ditemukan" detail="Pastikan snapshot import terbaru sudah memuat sheet operasional ini." />}</section>;
}

const SearchResultList = memo(function SearchResultList({ query, results, onOpenGuide }: { query: string; results: Guide[]; onOpenGuide: (guide: Guide) => void }) {
  return <div className="search-result-list">{results.map((guide) => <button key={guide.id} onClick={() => onOpenGuide(guide)}><span className="search-result-marker"><BookOpen size={15} /></span><div><strong><HighlightedText text={guide.title} query={query} /></strong><p><HighlightedText text={guide.condition} query={query} /></p><small><HighlightedText text={guide.product + " · " + guide.category + " · " + guide.subtype} query={query} /></small></div><ChevronRight size={17} /></button>)}</div>;
});

function SearchViewLive({ query, results, isPending, onBack, onOpenGuide }: { query: string; results: Guide[]; isPending: boolean; onBack: () => void; onOpenGuide: (guide: Guide) => void }) {
  return <section className="search-page-v4"><button className="back-link" onClick={onBack}><ArrowLeft size={15} /> Kembali ke beranda</button><span className="eyebrow muted">Pencarian global</span><h1>Hasil pencarian</h1><p>Gunakan satu kolom pencarian global di header untuk menemukan pedoman.</p><div className="search-count">{isPending ? <span className="search-pending">Menyesuaikan hasil...</span> : <><strong>{results.length}</strong> pedoman ditemukan{query.trim() ? ` untuk “${query}”` : ""}</>}</div><SearchResultList query={query} results={results} onOpenGuide={onOpenGuide} />{!isPending && results.length > SEARCH_RESULT_LIMIT && <p className="search-result-limit">Hasil pencarian sangat banyak. Tambahkan kata kunci agar lebih spesifik.</p>}</section>;
}

export function AgentWorkspace({
  importedGuides,
  publishedGuides,
  guidesLoading,
  guidesError,
  announcements,
  onSubmitFeedback,
  onSignOut,
}: {
  importedGuides: Guide[];
  publishedGuides: Guide[];
  guidesLoading: boolean;
  guidesError: string;
  announcements: Announcement[];
  onSubmitFeedback: (input: GuideFeedbackInput) => Promise<void>;
  onSignOut: () => void;
}) {
  const [area, setArea] = useState<AgentArea>("products");
  const [view, setView] = useState<AgentView>("home");
  const [activeProductId, setActiveProductId] = useState(products[0].id);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [activeSubtype, setActiveSubtype] = useState<string | null>(null);
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
  const [selectedGuideId, setSelectedGuideId] = useState("");
  const [query, setQuery] = useState("");
  const [mobileMenu, setMobileMenu] = useState(false);
  const debouncedQuery = useDebouncedValue(query, 200);
  const deferredQuery = useDeferredValue(debouncedQuery);

  const sourceGuides = publishedGuides.length ? publishedGuides : importedGuides;
  const productCatalog = useMemo(() => buildProductCatalog(sourceGuides), [sourceGuides]);
  const operationalCatalog = useMemo(() => buildOperationalModules(sourceGuides), [sourceGuides]);
  const activeProduct = productCatalog.find((product) => product.id === activeProductId) ?? productCatalog[0] ?? products[0];
  const activeCategory = activeProduct.categories.find((category) => category.id === activeCategoryId) ?? null;
  const productGuides = useMemo(() => sourceGuides.filter((guide) => !isOperationalGuide(guide)), [sourceGuides]);
  const operationalContent = useMemo(() => sourceGuides.filter(isOperationalGuide), [sourceGuides]);
  const allGuides = useMemo(() => [...productGuides, ...operationalContent], [operationalContent, productGuides]);
  const categoryGuides = productGuides.filter((guide) => guideMatchesProduct(guide, activeProduct) && categoryTaxonomyKey(activeProduct.id, guide.category) === categoryTaxonomyKey(activeProduct.id, activeCategory?.name ?? ""));
  const subtypes = uniqueTaxonomyLabels(categoryGuides.map((guide) => guide.subtype));
  const conditionGuides = categoryGuides.filter((guide) => taxonomyKey(guide.subtype) === taxonomyKey(activeSubtype ?? ""));
  const selectedGuide = allGuides.find((guide) => guide.id === selectedGuideId) ?? allGuides[0];
  const activeModule = operationalCatalog.find((module) => module.id === activeModuleId) ?? null;
  const moduleGuides = operationalContent.filter((guide) => taxonomyKey(guide.category) === taxonomyKey(activeModule?.name ?? ""));
  const searchIndex = useMemo(() => allGuides.map((guide) => {
    const title = normalizeSearchText(guide.title);
    const taxonomy = normalizeSearchText([guide.product, guide.category, guide.subtype].join(" "));
    const detail = normalizeSearchText([guide.condition, guide.script].join(" "));
    return { guide, title, taxonomy, detail, text: [title, taxonomy, detail].join(" ") };
  }), [allGuides]);
  const searchResults = useMemo(() => {
    const term = normalizeSearchText(deferredQuery);
    if (!term) return allGuides;
    const tokens = term.split(" ").filter(Boolean);
    const ranked: Array<{ guide: Guide; score: number; index: number }> = [];
    searchIndex.forEach((entry, index) => {
      if (!tokens.every((token) => entry.text.includes(token))) return;
      let score = 0;
      tokens.forEach((token) => {
        if (entry.title.includes(token)) score += 120;
        if (entry.taxonomy.includes(token)) score += 70;
        if (entry.detail.includes(token)) score += 10;
      });
      if (entry.title === term) score += 40;
      ranked.push({ guide: entry.guide, score, index });
    });
    return ranked.sort((left, right) => right.score - left.score || left.index - right.index).map(({ guide }) => guide);
  }, [allGuides, deferredQuery, searchIndex]);
  const searchPending = normalizeSearchText(query) !== normalizeSearchText(deferredQuery);
  const displaySearchResults = searchPending && !normalizeSearchText(deferredQuery) ? [] : searchResults;

  function chooseArea(nextArea: AgentArea) {
    setArea(nextArea);
    setView("home");
    setActiveCategoryId(null);
    setActiveSubtype(null);
    setActiveModuleId(null);
    setMobileMenu(false);
  }

  function chooseCategory(productId: string, categoryId?: string) {
    if (!categoryId) return;
    setActiveProductId(productId);
    setActiveCategoryId(categoryId);
    setActiveSubtype(null);
    setView("subtypes");
  }

  const openGuide = useCallback((guide: Guide) => {
    setSelectedGuideId(guide.id);
    setView("detail");
  }, []);

  const backFromSearch = useCallback(() => {
    setQuery("");
    setView("home");
  }, []);

  function goHome() {
    setArea("products");
    setView("home");
    setActiveCategoryId(null);
    setActiveSubtype(null);
    setActiveModuleId(null);
    setQuery("");
    setMobileMenu(false);
  }

  const breadcrumbs = area === "operational"
    ? ["Pedoman Operasional", activeModule?.name, view === "detail" ? selectedGuide?.title : undefined]
    : [activeProduct.name, activeCategory?.name, activeSubtype ?? undefined, view === "detail" ? selectedGuide?.title : undefined];

  return <main className="agent-app">
    <header className="agent-topbar">
      <div className="agent-topbar-inner"><button className="agent-brand" onClick={goHome} aria-label="Kembali ke beranda"><span className="brand-mark"><KoraMark size={19} /></span><span className="brand-lockup"><strong>KORA</strong><span>Knowledge Operations &amp; Resolution Access</span></span></button><nav className={`agent-primary-nav ${mobileMenu ? "is-open" : ""}`} aria-label="Navigasi knowledge"><button className={area === "products" ? "active" : ""} onClick={() => chooseArea("products")}>Produk</button><button className={area === "operational" ? "active" : ""} onClick={() => chooseArea("operational")}>Pedoman Operasional</button></nav><div className="agent-top-actions"><button className="top-avatar" aria-label="Profil Agent">AD</button><button className="icon-button mobile-menu-trigger" aria-label="Buka menu" onClick={() => setMobileMenu(!mobileMenu)}>{mobileMenu ? <X size={19} /> : <Menu size={19} />}</button><button className="icon-button signout-button" aria-label="Keluar" onClick={onSignOut}><LogOut size={17} /></button></div></div>
    </header>
    <div className="agent-page">
      <div className="agent-breadcrumbs"><button onClick={() => { setView("home"); setActiveCategoryId(null); setActiveSubtype(null); }}>{area === "products" ? "Produk" : "Pedoman Operasional"}</button>{breadcrumbs.slice(0, -1).filter(Boolean).map((crumb) => <span key={crumb}><ChevronRight size={13} />{crumb}</span>)}</div>
      <div className="agent-global-search"><GlobalSearchBar query={query} variant="global" onChange={(value) => { setQuery(value); setView(value.trim() ? "search" : "home"); }} /></div>
      {guidesError && <div className="guide-load-alert"><Zap size={15} /><span>{guidesError}</span></div>}
      {view === "home" && area === "products" && <AllProductsHome catalog={productCatalog} guides={productGuides} announcements={announcements} onChooseCategory={chooseCategory} />}
      {view === "subtypes" && activeCategory && <SubtypeList product={activeProduct.name} category={activeCategory.name} subtypes={subtypes} onBack={() => { setView("home"); setActiveCategoryId(null); }} onChoose={(subtype) => { setActiveSubtype(subtype); setView("conditions"); }} />}
      {view === "conditions" && activeCategory && activeSubtype && <ConditionList product={activeProduct.name} category={activeCategory.name} subtype={activeSubtype} guides={conditionGuides} onBack={() => setView("subtypes")} onOpenGuide={openGuide} />}
      {view === "home" && area === "operational" && <OperationalHome modules={operationalCatalog} onChooseModule={(moduleId) => { setActiveModuleId(moduleId); setView("module"); }} />}
      {view === "module" && activeModule && <OperationalModuleView moduleName={activeModule.name} guides={moduleGuides} loading={guidesLoading} onBack={() => { setView("home"); setActiveModuleId(null); }} onOpenGuide={openGuide} />}
      {view === "detail" && selectedGuide && <GuideDetail guide={selectedGuide} onBack={() => setView(area === "operational" ? "module" : "conditions")} onSubmitFeedback={onSubmitFeedback} />}
      {view === "search" && <SearchViewLive query={deferredQuery} results={displaySearchResults} isPending={searchPending} onBack={backFromSearch} onOpenGuide={openGuide} />}
    </div>
  </main>;
}
