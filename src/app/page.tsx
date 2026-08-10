"use client";

import { ChangeEvent, FormEvent, memo, type ReactNode, useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Copy,
  Database,
  FileSpreadsheet,
  LifeBuoy,
  LogOut,
  Menu,
  Search,
  ShieldCheck,
  Upload,
  X,
  Zap,
} from "lucide-react";
import {
  guides,
  operationalGuides,
  operationalModules,
  products,
  updates,
  type Guide,
  type GuideImage,
  type OutcomeType,
  type ScenarioOutcome,
} from "@/lib/mock-data";
import { parseExcelFile, type ImportQcSummary, type ImportResult, type ImportSummary } from "@/lib/excel-importer";
import { loadAdminGuides, loadPublishedGuides, roleFromUser, saveImportToDatabase, updateScenarioInDatabase } from "@/lib/ekb-repository";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import type { User } from "@supabase/supabase-js";

type AgentView = "home" | "subtypes" | "conditions" | "detail" | "search" | "module";
type AgentArea = "products" | "operational";
type AdminView = "content" | "import" | "review";
type AdminScenarioSort = "default" | "source_asc" | "source_desc";

const IMPORT_STORAGE_KEY = "afi-knowledge-imported-guides-v1";

function KoraMark({ size = 20 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false"><path d="M19 15v34M19 32l25-17M19 32l25 17" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" /><circle cx="46" cy="15" r="3" fill="#a9dcff" /></svg>;
}

function getInitialImportState() {
  if (typeof window === "undefined") return { guides: [] as Guide[], summary: null as ImportSummary | null };
  try {
    const saved = window.localStorage.getItem(IMPORT_STORAGE_KEY);
    if (!saved) return { guides: [], summary: null };
    const payload = JSON.parse(saved) as { guides?: Guide[]; summary?: ImportSummary };
    return { guides: Array.isArray(payload.guides) ? payload.guides : [], summary: payload.summary ?? null };
  } catch {
    window.localStorage.removeItem(IMPORT_STORAGE_KEY);
    return { guides: [], summary: null };
  }
}

function outcomeLabel(type: OutcomeType) {
  if (type === "tier_1") return "Selesai di Tier 1";
  if (type === "tier_2_3") return "Eskalasi ke Tier 2/3";
  if (type === "transfer_asi") return "Transfer ke ASI";
  return "Pertanyaan awal";
}

function outcomeTone(type: OutcomeType) {
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

function escalationFlag(guide?: Guide) {
  const variant = guide?.sourceVariant?.toLocaleLowerCase("id-ID") || "";
  if (variant.includes("escalasi-no")) return "no";
  if (variant.includes("escalasi-yes")) return "yes";
  return undefined;
}

function defaultOutcomeId(guide: Guide) {
  // Escalation cases open directly on their escalation flow so Agent can see
  // the complete operation without an extra click.
  const escalationOutcome = guide.outcomes.find((outcome) => outcome.type === "tier_2_3");
  return escalationOutcome?.id ?? guide.outcomes[0]?.id ?? "";
}

function escalationStepsForDisplay(outcome: ScenarioOutcome, guide?: Guide) {
  if (outcome.type === "tier_1" || outcome.type === "reference") return [];
  const variants = guide?.sourceVariant?.toLocaleLowerCase("id-ID").split("|") || [];
  if (variants.includes("has-tier2") || escalationFlag(guide) === "yes" || outcome.type === "tier_2_3" || outcome.type === "transfer_asi") return outcome.agentSteps;
  const specific = specificEscalationSteps(outcome);
  return specific.length ? specific : outcome.agentSteps;
}

function highlightText(text: string, query: string) {
  const terms = query.trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return text;
  const pattern = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const matcher = new RegExp("(" + pattern + ")", "gi");
  const normalizedTerms = new Set(terms.map((term) => term.toLowerCase()));
  return text.split(matcher).map((part, index) => normalizedTerms.has(part.toLowerCase()) ? <mark className="search-highlight" key={index}>{part}</mark> : part);
}

function taxonomyKey(value: string) {
  return value
    .replace(/pengembalian\s*\(refund\)/gi, "refund")
    .replace(/[()]/g, "")
    .replace(/\//g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("id-ID");
}

function categoryTaxonomyKey(productId: string | undefined, value: string) {
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

function uniqueTaxonomyLabels(values: string[]) {
  const labels = new Map<string, string>();
  values.map((value) => value.replace(/\s+/g, " ").trim()).filter(Boolean).forEach((value) => {
    const key = taxonomyKey(value);
    if (!labels.has(key)) labels.set(key, value);
  });
  return [...labels.values()];
}

function GlobalSearchBar({ query, variant, onChange }: { query: string; variant: "global"; onChange: (value: string) => void }) {
  return <div className={`global-search ${variant}`}><Search size={20} /><input value={query} onChange={(event) => onChange(event.target.value)} placeholder="Cari kendala, produk, kategori..." aria-label="Cari pedoman" /></div>;
}

const SEARCH_RESULT_LIMIT = 80;

function useDebouncedValue<T>(value: T, delay = 200) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);
  return debouncedValue;
}

function normalizeSearchText(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("id-ID").replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}

export default function Home() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [authReady, setAuthReady] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [publishedGuides, setPublishedGuides] = useState<Guide[]>([]);
  const [guidesLoading, setGuidesLoading] = useState(false);
  const [guidesError, setGuidesError] = useState("");
  const [adminGuides, setAdminGuides] = useState<Guide[]>([]);
  const [importState, setImportState] = useState(getInitialImportState);
  const { importedGuides, importSummary } = { importedGuides: importState.guides, importSummary: importState.summary };

  useEffect(() => {
    if (!supabase) {
      return;
    }
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setUser(data.session?.user ?? null);
      setAuthReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthReady(true);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!supabase || !user?.id) {
      return;
    }
    let active = true;
    void (async () => {
      setGuidesLoading(true);
      setGuidesError("");
      try {
        const loaded = await loadPublishedGuides(supabase);
        if (active) setPublishedGuides(loaded);
      } catch {
        if (active) {
          setPublishedGuides([]);
          setGuidesError("Pedoman belum berhasil dimuat dari database. Coba refresh halaman.");
        }
      } finally {
        if (active) setGuidesLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [supabase, user?.id]);

  async function refreshAdminGuides() {
    if (!supabase || !user || roleFromUser(user) !== "admin") return;
    const loaded = await loadAdminGuides(supabase);
    setAdminGuides(loaded);
  }

  useEffect(() => {
    if (!supabase || !user?.id || roleFromUser(user) !== "admin") {
      return;
    }
    let active = true;
    loadAdminGuides(supabase).then((loaded) => {
      if (active) setAdminGuides(loaded);
    }).catch(() => {
      if (active) setAdminGuides([]);
    });
    return () => {
      active = false;
    };
  }, [supabase, user]);

  function saveImport(result: ImportResult) {
    setImportState({ guides: result.guides, summary: result.summary });
    try {
      const serialized = JSON.stringify({ guides: result.guides, summary: result.summary });
      if (serialized.length < 4_000_000) window.localStorage.setItem(IMPORT_STORAGE_KEY, serialized);
      else window.localStorage.removeItem(IMPORT_STORAGE_KEY);
    } catch {
      // The in-memory staging result remains available even when browser storage is full.
    }
  }

  async function signIn(email: string, password: string) {
    if (!supabase) {
      setAuthError("Supabase belum dikonfigurasi. Hubungi admin untuk melengkapi koneksi.");
      return;
    }
    setAuthBusy(true);
    setAuthError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setAuthBusy(false);
    if (error) {
      setAuthError(error.message);
      return;
    }
  }

  async function signOut() {
    if (supabase && user) await supabase.auth.signOut();
    setUser(null);
  }

  async function persistImport(result: ImportResult) {
    saveImport(result);
    if (supabase && user && roleFromUser(user) === "admin") {
      await saveImportToDatabase(supabase, result, user);
      await refreshAdminGuides();
    }
  }

  async function saveScenario(guide: Guide, publish: boolean) {
    if (!supabase || !user || roleFromUser(user) !== "admin") {
      throw new Error("Edit dan Publish hanya tersedia untuk Admin yang terhubung ke database.");
    }
    await updateScenarioInDatabase(supabase, guide, user, publish);
    await refreshAdminGuides();
  }

  if (!authReady) return <LoginScreen onSignIn={signIn} authError={authError} authBusy={authBusy} />;
  if (!user) return <LoginScreen onSignIn={signIn} authError={authError} authBusy={authBusy} />;

  const role = roleFromUser(user);
  const agentStagingGuides = importedGuides.filter((guide) => guide.status === "Published");
  return role === "admin" ? <AdminConsoleV2 importedGuides={adminGuides.length ? adminGuides : importedGuides} importSummary={importSummary} onImport={persistImport} onSaveScenario={saveScenario} onSignOut={signOut} /> : <AgentWorkspace importedGuides={agentStagingGuides} publishedGuides={publishedGuides} guidesLoading={guidesLoading} guidesError={guidesError} onSignOut={signOut} />;
}

function LoginScreen({ onSignIn, authError, authBusy }: { onSignIn: (email: string, password: string) => Promise<void>; authError: string; authBusy: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return <><main className="login-page">
    <section className="login-shell">
      <div className="login-brand"><span className="brand-mark large"><KoraMark size={23} /></span><div><strong>KORA</strong><span>Knowledge Operations &amp; Resolution Access</span></div></div>
      <div className="login-grid">
      <div className="login-intro"><span className="eyebrow">Product-first knowledge base</span><h1>Jawaban cepat, sesuai <em>kondisi pelanggan.</em></h1><p>Pilih produk, pilih kendala, lalu ikuti pedoman dan tindakan CRM yang tepat untuk Live Chat.</p><div className="login-proof"><div><strong>Produk</strong><span>Struktur berbasis kendala</span></div><div><strong>Pedoman</strong><span>Alur lengkap per kondisi</span></div><div><strong>Live Chat</strong><span>Siap dipakai Agent</span></div></div></div>
        <div className="login-card"><div className="login-card-head"><span className="login-card-icon"><ShieldCheck size={20} /></span><div><h2>Masuk ke KORA</h2><p>Gunakan akun internal kamu.</p></div></div><form onSubmit={(event) => { event.preventDefault(); void onSignIn(email, password); }}><label>Email kerja<input type="email" placeholder="nama@perusahaan.com" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>Password<input type="password" placeholder="Masukkan password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label><button className="primary-button login-button" type="submit">Masuk sebagai Agent <ArrowRight size={16} /></button></form><p className="login-note">Akses mengikuti role akun internal: Agent, Admin, atau Quality.</p></div>
      </div>
    </section>
  </main>{authError && <p className="login-error login-error-global">{authError}</p>}{authBusy && <span className="login-busy-global">Memeriksa akun...</span>}</>;
}

function AgentWorkspace({ importedGuides, publishedGuides, guidesLoading, guidesError, onSignOut }: { importedGuides: Guide[]; publishedGuides: Guide[]; guidesLoading: boolean; guidesError: string; onSignOut: () => void }) {
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

  const activeProduct = products.find((product) => product.id === activeProductId) ?? products[0];
  const activeCategory = activeProduct.categories.find((category) => category.id === activeCategoryId) ?? null;
  const productGuides = useMemo(() => {
    const source = publishedGuides.length ? publishedGuides : importedGuides;
    return source.filter((guide) => Boolean(guide.productId));
  }, [importedGuides, publishedGuides]);
  const operationalContent = useMemo(() => {
    const source = publishedGuides.length ? publishedGuides : importedGuides;
    return source.filter((guide) => !guide.productId && taxonomyKey(guide.product) === taxonomyKey("Pedoman Operasional"));
  }, [importedGuides, publishedGuides]);
  const allGuides = useMemo(() => [...productGuides, ...operationalContent], [operationalContent, productGuides]);
  const categoryGuides = productGuides.filter((guide) => guide.productId === activeProduct.id && categoryTaxonomyKey(activeProduct.id, guide.category) === categoryTaxonomyKey(activeProduct.id, activeCategory?.name ?? ""));
  const subtypes = uniqueTaxonomyLabels(categoryGuides.map((guide) => guide.subtype));
  const conditionGuides = categoryGuides.filter((guide) => taxonomyKey(guide.subtype) === taxonomyKey(activeSubtype ?? ""));
  const selectedGuide = allGuides.find((guide) => guide.id === selectedGuideId) ?? allGuides[0];
  const activeModule = operationalModules.find((module) => module.id === activeModuleId) ?? null;
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
    ? ["Pedoman Operasional", activeModule?.name, view === "detail" ? selectedGuide.title : undefined]
    : [activeProduct.name, activeCategory?.name, activeSubtype ?? undefined, view === "detail" ? selectedGuide.title : undefined];

  return <main className="agent-app">
    <header className="agent-topbar">
      <div className="agent-topbar-inner"><button className="agent-brand" onClick={goHome} aria-label="Kembali ke beranda"><span className="brand-mark"><KoraMark size={19} /></span><span className="brand-lockup"><strong>KORA</strong><span>Knowledge Operations &amp; Resolution Access</span></span></button><nav className={`agent-primary-nav ${mobileMenu ? "is-open" : ""}`} aria-label="Navigasi knowledge"><button className={area === "products" ? "active" : ""} onClick={() => chooseArea("products")}>Produk</button><button className={area === "operational" ? "active" : ""} onClick={() => chooseArea("operational")}>Pedoman Operasional</button></nav><div className="agent-top-actions"><button className="top-avatar" aria-label="Profil Agent">AD</button><button className="icon-button mobile-menu-trigger" aria-label="Buka menu" onClick={() => setMobileMenu(!mobileMenu)}>{mobileMenu ? <X size={19} /> : <Menu size={19} />}</button><button className="icon-button signout-button" aria-label="Keluar" onClick={onSignOut}><LogOut size={17} /></button></div></div>
    </header>
    <div className="agent-page">
      <div className="agent-breadcrumbs"><button onClick={() => { setView("home"); setActiveCategoryId(null); setActiveSubtype(null); }}>{area === "products" ? "Produk" : "Pedoman Operasional"}</button>{breadcrumbs.slice(0, -1).filter(Boolean).map((crumb) => <span key={crumb}><ChevronRight size={13} />{crumb}</span>)}</div>
      <div className="agent-global-search"><GlobalSearchBar query={query} variant="global" onChange={(value) => { setQuery(value); setView(value.trim() ? "search" : "home"); }} /></div>
      {guidesError && <div className="guide-load-alert"><Zap size={15} /><span>{guidesError}</span></div>}
      {view === "home" && area === "products" && <ProductHome onChooseCategory={chooseCategory} />}
      {view === "subtypes" && activeCategory && <SubtypeList product={activeProduct.name} category={activeCategory.name} subtypes={subtypes} onBack={() => { setView("home"); setActiveCategoryId(null); }} onChoose={(subtype) => { setActiveSubtype(subtype); setView("conditions"); }} />}
      {view === "conditions" && activeCategory && activeSubtype && <ConditionList product={activeProduct.name} category={activeCategory.name} subtype={activeSubtype} guides={conditionGuides} onBack={() => setView("subtypes")} onOpenGuide={openGuide} />}
      {view === "home" && area === "operational" && <OperationalHome onChooseModule={(moduleId) => { setActiveModuleId(moduleId); setView("module"); }} />}
      {view === "module" && activeModule && <OperationalModuleView moduleName={activeModule.name} guides={moduleGuides} loading={guidesLoading} onBack={() => { setView("home"); setActiveModuleId(null); }} onOpenGuide={openGuide} />}
      {view === "detail" && <GuideDetail guide={selectedGuide} onBack={() => setView(area === "operational" ? "module" : "conditions")} />}
      {view === "search" && <SearchViewLive query={deferredQuery} results={displaySearchResults} isPending={searchPending} onBack={backFromSearch} onOpenGuide={openGuide} />}
    </div>
  </main>;
}

function AllProductsHome({ onChooseCategory }: { onChooseCategory: (productId: string, categoryId?: string) => void }) {
  const categoryCount = products.reduce((total, product) => total + product.categories.length, 0);
  return <>
    <section className="product-hero"><div><span className="eyebrow light">KORA · Live Chat Operations</span><h1>Semua produk dan kendala dalam satu halaman.</h1><p>Pilih kategori langsung dari beranda untuk membuka sub tipe dan pedoman yang paling sesuai.</p></div><div className="hero-guide-card"><strong>{products.length} produk</strong><span>{categoryCount} kategori kendala</span><small>Semua pedoman tetap mengarah ke flow per kondisi</small></div></section>
    <section className="all-products-library">{products.map((product) => <section className="product-overview" key={product.id}><div className="product-overview-head"><div><strong>{product.name}</strong><small>{product.categories.length} kategori kendala</small></div><span>{product.shortName}</span></div><div className="product-category-list">{product.categories.map((category, index) => <button className="product-category-item" key={category.id} onClick={() => onChooseCategory(product.id, category.id)}><span className="category-index">{String(index + 1).padStart(2, "0")}</span><span className="category-list-copy"><strong>{category.name}</strong><small>{category.description}</small></span><em>Pilih kategori</em></button>)}</div></section>)}</section>
    <section className="update-strip"><div className="update-strip-head"><span className="eyebrow muted">Update penting</span><span>Hari ini</span></div>{updates.map((update) => <div key={update.title} className={`update-strip-row ${update.tone}`}><span>{update.tone === "warning" ? <Zap size={15} /> : update.tone === "success" ? <CheckCircle2 size={15} /> : <BookOpen size={15} />}</span><strong>{update.title}</strong><small>{update.detail}</small></div>)}</section>
  </>;
}

function ProductHome({ onChooseCategory }: { onChooseCategory: (productId: string, categoryId?: string) => void }) {
  if (products.length >= 0) return <AllProductsHome onChooseCategory={onChooseCategory} />;
  const activeProduct = products[0];
  const onChooseProduct = (productId: string) => { void productId; };
  return <>
    <section className="product-hero"><div><span className="eyebrow light">KORA · Live Chat Operations</span><h1>Pilih produk, lalu pilih kendalanya.</h1><p>Pedoman disusun mengikuti produk dan kategori agar kamu dapat merespons pelanggan lebih cepat.</p></div><div className="hero-guide-card"><BookOpen size={21} /><strong>1 kondisi</strong><span>1 pedoman utuh</span><small>Tier 1 dan eskalasi ada dalam satu flow</small></div></section>
    <section className="product-library"><div className="section-label"><span>01</span><div><strong>Pilih produk</strong><small>Produk aktif untuk Live Chat</small></div></div><div className="product-tabs" role="tablist">{products.map((product) => <button key={product.id} role="tab" aria-selected={product.id === activeProduct.id} className={product.id === activeProduct.id ? "active" : ""} onClick={() => onChooseProduct(product.id)}>{product.shortName}</button>)}</div></section>
    <section className="category-section"><div className="category-section-head"><div><span className="eyebrow muted">02 · Kategori kendala</span><h2>{activeProduct.name}</h2><p>Pilih kategori yang paling dekat dengan keluhan pelanggan.</p></div><span className="category-count">{activeProduct.categories.length} kategori</span></div><div className="product-category-grid">{activeProduct.categories.map((category, index) => <button className={`product-category-card tone-${index % 5}`} key={category.id} onClick={() => onChooseCategory(category.id)}><span className="category-index">{String(index + 1).padStart(2, "0")}</span><span className="category-card-copy"><strong>{category.name}</strong><small>{category.description}</small><em>Lihat sub tipe tiket</em></span><ArrowRight size={17} /></button>)}</div></section>
    <section className="update-strip"><div className="update-strip-head"><span className="eyebrow muted">Update penting</span><span>Hari ini</span></div>{updates.map((update) => <div key={update.title} className={`update-strip-row ${update.tone}`}><span>{update.tone === "warning" ? <Zap size={15} /> : update.tone === "success" ? <CheckCircle2 size={15} /> : <BookOpen size={15} />}</span><strong>{update.title}</strong><small>{update.detail}</small></div>)}</section>
  </>;
}

function SubtypeList({ product, category, subtypes, onBack, onChoose }: { product: string; category: string; subtypes: string[]; onBack: () => void; onChoose: (subtype: string) => void }) {
  return <section className="drill-page"><button className="back-link" onClick={onBack}><ArrowLeft size={15} /> Kembali ke kategori</button><span className="eyebrow muted">{product} · {category}</span><h1>Pilih sub tipe tiket</h1><p>Gunakan sub tipe yang paling sesuai dengan kendala pelanggan.</p>{subtypes.length ? <div className="subtype-list compact-subtype-list">{subtypes.map((subtype, index) => <button key={subtype} onClick={() => onChoose(subtype)}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{subtype}</strong><small>Lihat kondisi pelanggan yang tersedia</small></div><ChevronRight size={18} /></button>)}</div> : <EmptyState title="Sub tipe kategori ini akan tersedia setelah import" detail="Taxonomy kategori sudah siap. Konten dan kondisi pelanggan akan muncul setelah data produk dipublikasikan." />}</section>;
}

function ConditionList({ product, category, subtype, guides: conditionGuides, onBack, onOpenGuide }: { product: string; category: string; subtype: string; guides: Guide[]; onBack: () => void; onOpenGuide: (guide: Guide) => void }) {
  return <section className="drill-page"><button className="back-link" onClick={onBack}><ArrowLeft size={15} /> Kembali ke sub tipe tiket</button><span className="eyebrow muted">{product} · {category}</span><h1>{subtype}</h1><p>Pilih satu kondisi pelanggan untuk membuka pedoman lengkap.</p>{conditionGuides.length ? <div className="condition-list compact-condition-list">{conditionGuides.map((guide) => <button key={guide.id} onClick={() => onOpenGuide(guide)}><span className="condition-dot" /><div><strong>{guide.title}</strong><div className="condition-outcome-list">{guide.outcomes.map((outcome, index) => <span key={`${outcome.id}-${index}`} className={outcomeTone(outcome.type)}>{outcomeLabel(outcome.type)}</span>)}</div></div><ChevronRight size={18} /></button>)}</div> : <EmptyState title="Belum ada kondisi yang dipublikasikan" detail="Admin dapat menambahkan kondisi baru pada sub tipe ini melalui form Scenario." />}</section>;
}

function OperationalHome({ onChooseModule }: { onChooseModule: (moduleId: string) => void }) {
  return <section className="operational-home"><div className="operational-hero"><span className="eyebrow light">Pedoman lintas produk</span><h1>Pedoman Operasional</h1><p>Pilih jenis pedoman yang diperlukan. Konten di bawah tidak dicampur dengan pedoman produk.</p></div><div className="operational-grid">{operationalModules.map((module, index) => <button key={module.id} className={`operational-card tone-${index % 5}`} onClick={() => onChooseModule(module.id)}><span><BookOpen size={18} /></span><div><strong>{module.name}</strong><small>{module.description}</small></div><ChevronRight size={17} /></button>)}</div></section>;
}

function OperationalModuleView({ moduleName, guides: moduleGuides, loading, onBack, onOpenGuide }: { moduleName: string; guides: Guide[]; loading: boolean; onBack: () => void; onOpenGuide: (guide: Guide) => void }) {
  return <section className="drill-page"><button className="back-link" onClick={onBack}><ArrowLeft size={15} /> Kembali ke Pedoman Operasional</button><span className="eyebrow muted">Pedoman Operasional</span><h1>{moduleName}</h1><p>Konten dari sheet ini tersimpan dan dikelola secara terpisah dari pedoman produk.</p>{loading ? <LoadingState detail="Sedang mengambil isi modul dari database." /> : moduleGuides.length ? <div className="condition-list compact-condition-list">{moduleGuides.map((guide) => <button key={guide.id} onClick={() => onOpenGuide(guide)}><span className="condition-dot" /><div><strong>{guide.title}</strong><ConditionSummary value={guide.condition} /><small>{guide.outcomes.map((outcome, index) => <span key={`${outcome.id}-${index}`}>{index ? " · " : ""}{outcomeLabel(outcome.type)}</span>)}</small></div><ChevronRight size={18} /></button>)}</div> : <EmptyState title="Isi modul belum ditemukan" detail="Pastikan snapshot import terbaru sudah memuat sheet operasional ini." />}</section>;
}

function splitGuidePoints(value: string) {
  return value
    .replace(/\r/g, "")
    .split(/\n+|(?=\d+[.)]\s)|(?=[*•](?:\s|[A-Za-z]))|(?=-\s)/g)
    .map((part) => part.replace(/^\s*(?:\d+[.)]\s*|[A-Za-z][.)]\s*|[*•-]\s*)/, "").trim())
    .filter(Boolean);
}

function hasExplicitListMarkers(value: string) {
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

type ScriptSegment = { type: "customer" | "internal"; text: string };
type InternalScriptSplit = { content: string; notes: string[]; segments: ScriptSegment[] };

function isStandaloneInternalScriptNote(value: string) {
  const line = value.trim();
  return line.length > 2 && ((line.startsWith("(") && line.endsWith(")")) || (line.startsWith("[") && line.endsWith("]")));
}

function isLikelyInternalScriptNote(value: string) {
  const text = value.replace(/^[([]\s*/, "").replace(/[)\]]\s*$/, "").trim();
  return /(?:pelanggan|user|customer)\s+menjawab|agent\s+(?:membuat|melakukan|menunggu)|jika\s+email|email\s+terdaftar/i.test(text);
}

function splitInternalScriptNotes(value: string): InternalScriptSplit {
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
// Only split inline list markers when they are not embedded in an email, URL, version, or word.
// This prevents `mail1.akuredi.com` from becoming several artificial script points.
const stableInlineScriptMarkerPattern = /(?=(?:(?<![A-Za-z0-9_@])(?:\d+|[A-Za-z])[.)]\s+|(?<![A-Za-z0-9_@])[-*\u2022]\s+|(?<![A-Za-z0-9_@])\u00e2\u20ac\u00a2\s+|(?<![A-Za-z0-9_@])[\u2460-\u2473]))/;

function preserveScriptWordCase(match: string, replacement: string) {
  if (match === match.toUpperCase()) return replacement.toUpperCase();
  if (match[0] === match[0].toUpperCase()) return replacement[0].toUpperCase() + replacement.slice(1);
  return replacement;
}

function normalizeScriptLine(value: string) {
  const compact = value
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    // Keep email/domain dots intact; only add spacing after sentence punctuation
    // that cannot be part of an address.
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

function isUserReplyMarker(value: string) {
  return /^\s*[([]?\s*\.{0,3}\s*(?:pelanggan|user|customer)\s+menjawab\s*\.{0,3}\s*[)\]]?\s*$/i.test(value);
}

function stripStableScriptMarker(value: string) {
  return value.replace(/^\s*(?:(?:\d+|[A-Za-z])[.)]\s+|[-*\u2022]\s+|\u00e2\u20ac\u00a2\s+|[\u2460-\u2473]\s*)/, "").trim();
}

function splitStableScriptContent(value: string) {
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

function formatScriptForCopy(value: string) {
  const separated = splitInternalScriptNotes(value);
  const content = splitStableScriptContent(separated.content);
  const points = content.points.map(normalizeScriptLine).filter(Boolean);
  if (!points.length) return normalizeScriptLine(separated.content);
  const body = content.numbered && points.length > 1
    ? points.map((point, index) => `${index + 1}. ${point}`).join("\n")
    : points.join("\n");
  return [content.intro, body].filter(Boolean).join("\n").trim();
}

function withoutDuplicateTitle(title: string, value: string) {
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

function repairImportedTitle(title: string, condition: string) {
  const first = condition.replace(/\r\n?/g, "\n").split(/\n+/).map(normalizeScriptLine).find(Boolean) ?? "";
  if (!first || !title) return title;
  const normalize = (text: string) => text.replace(/\s+/g, " ").trim().toLocaleLowerCase("id-ID");
  if (normalize(first) === normalize(title) || !normalize(first).startsWith(normalize(title))) return title;
  const remainder = first.slice(title.length).trimStart();
  // Existing imports could cut a title in the middle of a word ("ata" + "u").
  // Rebuild those records from the original condition without changing normal titles.
  return /^[A-Za-zÀ-ÿ]/.test(remainder) ? first : title;
}

function prepareGuideForDisplay(sourceGuide: Guide) {
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

function GuideText({ value, className = "" }: { value: string; className?: string }) {
  const lines = value.replace(/\r/g, "").split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return null;
  const isConditionBlock = className.includes("condition-points");
  return <div className={`guide-text ${className} ${isConditionBlock ? "condition-highlights" : ""}`}>{lines.map((line, index) => <p className={isConditionBlock && /\b(?:user\s+share\s+password|usp|account\s+take\s+over|ato|penipuan\s+virtual\s+account|pemalsuan\s+akun|kondisi\s+tidak\s+jelas)\b/i.test(line) ? "condition-keyword" : undefined} key={`${line}-${index}`}>{line}</p>)}</div>;
}

function GuideImageCard({ image, index }: { image: GuideImage; index: number }) {
  const [mode, setMode] = useState<"proxy" | "source" | "failed">("proxy");
  const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(image.url)}`;
  const src = mode === "proxy" ? proxyUrl : image.url;
  return <figure className="guide-image-card"><div className="guide-image-frame">{mode === "failed" ? <div className="guide-image-fallback"><span>Gambar tidak dapat dimuat otomatis.</span><a href={image.url} target="_blank" rel="noreferrer">Buka sumber gambar</a></div> : <img src={src} alt={image.label || `Screenshot ${index + 1}`} loading="eager" decoding="async" onError={() => setMode((current) => current === "proxy" ? "source" : "failed")} />}</div><figcaption>{image.label || `Screenshot ${index + 1}`}</figcaption></figure>;
}

function GuideImageGallery({ images }: { images?: GuideImage[] }) {
  if (!images?.length) return null;
  return <section className="guide-images"><div className="guide-images-heading"><div><strong>Screenshot pendukung</strong><span>Gambar ditampilkan langsung dari pedoman.</span></div><em>{images.length} gambar</em></div><div className="guide-image-stack">{images.map((image, index) => <GuideImageCard key={`${image.url}-${index}`} image={image} index={index} />)}</div></section>;
}

function ConditionSummary({ value }: { value: string }) {
  const points = splitGuidePoints(value);
  const visiblePoints = points.slice(0, 2);
  if (!visiblePoints.length) return null;
  const numbered = points.length > 1 && hasExplicitListMarkers(value);
  return <div className="condition-summary">{visiblePoints.map((point, index) => <p key={`${point}-${index}`}>{numbered && <span>{String(index + 1).padStart(2, "0")}</span>}{point}</p>)}{points.length > visiblePoints.length && <small>+{points.length - visiblePoints.length} poin lainnya</small>}</div>;
}

function ScriptLine({ value }: { value: string }) {
  return <p className={isUserReplyMarker(value) ? "script-user-reply" : undefined}>{value}</p>;
}

function InternalScriptNotes({ notes }: { notes: string[] }) {
  if (!notes.length) return null;
  return <aside className="script-internal-notes"><div><strong>Langkah internal</strong><span>Tidak ikut disalin ke pelanggan</span></div>{notes.map((note, index) => <p key={`${note}-${index}`}>{note.replace(/^[([]\s*/, "").replace(/[)\]]\s*$/, "")}</p>)}</aside>;
}

function CopySegmentButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const text = formatScriptForCopy(value);
    if (!text) return;
    await navigator.clipboard?.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };
  return <button className="script-segment-copy" onClick={() => void copy()}>{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? "Tersalin" : "Salin bagian"}</button>;
}

function ScriptMessageContent({ value }: { value: string }) {
  const { intro, points, numbered } = splitStableScriptContent(value);
  const introLines = intro.split(/\n+/).map(normalizeScriptLine).filter(Boolean);
  return <>{introLines.length > 0 && <div className="script-intro">{introLines.map((line, index) => <ScriptLine key={`${line}-${index}`} value={line} />)}</div>}{numbered && points.length > 1 ? <div className="guide-points script-list">{points.map((point, index) => <div key={`${point}-${index}`}><span>{index + 1}.</span><ScriptLine value={point} /></div>)}</div> : points.map((point, index) => <ScriptLine key={`${point}-${index}`} value={point} />)}</>;
}

function ScriptPointList({ value }: { value: string }) {
  const separated = splitInternalScriptNotes(value);
  const segmented = separated.segments.length > 1;
  return <div className={`script-points ${segmented ? "script-segment-list" : ""}`}>{separated.segments.map((segment, index) => segment.type === "internal" ? <InternalScriptNotes key={`${segment.text}-${index}`} notes={[segment.text]} /> : <div className={segmented ? "script-message-block" : ""} key={`${segment.text}-${index}`}><ScriptMessageContent value={segment.text} />{segmented && <CopySegmentButton value={segment.text} />}</div>)}</div>;
}

function GuidePointList({ value, className = "" }: { value: string; className?: string }) {
  if (className.includes("script-points")) return <ScriptPointList value={value} />;
  const separated = splitInternalScriptNotes(value);
  const points = splitGuidePoints(separated.content);
  if (!points.length) return <InternalScriptNotes notes={separated.notes} />;
  const numbered = points.length > 1 && hasExplicitListMarkers(separated.content);
  if (!numbered) return <div className={className}><GuideText value={separated.content} /><InternalScriptNotes notes={separated.notes} /></div>;
  return <div className={`guide-points ${className}`}>{points.map((point, index) => <div className={numbered ? "" : "single"} key={`${point}-${index}`}>{numbered && <span>{String(index + 1).padStart(2, "0")}</span>}<p>{point}</p></div>)}<InternalScriptNotes notes={separated.notes} /></div>;
}

function CompactSection({ step, title, detail, children, className = "" }: { step: string; title: string; detail: string; children: ReactNode; className?: string }) {
  return <details className={`guide-panel compact-section ${className}`}><summary className="compact-section-summary"><span className="compact-section-step">{step}</span><span className="compact-section-copy"><strong>{title}</strong><small>{detail}</small></span><span className="compact-section-toggle">+</span></summary><div className="compact-section-body">{children}</div></details>;
}

function OutcomeProcess({ outcome }: { outcome: ScenarioOutcome }) {
  if (outcome.type === "reference") {
    return <div className="crm-box reference-followup"><strong>Urutan penanganan</strong><p>{outcome.crmProcess}</p></div>;
  }
  return <details className="compact-subsection"><summary><strong>Proses CRM</strong><span>+</span></summary><div className="crm-box"><strong>{outcome.ticketStatus}</strong><p>{outcome.crmProcess}</p>{outcome.escalationTeam && <div><span>Tim tujuan</span><strong>{outcome.escalationTeam}</strong></div>}</div></details>;
}

function CompactOutcomePanel({ guide, activeOutcome, onSelectOutcome, step: rawStep }: { guide: Guide; activeOutcome?: ScenarioOutcome; onSelectOutcome: (id: string) => void; step: string }) {
  const step = rawStep === "03" ? "02" : rawStep;
  const focusedSteps = activeOutcome ? Array.from(new Set(escalationStepsForDisplay(activeOutcome, guide))) : [];
  return <section className="guide-panel outcome-panel compact-outcome-panel"><div className="panel-heading"><span>{step}</span><div><h2>Hasil penanganan</h2><p>Pilih hasil sesuai kondisi pelanggan.</p></div></div><div className="outcome-tabs">{guide.outcomes.map((outcome, index) => <button key={`${outcome.id}-${index}`} className={`${outcomeTone(outcome.type)} ${outcome.id === activeOutcome?.id ? "active" : ""}`} onClick={() => onSelectOutcome(outcome.id)}><span>{outcomeLabel(outcome.type)}</span><small>{outcome.decision}</small></button>)}</div>{activeOutcome && <div className="outcome-content"><div className="outcome-rule"><strong>{outcomeLabel(activeOutcome.type)}</strong><p>{activeOutcome.decision}</p></div>{focusedSteps.length > 0 && <details open={activeOutcome.type === "tier_2_3"} className="compact-subsection"><summary><strong>Agent operation</strong><span>+</span></summary><ol>{focusedSteps.map((stepText, index) => <li key={`${stepText}-${index}`}>{stepText}</li>)}</ol></details>}<OutcomeProcess outcome={activeOutcome} /></div>}</section>;
}

function CompactProductGuideDetail({ guide: sourceGuide, onBack }: { guide: Guide; onBack: () => void }) {
  const [copied, setCopied] = useState(false);
  const [outcomeId, setOutcomeId] = useState(defaultOutcomeId(sourceGuide));
  const guide = prepareGuideForDisplay(sourceGuide);
  const activeOutcome = guide.outcomes.find((outcome) => outcome.id === outcomeId) ?? guide.outcomes[0];
  const escalationOutcomes = guide.outcomes.filter((outcome) => outcome.type === "tier_2_3" || outcome.type === "transfer_asi");
  const escalationOnly = escalationOutcomes.length > 0 && !guide.outcomes.some((outcome) => outcome.type === "tier_1");

  async function copyScript() {
    await navigator.clipboard?.writeText(formatScriptForCopy(guide.script));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return <section className="guide-detail"><button className="back-link" onClick={onBack}><ArrowLeft size={15} /> Kembali ke pilihan kondisi</button><div className="guide-path"><span>{guide.product}</span><ChevronRight size={13} /><span>{guide.category}</span><ChevronRight size={13} /><span>{guide.subtype}</span></div><div className="guide-detail-head"><div><h1>{guide.title}</h1><GuideText value={guide.condition} className="condition-points" /></div><span className="published-mark"><CheckCircle2 size={15} /> Published</span></div>{escalationOutcomes.length > 0 && <div className={`escalation-banner ${escalationOnly ? "required" : ""}`}><span className="escalation-mark">!</span><div><strong>{escalationOnly ? "Perlu eskalasi" : "Ada jalur eskalasi"}</strong><p>{escalationOutcomes.map((outcome) => outcomeLabel(outcome.type)).join(" · ")}. Lihat hasil penanganan untuk memastikan syarat dan prosesnya.</p></div></div>}{guide.warning && <div className="guide-warning"><Zap size={17} /><div><strong>Perhatian</strong><p>{guide.warning}</p></div></div>}<div className="guide-flow compact-guide-flow"><section className="guide-panel script-panel"><div className="script-content"><GuidePointList value={guide.script} className="script-points" /></div><div className="script-toolbar"><button onClick={copyScript}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "Tersalin" : "Salin skrip"}</button></div></section><CompactSection step="02" title="Cek / penyelidikan" detail="Buka jika perlu melihat langkah pengecekan lengkap."><ol className="investigation-list">{guide.investigation.map((item) => <li key={item}><Check size={15} />{item}</li>)}</ol></CompactSection><CompactOutcomePanel guide={guide} activeOutcome={activeOutcome} onSelectOutcome={setOutcomeId} step="03" /></div><div className="feedback-row"><span>Apakah pedoman ini membantu?</span><button><CheckCircle2 size={15} /> Membantu</button><button><LifeBuoy size={15} /> Laporkan masalah</button></div></section>;
}

function CompactOperationalGuideDetail({ guide: sourceGuide, onBack }: { guide: Guide; onBack: () => void }) {
  const [copied, setCopied] = useState(false);
  const [outcomeId, setOutcomeId] = useState(defaultOutcomeId(sourceGuide));
  const guide = prepareGuideForDisplay(sourceGuide);
  const isOtherAppContact = guide.sourceType === "other_contact";
  const detailSource = guide.script && !guide.script.toLowerCase().includes("belum diisi") ? guide.script : guide.condition;
  const detailText = [withoutDuplicateTitle(guide.title, detailSource), guide.warning].filter(Boolean).join("\n\n");
  const activeOutcome = guide.outcomes.find((outcome) => outcome.id === outcomeId) ?? guide.outcomes[0];

  async function copyInformation() {
    await navigator.clipboard?.writeText(formatScriptForCopy(detailText));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return <section className="guide-detail operational-guide-detail"><button className="back-link" onClick={onBack}><ArrowLeft size={15} /> Kembali ke Pedoman Operasional</button><div className="guide-path"><span>Pedoman Operasional</span><ChevronRight size={13} /><span>{guide.category}</span><ChevronRight size={13} /><span>{guide.subtype}</span></div><div className="guide-detail-head"><div><span className="eyebrow muted">Kondisi pedoman</span><h1>{guide.title}</h1></div><span className="published-mark"><CheckCircle2 size={15} /> Published</span></div>{guide.warning && <div className="guide-warning"><Zap size={17} /><div><strong>Perhatian</strong><p>{guide.warning}</p></div></div>}<div className="guide-flow compact-guide-flow"><CompactSection step="01" title={isOtherAppContact ? "Informasi kontak" : "Detail pedoman"} detail="Buka untuk melihat informasi lengkap dari sumber."><div className="compact-reference-head"><p>{isOtherAppContact ? "Informasi dari sheet operasional untuk referensi Agent." : "Baca kondisi dan informasi sumber sebelum mengikuti flow."}</p><button onClick={copyInformation}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "Tersalin" : isOtherAppContact ? "Salin informasi" : "Salin isi"}</button></div><GuidePointList value={detailText} className="operational-content-points" /></CompactSection><CompactOutcomePanel guide={guide} activeOutcome={activeOutcome} onSelectOutcome={setOutcomeId} step="02" /></div><div className="feedback-row"><span>Apakah pedoman ini membantu?</span><button><CheckCircle2 size={15} /> Membantu</button><button><LifeBuoy size={15} /> Laporkan masalah</button></div></section>;
}

function CaseBriefSectionHead({ step, title, detail }: { step: string; title: string; detail: string }) {
  return <div className="case-brief-section-head"><span>{step}</span><div><strong>{title}</strong><small>{detail}</small></div></div>;
}

function CaseBriefOutcomePanel({ guide, activeOutcome, onSelectOutcome }: { guide: Guide; activeOutcome?: ScenarioOutcome; onSelectOutcome: (id: string) => void }) {
  const focusedSteps = activeOutcome ? Array.from(new Set(escalationStepsForDisplay(activeOutcome, guide))) : [];
  return <section className="case-brief-section case-brief-outcome"><CaseBriefSectionHead step="03" title="Hasil penanganan" detail={guide.outcomes.length > 1 ? "Pilih jalur sesuai kondisi pelanggan." : "Jalur penanganan dari pedoman."} />{guide.outcomes.length > 1 && <div className="case-brief-outcome-tabs">{guide.outcomes.map((outcome, index) => <button type="button" key={`${outcome.id}-${index}`} className={`${outcomeTone(outcome.type)} ${outcome.id === activeOutcome?.id ? "active" : ""}`} onClick={() => onSelectOutcome(outcome.id)}><strong>{outcomeLabel(outcome.type)}</strong><small>{outcome.decision}</small></button>)}</div>}{activeOutcome && <div className="case-brief-outcome-body"><div className={`case-brief-result ${outcomeTone(activeOutcome.type)}`}><strong>{outcomeLabel(activeOutcome.type)}</strong><p>{activeOutcome.decision}</p></div>{focusedSteps.length > 0 && <div className="case-brief-operation"><div><strong>Agent operation</strong><small>Ikuti langkah ini untuk jalur yang dipilih.</small></div><ol>{focusedSteps.map((stepText, index) => <li key={`${stepText}-${index}`}>{stepText}</li>)}</ol></div>}{activeOutcome.type !== "tier_1" && <div className="case-brief-crm"><strong>{activeOutcome.type === "reference" ? "Urutan penanganan" : "Proses CRM"}</strong><p>{activeOutcome.crmProcess}</p>{activeOutcome.type !== "reference" && activeOutcome.ticketStatus && <small>Status tiket: {activeOutcome.ticketStatus}</small>}</div>}</div>}</section>;
}

function CaseBriefProductGuideDetail({ guide: sourceGuide, onBack }: { guide: Guide; onBack: () => void }) {
  const [copied, setCopied] = useState(false);
  const [outcomeId, setOutcomeId] = useState(defaultOutcomeId(sourceGuide));
  const guide = prepareGuideForDisplay(sourceGuide);
  const activeOutcome = guide.outcomes.find((outcome) => outcome.id === outcomeId) ?? guide.outcomes[0];

  async function copyScript() {
    await navigator.clipboard?.writeText(formatScriptForCopy(guide.script));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return <section className="case-brief guide-detail"><button className="back-link" onClick={onBack}><ArrowLeft size={15} /> Kembali ke pilihan kondisi</button><div className="guide-path"><span>{guide.product}</span><ChevronRight size={13} /><span>{guide.category}</span><ChevronRight size={13} /><span>{guide.subtype}</span></div><header className="case-brief-header"><div><span className="eyebrow muted">Kondisi pelanggan</span><h1>{guide.title}</h1></div><span className="published-mark"><CheckCircle2 size={15} /> Published</span></header>{guide.warning && <div className="guide-warning"><Zap size={17} /><div><strong>Perhatian</strong><p>{guide.warning}</p></div></div>}<section className="case-brief-section case-brief-context"><CaseBriefSectionHead step="01" title="Bukti & konteks" detail="Pahami kendala dan lihat bukti sebelum merespons." /><div className="case-brief-condition"><strong>Kondisi pelanggan</strong><GuideText value={guide.condition} className="condition-points" /></div>{guide.images?.length ? <GuideImageGallery images={guide.images} /> : <p className="case-brief-empty">Tidak ada screenshot pada sumber pedoman.</p>}</section><section className="case-brief-section case-brief-script"><div className="case-brief-script-head"><CaseBriefSectionHead step="02" title="Skrip siap kirim" detail="Salin hanya teks yang akan disampaikan kepada pelanggan." /><button type="button" onClick={copyScript}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "Tersalin" : "Salin skrip"}</button></div><div className="case-brief-script-content"><GuidePointList value={guide.script} className="script-points" /></div></section><CaseBriefOutcomePanel guide={guide} activeOutcome={activeOutcome} onSelectOutcome={setOutcomeId} /><div className="feedback-row"><span>Apakah pedoman ini membantu?</span><button><CheckCircle2 size={15} /> Membantu</button><button><LifeBuoy size={15} /> Laporkan masalah</button></div></section>;
}

function CaseBriefOperationalGuideDetail({ guide: sourceGuide, onBack }: { guide: Guide; onBack: () => void }) {
  const [copied, setCopied] = useState(false);
  const [outcomeId, setOutcomeId] = useState(defaultOutcomeId(sourceGuide));
  const guide = prepareGuideForDisplay(sourceGuide);
  const isOtherAppContact = guide.sourceType === "other_contact";
  const detailSource = guide.script && !guide.script.toLowerCase().includes("belum diisi") ? guide.script : guide.condition;
  const detailText = withoutDuplicateTitle(guide.title, detailSource);
  const activeOutcome = guide.outcomes.find((outcome) => outcome.id === outcomeId) ?? guide.outcomes[0];

  async function copyInformation() {
    await navigator.clipboard?.writeText(formatScriptForCopy(detailText));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return <section className="case-brief operational-guide-detail guide-detail"><button className="back-link" onClick={onBack}><ArrowLeft size={15} /> Kembali ke Pedoman Operasional</button><div className="guide-path"><span>Pedoman Operasional</span><ChevronRight size={13} /><span>{guide.category}</span><ChevronRight size={13} /><span>{guide.subtype}</span></div><header className="case-brief-header"><div><span className="eyebrow muted">Kondisi pedoman</span><h1>{guide.title}</h1></div><span className="published-mark"><CheckCircle2 size={15} /> Published</span></header>{guide.warning && <div className="guide-warning"><Zap size={17} /><div><strong>Perhatian</strong><p>{guide.warning}</p></div></div>}<section className="case-brief-section case-brief-context"><CaseBriefSectionHead step="01" title={isOtherAppContact ? "Informasi & bukti" : "Bukti & konteks"} detail="Baca informasi sumber sebelum mengikuti flow." /><div className="case-brief-condition"><strong>{isOtherAppContact ? "Informasi kontak" : "Kondisi pedoman"}</strong><GuideText value={detailText} className="condition-points" /></div>{guide.images?.length ? <GuideImageGallery images={guide.images} /> : null}</section><section className="case-brief-section case-brief-script"><div className="case-brief-script-head"><CaseBriefSectionHead step="02" title={isOtherAppContact ? "Informasi siap disalin" : "Skrip siap kirim"} detail="Salin teks sesuai kebutuhan Agent." /><button type="button" onClick={copyInformation}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "Tersalin" : isOtherAppContact ? "Salin informasi" : "Salin isi"}</button></div>{!isOtherAppContact && <div className="case-brief-script-content"><GuidePointList value={detailText} className="script-points" /></div>}</section><CaseBriefOutcomePanel guide={guide} activeOutcome={activeOutcome} onSelectOutcome={setOutcomeId} /><div className="feedback-row"><span>Apakah pedoman ini membantu?</span><button><CheckCircle2 size={15} /> Membantu</button><button><LifeBuoy size={15} /> Laporkan masalah</button></div></section>;
}

function GuideDetail({ guide, onBack }: { guide: Guide; onBack: () => void }) {
  return guide.product === "Pedoman Operasional"
    ? <CaseBriefOperationalGuideDetail guide={guide} onBack={onBack} />
    : <CaseBriefProductGuideDetail guide={guide} onBack={onBack} />;
}

function OperationalGuideDetail({ guide: sourceGuide, onBack }: { guide: Guide; onBack: () => void }) {
  const [copied, setCopied] = useState(false);
  const [outcomeId, setOutcomeId] = useState(defaultOutcomeId(sourceGuide));
  const preparedGuide = prepareGuideForDisplay(sourceGuide);
  const isOtherAppContact = preparedGuide.sourceType === "other_contact";
  const detailSource = preparedGuide.script && !preparedGuide.script.toLowerCase().includes("belum diisi") ? preparedGuide.script : preparedGuide.condition;
  const detailText = [withoutDuplicateTitle(preparedGuide.title, detailSource), preparedGuide.warning].filter(Boolean).join("\n\n");
  const guide = { ...preparedGuide, condition: "", warning: undefined };
  const activeOutcome = guide.outcomes.find((outcome) => outcome.id === outcomeId) ?? guide.outcomes[0];

  async function copyInformation() {
    await navigator.clipboard?.writeText(formatScriptForCopy(detailText));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return <section className="guide-detail operational-guide-detail"><button className="back-link" onClick={onBack}><ArrowLeft size={15} /> Kembali ke Pedoman Operasional</button><div className="guide-path"><span>Pedoman Operasional</span><ChevronRight size={13} /><span>{guide.category}</span><ChevronRight size={13} /><span>{guide.subtype}</span></div><div className="guide-detail-head"><div><span className="eyebrow muted">Kondisi pedoman</span><h1>{guide.title}</h1><GuideText value={guide.condition} className="condition-points" /></div><span className="published-mark"><CheckCircle2 size={15} /> Published</span></div>{guide.warning && <div className="guide-warning"><Zap size={17} /><div><strong>Perhatian</strong><p>{guide.warning}</p></div></div>}<div className="guide-flow"><section className="guide-panel operational-reference-panel"><div className="panel-heading"><span>01</span><div><h2>{isOtherAppContact ? "Informasi kontak" : "Isi pedoman"}</h2><p>{isOtherAppContact ? "Informasi dari sheet operasional untuk referensi Agent." : "Baca kondisi dan informasi sumber sebelum mengikuti flow."}</p></div><button onClick={copyInformation}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "Tersalin" : isOtherAppContact ? "Salin informasi" : "Salin isi"}</button></div><GuidePointList value={detailText} className="operational-content-points" /></section><OperationalFlowPanel guide={guide} activeOutcome={activeOutcome} onSelectOutcome={setOutcomeId} /></div><div className="feedback-row"><span>Apakah pedoman ini membantu?</span><button><CheckCircle2 size={15} /> Membantu</button><button><LifeBuoy size={15} /> Laporkan masalah</button></div></section>;
}

function OperationalFlowPanel({ guide, activeOutcome, onSelectOutcome }: { guide: Guide; activeOutcome?: ScenarioOutcome; onSelectOutcome: (id: string) => void }) {
  const focusedEscalationSteps = activeOutcome ? escalationStepsForDisplay(activeOutcome, guide) : [];
  return <section className="guide-panel outcome-panel operational-flow-panel"><div className="panel-heading"><span>02</span><div><h2>Flow operasional</h2><p>Ikuti hasil penanganan sesuai kondisi.</p></div></div><div className="outcome-tabs">{guide.outcomes.map((outcome) => <button key={outcome.id} className={`${outcomeTone(outcome.type)} ${outcome.id === activeOutcome?.id ? "active" : ""}`} onClick={() => onSelectOutcome(outcome.id)}><span>{outcomeLabel(outcome.type)}</span><small>{outcome.decision}</small></button>)}</div>{activeOutcome && <div className="outcome-content"><div className="outcome-rule"><strong>Kapan dipilih</strong><p>{activeOutcome.decision}</p></div><div className="outcome-grid">{focusedEscalationSteps.length > 0 && <div><strong>Agent operation</strong><ol>{focusedEscalationSteps.map((step) => <li key={step}>{step}</li>)}</ol></div>}<OutcomeProcess outcome={activeOutcome} /></div></div>}</section>;
}

function ProductGuideDetail({ guide: sourceGuide, onBack }: { guide: Guide; onBack: () => void }) {
  const [copied, setCopied] = useState(false);
  const [outcomeId, setOutcomeId] = useState(defaultOutcomeId(sourceGuide));
  const guide = prepareGuideForDisplay(sourceGuide);
  const activeOutcome = guide.outcomes.find((outcome) => outcome.id === outcomeId) ?? guide.outcomes[0];
  const focusedEscalationSteps = activeOutcome ? escalationStepsForDisplay(activeOutcome, guide) : [];
  const escalationOutcomes = guide.outcomes.filter((outcome) => outcome.type === "tier_2_3" || outcome.type === "transfer_asi");
  const escalationOnly = escalationOutcomes.length > 0 && !guide.outcomes.some((outcome) => outcome.type === "tier_1");
  async function copyScript() {
    await navigator.clipboard?.writeText(formatScriptForCopy(guide.script));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return <section className="guide-detail"><button className="back-link" onClick={onBack}><ArrowLeft size={15} /> Kembali ke pilihan kondisi</button><div className="guide-path"><span>{guide.product}</span><ChevronRight size={13} /><span>{guide.category}</span><ChevronRight size={13} /><span>{guide.subtype}</span></div><div className="guide-detail-head"><div><h1>{guide.title}</h1><GuideText value={guide.condition} className="condition-points" /></div><span className="published-mark"><CheckCircle2 size={15} /> Published</span></div>{escalationOutcomes.length > 0 && <div className={`escalation-banner ${escalationOnly ? "required" : ""}`}><span className="escalation-mark">!</span><div><strong>{escalationOnly ? "Perlu eskalasi" : "Ada jalur eskalasi"}</strong><p>{escalationOutcomes.map((outcome) => outcomeLabel(outcome.type)).join(" · ")}. Lihat hasil penanganan untuk memastikan syarat dan prosesnya.</p></div></div>}{guide.warning && <div className="guide-warning"><Zap size={17} /><div><strong>Perhatian</strong><p>{guide.warning}</p></div></div>}<div className="guide-flow"><section className="guide-panel investigation-panel"><div className="panel-heading"><span>01</span><div><h2>Cek / penyelidikan</h2><p>Lakukan pengecekan ini sebelum menentukan hasil penanganan.</p></div></div><ol>{guide.investigation.map((item) => <li key={item}><Check size={15} />{item}</li>)}</ol></section><section className="guide-panel script-panel"><div className="script-content"><GuidePointList value={guide.script} className="script-points" /></div><div className="script-toolbar"><button onClick={copyScript}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "Tersalin" : "Salin skrip"}</button></div></section><section className="guide-panel outcome-panel"><div className="panel-heading"><span>03</span><div><h2>Tentukan hasil penanganan</h2><p>Tier adalah hasil dari kondisi yang sama, bukan pedoman yang berbeda.</p></div></div><div className="outcome-tabs">{guide.outcomes.map((outcome) => <button key={outcome.id} className={`${outcomeTone(outcome.type)} ${outcome.id === activeOutcome?.id ? "active" : ""}`} onClick={() => setOutcomeId(outcome.id)}><span>{outcomeLabel(outcome.type)}</span><small>{outcome.decision}</small></button>)}</div>{activeOutcome && <div className="outcome-content"><div className="outcome-rule"><strong>Kapan dipilih</strong><p>{activeOutcome.decision}</p></div><div className="outcome-grid">{focusedEscalationSteps.length > 0 && <div><strong>Pilihan tindakan</strong><ol>{focusedEscalationSteps.map((step) => <li key={step}>{step}</li>)}</ol></div>}<OutcomeProcess outcome={activeOutcome} /></div></div>}</section></div><div className="feedback-row"><span>Apakah pedoman ini membantu?</span><button><CheckCircle2 size={15} /> Membantu</button><button><LifeBuoy size={15} /> Laporkan masalah</button></div></section>;
}

void OperationalGuideDetail;
void ProductGuideDetail;
void CompactProductGuideDetail;
void CompactOperationalGuideDetail;

function SearchView({ query, setQuery, results, onSearch, onBack, onOpenGuide }: { query: string; setQuery: (value: string) => void; results: Guide[]; onSearch: (event: FormEvent<HTMLFormElement>) => void; onBack: () => void; onOpenGuide: (guide: Guide) => void }) {
  return <section className="search-page-v4"><button className="back-link" onClick={onBack}><ArrowLeft size={15} /> Kembali ke beranda</button><span className="eyebrow muted">Jalur cadangan</span><h1>Cari pedoman</h1><p>Gunakan kata pelanggan jika produk atau kategorinya belum jelas.</p><form onSubmit={onSearch} className="search-form-v4"><Search size={19} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Contoh: QRIS gagal, tagihan belum masuk, limit..." /><button type="submit">Cari</button></form><div className="search-count"><strong>{results.length}</strong> pedoman ditemukan</div><div className="search-result-list">{results.map((guide) => <button key={guide.id} onClick={() => onOpenGuide(guide)}><span className="search-result-marker"><BookOpen size={15} /></span><div><strong>{guide.title}</strong><ConditionSummary value={guide.condition} /><small>{guide.product} · {guide.category} · {guide.subtype}</small></div><ChevronRight size={17} /></button>)}</div></section>;
}

void SearchView;

const SearchResultList = memo(function SearchResultList({ query, results, onOpenGuide }: { query: string; results: Guide[]; onOpenGuide: (guide: Guide) => void }) {
  const visibleResults = results.slice(0, SEARCH_RESULT_LIMIT);
  return <div className="search-result-list">{visibleResults.map((guide) => <button key={guide.id} onClick={() => onOpenGuide(guide)}><span className="search-result-marker"><BookOpen size={15} /></span><div><strong>{highlightText(guide.title, query)}</strong><p>{highlightText(guide.condition, query)}</p><small>{highlightText(guide.product + " · " + guide.category + " · " + guide.subtype, query)}</small></div><ChevronRight size={17} /></button>)}</div>;
});

function SearchViewLive({ query, results, isPending, onBack, onOpenGuide }: { query: string; results: Guide[]; isPending: boolean; onBack: () => void; onOpenGuide: (guide: Guide) => void }) {
  return <section className="search-page-v4"><button className="back-link" onClick={onBack}><ArrowLeft size={15} /> Kembali ke beranda</button><span className="eyebrow muted">Pencarian global</span><h1>Hasil pencarian</h1><p>Gunakan satu kolom pencarian global di header untuk menemukan pedoman.</p><div className="search-count">{isPending ? <span className="search-pending">Menyesuaikan hasil...</span> : <><strong>{results.length}</strong> pedoman ditemukan{query.trim() ? ` untuk “${query}”` : ""}</>}</div><SearchResultList query={query} results={results} onOpenGuide={onOpenGuide} />{!isPending && results.length > SEARCH_RESULT_LIMIT && <p className="search-result-limit">Menampilkan {SEARCH_RESULT_LIMIT} hasil pertama. Tambahkan kata kunci agar hasil lebih spesifik.</p>}</section>;
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="empty-state-v4"><FileSpreadsheet size={25} /><strong>{title}</strong><p>{detail}</p></div>;
}

function LoadingState({ detail }: { detail: string }) {
  return <div className="empty-state-v4 loading-state"><Zap size={25} className="spin" /><strong>Memuat pedoman...</strong><p>{detail}</p></div>;
}

function AdminConsole({ importedGuides, importSummary, onImport, onSignOut }: { importedGuides: Guide[]; importSummary: ImportSummary | null; onImport: (result: ImportResult) => Promise<void>; onSignOut: () => void }) {
  const [view, setView] = useState<AdminView>("content");
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState("");
  const displayGuides = [...importedGuides, ...guides, ...operationalGuides];
  const importedOutcomes = importedGuides.flatMap((guide) => guide.outcomes);
  const activeScenarioCount = importSummary?.scenarios ?? displayGuides.length;
  const tier1Count = importSummary ? importedOutcomes.filter((outcome) => outcome.type === "tier_1").length : guides.flatMap((guide) => guide.outcomes).filter((outcome) => outcome.type === "tier_1").length;
  const escalationCount = importSummary ? importedOutcomes.filter((outcome) => outcome.type === "tier_2_3").length : guides.flatMap((guide) => guide.outcomes).filter((outcome) => outcome.type === "tier_2_3").length;

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsParsing(true);
    setError("");
    try {
      setPreview(await parseExcelFile(file));
    } catch (parseError) {
      setPreview(null);
      setError(parseError instanceof Error ? parseError.message : "File Excel tidak dapat dibaca.");
    } finally {
      setIsParsing(false);
      event.target.value = "";
    }
  }

  async function confirmImport() {
    if (!preview) return;
    setError("");
    try {
      await onImport(preview);
      setPreview(null);
      setView("review");
    } catch (saveError) {
      const message = saveError instanceof Error
        ? saveError.message
        : typeof saveError === "object" && saveError !== null && "message" in saveError
          ? String((saveError as { message?: unknown }).message ?? "")
          : "";
      setError(message ? `Staging lokal tersimpan, tetapi database gagal: ${message}` : "Staging lokal tersimpan, tetapi database gagal menerima data.");
    } finally {
    }
  }

  return <main className="admin-app"><header className="admin-topbar"><div className="agent-brand"><span className="brand-mark"><KoraMark size={19} /></span><span className="brand-lockup"><strong>KORA</strong><span>Knowledge Operations &amp; Resolution Access</span></span><em>Admin KM</em></div><button className="icon-button" onClick={onSignOut} aria-label="Keluar"><LogOut size={17} /></button></header><div className="admin-layout"><aside><button className={view === "content" ? "active" : ""} onClick={() => setView("content")}><Database size={16} />Skenario</button><button className={view === "import" ? "active" : ""} onClick={() => setView("import")}><Upload size={16} />Import Excel</button><button className={view === "review" ? "active" : ""} onClick={() => setView("review")}><ClipboardCheck size={16} />Catatan import</button></aside><section className="admin-content-v4">
    {view === "content" && <><span className="eyebrow muted">Knowledge Management</span><h1>Kelola Skenario</h1><p>Satu kondisi pelanggan memiliki satu pedoman dan dapat mempunyai beberapa opsi penanganan.</p><div className="scenario-summary"><div><span>Scenario aktif</span><strong>{activeScenarioCount.toLocaleString("id-ID")}</strong></div><div><span>Selesai Tier 1</span><strong>{tier1Count.toLocaleString("id-ID")}</strong></div><div><span>Eskalasi ke Tier 2/3</span><strong>{escalationCount.toLocaleString("id-ID")}</strong></div></div>{importSummary && <div className="import-status-line"><CheckCircle2 size={15} /><span>Import terakhir: <strong>{importSummary.fileName}</strong> · {importSummary.scenarios.toLocaleString("id-ID")} Scenario tersimpan sebagai staging</span></div>}<div className="scenario-table">{displayGuides.slice(0, 80).map((guide) => <div key={guide.id}><div><strong>{guide.title}</strong><small>{guide.product} · {guide.category} · {guide.subtype}</small></div><span>{guide.outcomes.length} opsi penanganan</span><button>Edit <ChevronRight size={14} /></button></div>)}</div>{displayGuides.length > 80 && <p className="table-more">Menampilkan 80 dari {displayGuides.length.toLocaleString("id-ID")} Scenario. Gunakan pencarian pada tahap berikutnya untuk menemukan pedoman tertentu.</p>}</>}
    {view === "import" && <><span className="eyebrow muted">Bulk import</span><h1>Import Scenario dari Excel</h1><p>Pilih workbook pedoman. Sistem membaca sheet produk dan aturan khusus, melewati produk arsip, lalu menyiapkan snapshot terbaru.</p><label className={`import-drop-v4 ${preview ? "ready" : ""}`} htmlFor="excel-import-input">{isParsing ? <Zap size={26} className="spin" /> : preview ? <CheckCircle2 size={26} /> : <Upload size={26} />}<strong>{isParsing ? "Sedang membaca workbook..." : preview ? `${preview.summary.fileName} siap direview` : "Klik untuk memilih file Excel"}</strong><span>{preview ? "Data akan langsung dipublikasikan; catatan hanya sebagai informasi." : "Format .xlsx atau .xls · produk arsip otomatis dilewati."}</span><input id="excel-import-input" className="import-file-input" type="file" accept=".xlsx,.xls" onChange={handleFile} /></label>{error && <div className="import-error"><X size={16} /><span>{error}</span></div>}{preview && <><div className="import-preview-head"><div><span className="eyebrow muted">Preview hasil import</span><h2>{preview.summary.scenarios.toLocaleString("id-ID")} Scenario terdeteksi</h2></div><button className="secondary-button" onClick={() => setPreview(null)}>Pilih file lain</button></div><div className="import-summary-grid"><div><span>Baris sumber</span><strong>{preview.summary.sourceRows.toLocaleString("id-ID")}</strong></div><div><span>Outcome</span><strong>{preview.summary.outcomes.toLocaleString("id-ID")}</strong></div><div><span>Catatan import</span><strong>{preview.summary.reviewCount.toLocaleString("id-ID")}</strong></div><div><span>Duplikat digabung</span><strong>{preview.summary.duplicateRows.toLocaleString("id-ID")}</strong></div></div><ImportQcDashboard report={preview.qc} />{preview.issues.length > 0 && <div className="import-issues"><strong>Catatan import (tidak menghambat publish)</strong>{preview.issues.slice(0, 5).map((issue) => <div key={issue.reason}><span>{issue.reason}</span><b>{issue.count.toLocaleString("id-ID")}</b></div>)}</div>}{preview.summary.skippedSheets.length > 0 && <p className="import-note">Sheet di luar mapping dilewati: {preview.summary.skippedSheets.join(", ")}</p>}<button className="primary-button" onClick={confirmImport}>Simpan dan publikasikan <ArrowRight size={16} /></button></>}</>}
    {view === "review" && <><span className="eyebrow muted">Catatan import</span><h1>Catatan import</h1><p>Catatan dari workbook hanya bersifat informatif karena seluruh pedoman sudah disetujui pemiliknya.</p>{importSummary ? <><div className="review-card-v4"><ClipboardCheck size={21} /><div><strong>{importSummary.reviewCount.toLocaleString("id-ID")} Scenario memiliki catatan import</strong><p>{importSummary.scenarios.toLocaleString("id-ID")} Scenario dari {importSummary.fileName} sudah masuk staging. Catatan ini bersifat informatif; data tetap dapat digunakan.</p></div><button className="primary-button" onClick={() => setView("content")}>Lihat skenario <ArrowRight size={16} /></button></div><div className="review-steps"><span>1</span><div><strong>Informasi sumber</strong><p>Beberapa kolom pada workbook memiliki catatan kelengkapan.</p></div><span>2</span><div><strong>Pedoman tetap aktif</strong><p>Semua scenario tetap Published dan dapat dipakai Agent.</p></div><span>3</span><div><strong>Perbaikan opsional</strong><p>Admin dapat memperbarui kondisi tertentu jika ada update harian.</p></div></div></> : <div className="empty-state-v4"><ClipboardCheck size={25} /><strong>Belum ada hasil import</strong><p>Pilih Import Excel untuk memulai staging workbook.</p><button className="primary-button" onClick={() => setView("import")}>Mulai import <Upload size={15} /></button></div>}</>}
  </section></div></main>;
}

void AdminConsole;

type AdminConsoleV2Props = {
  importedGuides: Guide[];
  importSummary: ImportSummary | null;
  onImport: (result: ImportResult) => Promise<void>;
  onSaveScenario: (guide: Guide, publish: boolean) => Promise<void>;
  onSignOut: () => void;
};

type AdminBrowseArea = "products" | "operational";

type AdminBrowseSelection = {
  area: AdminBrowseArea;
  productId: string | null;
  category: string | null;
  subtype: string | null;
};

function AdminCategoryNavigator({ guides: allGuides, selection, onChange }: { guides: Guide[]; selection: AdminBrowseSelection; onChange: (selection: AdminBrowseSelection) => void }) {
  const selectedProduct = products.find((product) => product.id === selection.productId) ?? null;
  const productMatches = (guide: Guide, product: typeof products[number]) => guide.productId === product.id || guide.product === product.name;
  const productGuideCount = (product: typeof products[number]) => allGuides.filter((guide) => productMatches(guide, product)).length;
  const productCategoryNames = selectedProduct
    ? uniqueTaxonomyLabels([...selectedProduct.categories.map((category) => category.name), ...allGuides.filter((guide) => productMatches(guide, selectedProduct)).map((guide) => guide.category)])
    : [];
  const operationalGuideList = allGuides.filter((guide) => taxonomyKey(guide.product) === taxonomyKey("Pedoman Operasional"));
  const operationalCategoryNames = uniqueTaxonomyLabels([...operationalModules.map((module) => module.name), ...operationalGuideList.map((guide) => guide.category)]);
  const categoryNames = selection.area === "operational" ? operationalCategoryNames : productCategoryNames;
  const selectedCategoryGuides = selection.area === "operational"
    ? operationalGuideList.filter((guide) => taxonomyKey(guide.category) === taxonomyKey(selection.category ?? ""))
    : selectedProduct ? allGuides.filter((guide) => productMatches(guide, selectedProduct) && taxonomyKey(guide.category) === taxonomyKey(selection.category ?? "")) : [];
  const subtypeNames = uniqueTaxonomyLabels(selectedCategoryGuides.map((guide) => guide.subtype));

  function selectArea(area: AdminBrowseArea) {
    onChange({ area, productId: null, category: null, subtype: null });
  }

  return <section className="admin-browser"><div className="admin-browser-head"><div><span className="eyebrow muted">Navigasi pedoman</span><strong>Pilih produk dan kategori</strong><small>Gunakan menu ini untuk membuka kumpulan scenario tanpa mencari satu per satu.</small></div><button className={!selection.productId && !selection.category ? "active" : ""} onClick={() => onChange({ area: selection.area, productId: null, category: null, subtype: null })}>Semua scenario</button></div><div className="admin-browser-tabs"><button className={selection.area === "products" ? "active" : ""} onClick={() => selectArea("products")}>Produk</button><button className={selection.area === "operational" ? "active" : ""} onClick={() => selectArea("operational")}>Pedoman Operasional</button></div>{selection.area === "products" ? <><div className="admin-browser-label"><strong>Produk</strong><span>{products.length} pilihan</span></div><div className="admin-browser-grid products">{products.map((product) => <button key={product.id} className={selection.productId === product.id ? "active" : ""} onClick={() => onChange({ area: "products", productId: product.id, category: null, subtype: null })}><span><strong>{product.shortName}</strong><small>{productGuideCount(product).toLocaleString("id-ID")} scenario</small></span><ChevronRight size={15} /></button>)}</div>{selectedProduct && <><div className="admin-browser-label"><strong>Kategori kendala · {selectedProduct.shortName}</strong><span>{categoryNames.length} pilihan</span></div><div className="admin-browser-grid categories">{categoryNames.map((categoryName) => { const categoryCount = allGuides.filter((guide) => productMatches(guide, selectedProduct) && taxonomyKey(guide.category) === taxonomyKey(categoryName)).length; const category = selectedProduct.categories.find((item) => taxonomyKey(item.name) === taxonomyKey(categoryName)); return <button key={categoryName} className={taxonomyKey(selection.category ?? "") === taxonomyKey(categoryName) ? "active" : ""} onClick={() => onChange({ area: "products", productId: selectedProduct.id, category: categoryName, subtype: null })}><span><strong>{categoryName}</strong><small>{categoryCount.toLocaleString("id-ID")} scenario{category?.description ? ` · ${category.description}` : ""}</small></span><ChevronRight size={15} /></button>; })}</div></>}</> : <><div className="admin-browser-label"><strong>Pedoman Operasional</strong><span>{categoryNames.length} modul</span></div><div className="admin-browser-grid categories">{categoryNames.map((categoryName) => { const operationalModule = operationalModules.find((item) => taxonomyKey(item.name) === taxonomyKey(categoryName)); const categoryCount = operationalGuideList.filter((guide) => taxonomyKey(guide.category) === taxonomyKey(categoryName)).length; return <button key={categoryName} className={taxonomyKey(selection.category ?? "") === taxonomyKey(categoryName) ? "active" : ""} onClick={() => onChange({ area: "operational", productId: null, category: categoryName, subtype: null })}><span><strong>{categoryName}</strong><small>{categoryCount.toLocaleString("id-ID")} scenario{operationalModule?.description ? ` · ${operationalModule.description}` : ""}</small></span><ChevronRight size={15} /></button>; })}</div></>}{selection.category && <><div className="admin-browser-label"><strong>Subkategori / sub tipe tiket · {selection.category}</strong><span>{subtypeNames.length} pilihan</span></div><div className="admin-browser-subtypes"><button className={!selection.subtype ? "active" : ""} onClick={() => onChange({ ...selection, subtype: null })}>Semua sub tipe</button>{subtypeNames.map((subtype) => <button key={subtype} className={selection.subtype === subtype ? "active" : ""} onClick={() => onChange({ ...selection, subtype })}>{subtype}</button>)}</div></>}</section>;
}

function qcStatusText(status: "pass" | "warning" | "error") {
  if (status === "error") return "Perlu diperbaiki";
  if (status === "warning") return "Ada catatan";
  return "Lolos";
}

function qcStatusIcon(status: "pass" | "warning" | "error") {
  if (status === "error" || status === "warning") return <AlertTriangle size={15} />;
  return <CheckCircle2 size={15} />;
}

function ImportQcDashboard({ report }: { report: ImportQcSummary }) {
  const errorCount = report.checks.filter((check) => check.status === "error").length;
  const warningCount = report.checks.filter((check) => check.status === "warning").length;
  const overallStatus = errorCount ? "error" : warningCount ? "warning" : "pass";
  const visibleExceptions = report.exceptions.slice(0, 8);
  return <section className="qc-dashboard" aria-labelledby="qc-import-title">
    <div className="qc-dashboard-head"><div className="qc-dashboard-title"><span className="qc-icon"><ClipboardCheck size={18} /></span><div><strong id="qc-import-title">QC import sebelum publish</strong><p>Periksa cakupan workbook dan alur pedoman sebelum snapshot terbaru disimpan.</p></div></div><span className={`qc-overall ${overallStatus}`}>{qcStatusIcon(overallStatus)}{qcStatusText(overallStatus)}</span></div>
    <div className="qc-check-grid">{report.checks.map((check) => <div className={`qc-check ${check.status}`} key={check.id}><div className="qc-check-top"><span>{qcStatusIcon(check.status)}<strong>{check.label}</strong></span><b>{check.metric}</b></div><p>{check.detail}</p></div>)}</div>
    <div className="qc-metrics"><div><span>Alur pertanyaan–edukasi</span><strong>{report.linkedFlows.toLocaleString("id-ID")}</strong></div><div><span>Referensi belum tersambung</span><strong>{report.standaloneReferences.toLocaleString("id-ID")}</strong></div><div><span>Flow eskalasi Tier 2/3</span><strong>{report.outcomeCounts.tier_2_3.toLocaleString("id-ID")}</strong></div><div><span>Transfer ASI dari F/G</span><strong>{report.escalation.transferFromTier1.toLocaleString("id-ID")}</strong></div></div>
    <details className="qc-detail" open><summary><span>Cakupan tab sumber</span><b>{report.tabs.length} tab</b></summary><div className="qc-tab-list">{report.tabs.map((tab) => <div key={tab.name} className={`qc-tab-row ${tab.status}`}><div><strong>{tab.name}</strong><small>{tab.note}</small></div><span>{tab.status === "mapping" ? "Mapping" : tab.status === "imported" ? `${tab.scenarios.toLocaleString("id-ID")} scenario` : tab.status === "ignored" ? "Dilewati" : "Belum dipetakan"}</span></div>)}</div></details>
    <details className="qc-detail"><summary><span>Pengecualian yang perlu dibuka</span><b>{report.exceptionTotal.toLocaleString("id-ID")}</b></summary>{report.exceptionTotal ? <div className="qc-exception-list">{visibleExceptions.map((item) => <div className={`qc-exception ${item.severity}`} key={item.id}><div><strong>{item.title}</strong><small>{item.reason}</small></div><span>{item.sourceSheet}{item.sourceRow ? ` · baris ${item.sourceRow}` : ""}</span></div>)}{report.exceptionTotal > visibleExceptions.length && <small className="qc-more">Menampilkan {visibleExceptions.length} contoh pertama. Semua catatan tetap tercatat pada hasil QC.</small>}</div> : <p className="qc-empty">Tidak ada pengecualian dari pemeriksaan ini.</p>}</details>
  </section>;
}

function AdminConsoleV2({ importedGuides, importSummary, onImport, onSaveScenario, onSignOut }: AdminConsoleV2Props) {
  const [view, setView] = useState<AdminView>("content");
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearchInput = useDebouncedValue(searchInput, 180);
  const [qcCategory, setQcCategory] = useState("");
  const [qcSort, setQcSort] = useState<AdminScenarioSort>("default");
  const [page, setPage] = useState(1);
  const [editingGuide, setEditingGuide] = useState<Guide | null>(null);
  const [browseSelection, setBrowseSelection] = useState<AdminBrowseSelection>({ area: "products", productId: null, category: null, subtype: null });
  const pageSize = 100;
  const displayGuides = useMemo(() => importedGuides.length ? importedGuides : [...guides, ...operationalGuides], [importedGuides]);
  const browseGuides = useMemo(() => {
    if (browseSelection.area === "operational") {
      return displayGuides.filter((guide) => taxonomyKey(guide.product) === taxonomyKey("Pedoman Operasional") && (!browseSelection.category || taxonomyKey(guide.category) === taxonomyKey(browseSelection.category)) && (!browseSelection.subtype || taxonomyKey(guide.subtype) === taxonomyKey(browseSelection.subtype)));
    }
    if (!browseSelection.productId) return displayGuides;
    const product = products.find((item) => item.id === browseSelection.productId);
    if (!product) return displayGuides;
    return displayGuides.filter((guide) => (guide.productId === product.id || guide.product === product.name) && (!browseSelection.category || taxonomyKey(guide.category) === taxonomyKey(browseSelection.category)) && (!browseSelection.subtype || taxonomyKey(guide.subtype) === taxonomyKey(browseSelection.subtype)));
  }, [browseSelection, displayGuides]);
  const qcCategoryOptions = useMemo(() => uniqueTaxonomyLabels(displayGuides.map((guide) => guide.category)).sort((a, b) => a.localeCompare(b, "id")), [displayGuides]);
  const filteredGuides = useMemo(() => {
    const term = normalizeSearchText(debouncedSearchInput);
    const tokens = term.split(" ").filter(Boolean);
    const candidates = qcCategory ? browseGuides.filter((guide) => taxonomyKey(guide.category) === taxonomyKey(qcCategory)) : browseGuides;
    const searched = !term ? candidates : candidates.filter((guide) => {
      const text = normalizeSearchText([guide.product, guide.category, guide.subtype, guide.title, guide.condition, guide.status, guide.reviewReason].filter(Boolean).join(" "));
      return tokens.every((token) => text.includes(token));
    });
    if (qcSort === "default") return searched;
    return [...searched].sort((a, b) => {
      const sourceSheetCompare = (a.sourceSheet ?? "").localeCompare(b.sourceSheet ?? "", "id");
      if (sourceSheetCompare !== 0) return sourceSheetCompare;
      const aRow = a.sourceRow ?? Number.MAX_SAFE_INTEGER;
      const bRow = b.sourceRow ?? Number.MAX_SAFE_INTEGER;
      return qcSort === "source_asc" ? aRow - bRow : bRow - aRow;
    });
  }, [browseGuides, debouncedSearchInput, qcCategory, qcSort]);
  const totalPages = Math.max(1, Math.ceil(filteredGuides.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visibleGuides = filteredGuides.slice((safePage - 1) * pageSize, safePage * pageSize);
  const reviewGuides = displayGuides.filter((guide) => Boolean(guide.reviewReason) || guide.needsReview || guide.status === "Perlu diperiksa");
  const activeScenarioCount = displayGuides.length;
  const tier1Count = displayGuides.flatMap((guide) => guide.outcomes).filter((outcome) => outcome.type === "tier_1").length;
  const escalationCount = displayGuides.flatMap((guide) => guide.outcomes).filter((outcome) => outcome.type === "tier_2_3").length;
  const qcErrorCount = preview?.qc.checks.filter((check) => check.status === "error").length ?? 0;

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsParsing(true);
    setError("");
    try {
      setPreview(await parseExcelFile(file));
    } catch (parseError) {
      setPreview(null);
      setError(parseError instanceof Error ? parseError.message : "File Excel tidak dapat dibaca.");
    } finally {
      setIsParsing(false);
      event.target.value = "";
    }
  }

  async function confirmImport() {
    if (!preview) return;
    setError("");
    setIsSaving(true);
    try {
      await onImport(preview);
      setPreview(null);
      setView("review");
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : typeof saveError === "object" && saveError !== null && "message" in saveError ? String((saveError as { message?: unknown }).message ?? "") : "";
      setError(message ? "Staging lokal tersimpan, tetapi database gagal: " + message : "Staging lokal tersimpan, tetapi database gagal menerima data.");
    } finally {
      setIsSaving(false);
    }
  }

  return <main className="admin-app"><header className="admin-topbar"><div className="agent-brand"><span className="brand-mark"><KoraMark size={19} /></span><span className="brand-lockup"><strong>KORA</strong><span>Knowledge Operations &amp; Resolution Access</span></span><em>Admin KM</em></div><button className="icon-button" onClick={onSignOut} aria-label="Keluar"><LogOut size={17} /></button></header><div className="admin-layout"><aside><button className={view === "content" && !editingGuide ? "active" : ""} onClick={() => { setEditingGuide(null); setView("content"); }}><Database size={16} />Skenario</button><button className={view === "import" && !editingGuide ? "active" : ""} onClick={() => { setEditingGuide(null); setView("import"); }}><Upload size={16} />Import Excel</button><button className={view === "review" && !editingGuide ? "active" : ""} onClick={() => { setEditingGuide(null); setView("review"); }}><ClipboardCheck size={16} />Catatan import</button></aside><section className="admin-content-v4">{editingGuide ? <ScenarioEditor guide={editingGuide} onCancel={() => setEditingGuide(null)} onSave={async (guide, publish) => { await onSaveScenario(guide, publish); setEditingGuide(null); }} /> : <>{view === "content" && <><span className="eyebrow muted">Knowledge Management</span><h1>Kelola Skenario</h1><p>Satu kondisi pelanggan memiliki satu pedoman. Perubahan dilakukan per kondisi, bukan per seluruh kategori.</p><div className="scenario-summary"><div><span>Scenario aktif</span><strong>{activeScenarioCount.toLocaleString("id-ID")}</strong></div><div><span>Selesai Tier 1</span><strong>{tier1Count.toLocaleString("id-ID")}</strong></div><div><span>Eskalasi ke Tier 2/3</span><strong>{escalationCount.toLocaleString("id-ID")}</strong></div></div>{importSummary && <div className="import-status-line"><CheckCircle2 size={15} /><span>Import terakhir: <strong>{importSummary.fileName}</strong> · {importSummary.scenarios.toLocaleString("id-ID")} scenario menjadi snapshot terbaru</span></div>}<div className="qc-manual-tools"><div className="qc-manual-copy"><ClipboardCheck size={15} /><div><strong>QC manual</strong><small>Cocokkan pedoman dengan baris sumber Excel.</small></div></div><div className="qc-manual-controls"><label><span>Kategori</span><select value={qcCategory} onChange={(event) => { setQcCategory(event.target.value); setPage(1); }}><option value="">Semua kategori</option>{qcCategoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}</select></label><label><span>Urutkan</span><select value={qcSort} onChange={(event) => { setQcSort(event.target.value as AdminScenarioSort); setPage(1); }}><option value="default">Urutan tampilan</option><option value="source_asc">Baris sumber: kecil ke besar</option><option value="source_desc">Baris sumber: besar ke kecil</option></select></label></div></div><AdminCategoryNavigator guides={displayGuides} selection={browseSelection} onChange={(nextSelection) => { setBrowseSelection(nextSelection); setQcCategory(nextSelection.category ?? ""); setSearchInput(""); setPage(1); }} /><div className="scenario-toolbar"><div className="scenario-search"><Search size={16} /><input value={searchInput} onChange={(event) => { setSearchInput(event.target.value); setPage(1); }} placeholder="Ketik kondisi, produk, kategori..." aria-label="Cari scenario" /></div><span>{filteredGuides.length.toLocaleString("id-ID")} scenario ditemukan</span></div><div className="scenario-table">{visibleGuides.map((guide) => <div key={guide.id}><div><strong>{highlightText(guide.title, searchInput)}</strong><small>{highlightText(guide.product + " · " + guide.category + " · " + guide.subtype, searchInput)}</small></div><span className={"scenario-status " + (guide.status === "Published" ? "published" : guide.status === "Perlu diperiksa" ? "review" : "draft")}>{guide.status}</span>{guide.sourceRow ? <span className="scenario-source-row">Baris {guide.sourceRow}</span> : null}<button onClick={() => { setEditingGuide(guide); setError(""); }}>Edit <ChevronRight size={14} /></button></div>)}</div>{visibleGuides.length === 0 && <div className="admin-empty">Tidak ada scenario yang cocok dengan pencarian.</div>}<div className="scenario-pagination"><span>Menampilkan {filteredGuides.length ? ((safePage - 1) * pageSize) + 1 : 0}–{Math.min(safePage * pageSize, filteredGuides.length)} dari {filteredGuides.length.toLocaleString("id-ID")} · 100 per halaman</span><div><button disabled={safePage === 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Sebelumnya</button><strong>Halaman {safePage} dari {totalPages}</strong><button disabled={safePage === totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Berikutnya</button></div></div></>}{view === "import" && <><span className="eyebrow muted">Bulk import</span><h1>Import Scenario dari Excel</h1><p>Pilih workbook pedoman. Data dari workbook akan langsung Published; catatan kelengkapan hanya sebagai informasi.</p><label className={"import-drop-v4 " + (preview ? "ready" : "")} htmlFor="excel-import-input">{isParsing ? <Zap size={26} className="spin" /> : preview ? <CheckCircle2 size={26} /> : <Upload size={26} />}<strong>{isParsing ? "Sedang membaca workbook..." : preview ? preview.summary.fileName + " siap direview" : "Klik untuk memilih file Excel"}</strong><span>{preview ? "Data dari workbook akan langsung Published; catatan kelengkapan hanya sebagai informasi." : "Format .xlsx or .xls · produk arsip otomatis dilewati."}</span><input id="excel-import-input" className="import-file-input" type="file" accept=".xlsx,.xls" onChange={handleFile} /></label>{error && <div className="import-error"><X size={16} /><span>{error}</span></div>}{preview && <><div className="import-preview-head"><div><span className="eyebrow muted">Preview hasil import</span><h2>{preview.summary.scenarios.toLocaleString("id-ID")} scenario terdeteksi</h2></div><button className="secondary-button" onClick={() => setPreview(null)}>Pilih file lain</button></div><div className="import-summary-grid"><div><span>Baris sumber</span><strong>{preview.summary.sourceRows.toLocaleString("id-ID")}</strong></div><div><span>Hasil penanganan</span><strong>{preview.summary.outcomes.toLocaleString("id-ID")}</strong></div><div><span>Catatan import</span><strong>{preview.summary.reviewCount.toLocaleString("id-ID")}</strong></div><div><span>Duplikat digabung</span><strong>{preview.summary.duplicateRows.toLocaleString("id-ID")}</strong></div></div><ImportQcDashboard report={preview.qc} />{preview.issues.length > 0 && <div className="import-issues"><strong>Catatan import (tidak menghambat publish)</strong>{preview.issues.slice(0, 5).map((issue) => <div key={issue.reason}><span>{issue.reason}</span><b>{issue.count.toLocaleString("id-ID")}</b></div>)}</div>}{preview.summary.skippedSheets.length > 0 && <p className="import-note">Sheet di luar mapping dilewati: {preview.summary.skippedSheets.join(", ")}</p>}<button className="primary-button" onClick={confirmImport} disabled={isSaving || qcErrorCount > 0}>{isSaving ? "Sedang menyimpan ke database..." : qcErrorCount ? "Perbaiki QC sebelum publish" : "Simpan snapshot terbaru"} <ArrowRight size={16} /></button></>}</>}{view === "review" && <><span className="eyebrow muted">Catatan import</span><h1>Catatan import</h1><p>{reviewGuides.length.toLocaleString("id-ID")} scenario memiliki catatan dari sumber (tidak menghambat publish).</p>{reviewGuides.length ? <div className="admin-review-list">{reviewGuides.slice(0, 100).map((guide) => <button key={guide.id} className="admin-review-item" onClick={() => { setEditingGuide(guide); setError(""); }}><div><strong>{guide.title}</strong><small>{guide.reviewReason || "Catatan dari sumber; perbaikan bersifat opsional."}</small></div><ChevronRight size={17} /></button>)}</div> : <div className="empty-state-v4"><ClipboardCheck size={25} /><strong>Belum ada catatan import</strong><p>Import berikutnya akan menampilkan catatan sumber di halaman ini.</p></div>}</>}</>}</section></div></main>;
}

const outcomeTypes: OutcomeType[] = ["tier_1", "tier_2_3", "transfer_asi", "reference"];

function cloneGuide(guide: Guide): Guide {
  return { ...guide, investigation: [...guide.investigation], outcomes: guide.outcomes.map((outcome) => ({ ...outcome, agentSteps: [...outcome.agentSteps] })) };
}

function textToList(value: string) {
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

function listToText(value: string[]) {
  return value.join("\n");
}

function validateForPublish(guide: Guide) {
  const errors: string[] = [];
  if (!guide.title.trim()) errors.push("Judul kondisi belum diisi.");
  if (!guide.condition.trim()) errors.push("Kondisi pelanggan belum diisi.");
  if (!guide.script.trim() || guide.script.toLowerCase().includes("belum diisi")) errors.push("Skrip Live Chat belum lengkap.");
  if (!guide.outcomes.length) errors.push("Tambahkan minimal satu hasil penanganan.");
  guide.outcomes.forEach((outcome, index) => {
    if (!outcome.decision.trim()) errors.push("Opsi " + (index + 1) + ": kapan dipilih belum diisi.");
    if (!outcome.agentSteps.length) errors.push("Opsi " + (index + 1) + ": langkah agent belum diisi.");
    if (!outcome.ticketStatus.trim()) errors.push("Opsi " + (index + 1) + ": status tiket belum diisi.");
    if (!outcome.crmProcess.trim()) errors.push("Opsi " + (index + 1) + ": proses CRM belum diisi.");
  });
  if (new Set(guide.outcomes.map((outcome) => outcome.type)).size !== guide.outcomes.length) errors.push("Satu jenis hasil penanganan hanya boleh dipakai satu kali.");
  return errors;
}

function ScenarioEditor({ guide, onCancel, onSave }: { guide: Guide; onCancel: () => void; onSave: (guide: Guide, publish: boolean) => Promise<void> }) {
  const [draft, setDraft] = useState(() => cloneGuide(guide));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function updateDraft(patch: Partial<Guide>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function updateOutcome(index: number, patch: Partial<Guide["outcomes"][number]>) {
    setDraft((current) => ({ ...current, outcomes: current.outcomes.map((outcome, outcomeIndex) => outcomeIndex === index ? { ...outcome, ...patch } : outcome) }));
  }

  function addOutcome() {
    const nextType = outcomeTypes.find((type) => !draft.outcomes.some((outcome) => outcome.type === type));
    if (!nextType) {
      setError("Semua jenis hasil penanganan sudah tersedia.");
      return;
    }
    setDraft((current) => ({ ...current, outcomes: [...current.outcomes, { id: "draft-" + Date.now(), type: nextType, decision: "", agentSteps: [], ticketStatus: "", crmProcess: "", escalationTeam: "" }] }));
  }

  function removeOutcome(index: number) {
    setDraft((current) => ({ ...current, outcomes: current.outcomes.filter((_, outcomeIndex) => outcomeIndex !== index) }));
  }

  async function submit(publish: boolean) {
    const prepared = { ...draft, investigation: draft.investigation.filter(Boolean), outcomes: draft.outcomes.map((outcome) => ({ ...outcome, decision: outcome.decision.trim(), agentSteps: outcome.agentSteps.filter(Boolean), ticketStatus: outcome.ticketStatus.trim(), crmProcess: outcome.crmProcess.trim(), escalationTeam: outcome.escalationTeam?.trim() || undefined })) };
    if (publish) {
      const validationErrors = validateForPublish(prepared);
      if (validationErrors.length) {
        setError(validationErrors.slice(0, 4).join(" "));
        return;
      }
    }
    setBusy(true);
    setError("");
    try {
      await onSave({ ...prepared, status: publish ? "Published" : "Draft", needsReview: !publish && Boolean(prepared.needsReview) }, publish);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Perubahan belum berhasil disimpan.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="scenario-editor"><div className="editor-header"><div><button className="back-link" onClick={onCancel}><ArrowLeft size={15} /> Kembali ke daftar skenario</button><span className="eyebrow muted">Edit satu kondisi</span><h1>{draft.title || "Kondisi pelanggan"}</h1><p>Perubahan hanya berlaku untuk kondisi ini, bukan seluruh kategori.</p></div><span className={"scenario-status " + (draft.status === "Published" ? "published" : draft.status === "Perlu diperiksa" ? "review" : "draft")}>{draft.status}</span></div><div className="editor-context"><strong>{draft.product}</strong><span>›</span><span>{draft.category}</span><span>›</span><span>{draft.subtype}</span></div><section className="editor-section"><div className="editor-section-title"><span>01</span><div><h2>Informasi kondisi</h2><p>Perbaiki inti pedoman yang dibaca Agent.</p></div></div><div className="editor-grid"><label className="editor-field full">Judul kondisi<input value={draft.title} onChange={(event) => updateDraft({ title: event.target.value })} /></label><label className="editor-field full">Kondisi pelanggan<textarea rows={3} value={draft.condition} onChange={(event) => updateDraft({ condition: event.target.value, title: draft.title || event.target.value.split(/\r?\n/)[0] })} /></label><label className="editor-field full">Cek / penyelidikan <small>Opsional; satu langkah per baris jika tersedia</small><textarea rows={5} value={listToText(draft.investigation)} onChange={(event) => updateDraft({ investigation: textToList(event.target.value) })} /></label><label className="editor-field full">Skrip Live Chat<textarea rows={5} value={draft.script} onChange={(event) => updateDraft({ script: event.target.value })} /></label><label className="editor-field full">Catatan perhatian <small>Opsional</small><textarea rows={3} value={draft.warning ?? ""} onChange={(event) => updateDraft({ warning: event.target.value || undefined })} /></label></div></section><section className="editor-section"><div className="editor-section-title"><span>02</span><div><h2>Hasil penanganan</h2><p>Pilih kalimat yang langsung dipahami Agent.</p></div><button className="secondary-button" onClick={addOutcome}>Tambah hasil</button></div><div className="editor-outcomes">{draft.outcomes.map((outcome, index) => <article className="editor-outcome" key={outcome.id}><div className="editor-outcome-head"><strong>Hasil {index + 1}</strong><button className="text-danger" onClick={() => removeOutcome(index)}>Hapus</button></div><label className="editor-field">Jenis hasil<select value={outcome.type} onChange={(event) => updateOutcome(index, { type: event.target.value as OutcomeType })}>{outcomeTypes.map((type) => <option key={type} value={type}>{outcomeLabel(type)}</option>)}</select></label><label className="editor-field">Kapan dipilih<textarea rows={3} value={outcome.decision} onChange={(event) => updateOutcome(index, { decision: event.target.value })} /></label><label className="editor-field">Langkah agent <small>Satu langkah per baris</small><textarea rows={4} value={listToText(outcome.agentSteps)} onChange={(event) => updateOutcome(index, { agentSteps: textToList(event.target.value) })} /></label><div className="editor-grid compact"><label className="editor-field">Status tiket<input value={outcome.ticketStatus} onChange={(event) => updateOutcome(index, { ticketStatus: event.target.value })} /></label><label className="editor-field">Tim tujuan <small>Opsional</small><input value={outcome.escalationTeam ?? ""} onChange={(event) => updateOutcome(index, { escalationTeam: event.target.value })} /></label></div><label className="editor-field">Proses CRM<textarea rows={3} value={outcome.crmProcess} onChange={(event) => updateOutcome(index, { crmProcess: event.target.value })} /></label></article>)}</div></section>{error && <div className="editor-error"><X size={16} /><span>{error}</span></div>}<div className="editor-actions"><button className="secondary-button" onClick={onCancel} disabled={busy}>Batal</button><button className="secondary-button" onClick={() => void submit(false)} disabled={busy}>{busy ? "Menyimpan..." : "Simpan Draft"}</button><button className="primary-button" onClick={() => void submit(true)} disabled={busy}>{busy ? "Menyimpan..." : "Publish"}</button></div></div>;
}
