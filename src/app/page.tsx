"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Copy,
  Database,
  FileSpreadsheet,
  Headphones,
  LifeBuoy,
  LogOut,
  Menu,
  Search,
  Settings2,
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
  type OutcomeType,
  type Role,
} from "@/lib/mock-data";
import { parseExcelFile, type ImportResult, type ImportSummary } from "@/lib/excel-importer";
import { loadAdminGuides, loadPublishedGuides, roleFromUser, saveImportToDatabase, updateScenarioInDatabase } from "@/lib/ekb-repository";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import type { User } from "@supabase/supabase-js";

type AgentView = "home" | "subtypes" | "conditions" | "detail" | "search" | "module";
type AgentArea = "products" | "operational";
type AdminView = "content" | "import" | "review";

const IMPORT_STORAGE_KEY = "afi-knowledge-imported-guides-v1";

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
  return "Referensi saja";
}

function outcomeTone(type: OutcomeType) {
  if (type === "tier_1") return "success";
  if (type === "tier_2_3") return "warning";
  if (type === "transfer_asi") return "teal";
  return "slate";
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
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase("id-ID");
}

function uniqueTaxonomyLabels(values: string[]) {
  const labels = new Map<string, string>();
  values.map((value) => value.replace(/\s+/g, " ").trim()).filter(Boolean).forEach((value) => {
    const key = taxonomyKey(value);
    if (!labels.has(key)) labels.set(key, value);
  });
  return [...labels.values()];
}

function GlobalSearchBar({ query, variant, onChange }: { query: string; variant: "hero" | "compact"; onChange: (value: string) => void }) {
  return <div className={`global-search ${variant}`}><Search size={variant === "hero" ? 19 : 16} /><input value={query} onChange={(event) => onChange(event.target.value)} placeholder="Cari kendala, produk, kategori..." aria-label="Cari pedoman" /></div>;
}

export default function Home() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [authReady, setAuthReady] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [demoRole, setDemoRole] = useState<Role | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [publishedGuides, setPublishedGuides] = useState<Guide[]>([]);
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
    loadPublishedGuides(supabase).then((loaded) => {
      if (active) setPublishedGuides(loaded);
    }).catch(() => {
      if (active) setPublishedGuides([]);
    });
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

  function enterDemo(nextRole: Role) {
    setDemoRole(nextRole);
    setAuthError("");
  }

  async function signIn(email: string, password: string) {
    if (!supabase) {
      setAuthError("Supabase belum dikonfigurasi. Gunakan mode demo sementara.");
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
    setDemoRole(null);
  }

  async function signOut() {
    if (supabase && user) await supabase.auth.signOut();
    setUser(null);
    setDemoRole(null);
  }

  async function persistImport(result: ImportResult) {
    saveImport(result);
    const currentRole = demoRole ?? roleFromUser(user);
    if (supabase && user && currentRole === "admin") {
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

  if (!authReady) return <LoginScreen onLogin={enterDemo} onSignIn={signIn} authError={authError} authBusy={authBusy} />;
  if (!user && !demoRole) return <LoginScreen onLogin={enterDemo} onSignIn={signIn} authError={authError} authBusy={authBusy} />;

  const role = demoRole ?? roleFromUser(user);
  const agentStagingGuides = demoRole ? importedGuides : importedGuides.filter((guide) => guide.status === "Published");
  return role === "admin" ? <AdminConsoleV2 importedGuides={adminGuides.length ? adminGuides : importedGuides} importSummary={importSummary} onImport={persistImport} onSaveScenario={saveScenario} onSignOut={signOut} /> : <AgentWorkspace importedGuides={agentStagingGuides} publishedGuides={publishedGuides} onSignOut={signOut} />;
}

function LoginScreen({ onLogin, onSignIn, authError, authBusy }: { onLogin: (role: Role) => void; onSignIn: (email: string, password: string) => Promise<void>; authError: string; authBusy: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return <><main className="login-page" onSubmitCapture={(event) => { event.preventDefault(); event.stopPropagation(); void onSignIn(email, password); }}>
    <section className="login-shell">
      <div className="login-brand"><span className="brand-mark large"><BookOpen size={22} /></span><div><strong>AFI</strong> Knowledge<span>Live Chat E-Knowledge Base</span></div></div>
      <div className="login-grid">
      <div className="login-intro"><span className="eyebrow">Product-first knowledge base</span><h1>Jawaban cepat, sesuai <em>kondisi pelanggan.</em></h1><p>Pilih produk, pilih kendala, lalu ikuti pedoman dan tindakan CRM yang tepat untuk Live Chat.</p><div className="login-proof"><div><strong>8</strong><span>produk aktif</span></div><div><strong>30</strong><span>pengguna internal</span></div><div><strong>Tier 1</strong><span>Live Chat focused</span></div></div></div>
        <div className="login-card"><div className="login-card-head"><span className="login-card-icon"><ShieldCheck size={20} /></span><div><h2>Masuk ke AFI Knowledge</h2><p>Gunakan akun internal AFI kamu.</p></div></div><form onSubmit={(event) => { event.preventDefault(); onLogin("agent"); }}><label>Email kerja<input type="email" placeholder="nama@akulaku.com" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>Password<input type="password" placeholder="Masukkan password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label><button className="primary-button login-button" type="submit">Masuk sebagai Agent <ArrowRight size={16} /></button></form><div className="demo-divider"><span>Preview sementara</span></div><div className="demo-actions"><button className="demo-button" onClick={() => onLogin("agent")}><Headphones size={16} /><span><strong>Agent demo</strong><small>Produk → kategori → kondisi</small></span><ArrowRight size={15} /></button><button className="demo-button" onClick={() => onLogin("admin")}><Settings2 size={16} /><span><strong>Admin demo</strong><small>Kelola skenario dan outcome</small></span><ArrowRight size={15} /></button></div><p className="login-note">Login produksi akan memakai akun internal dan hak akses berbasis role.</p></div>
      </div>
    </section>
  </main>{authError && <p className="login-error login-error-global">{authError}</p>}{authBusy && <span className="login-busy-global">Memeriksa akun...</span>}</>;
}

function AgentWorkspace({ importedGuides, publishedGuides, onSignOut }: { importedGuides: Guide[]; publishedGuides: Guide[]; onSignOut: () => void }) {
  const [area, setArea] = useState<AgentArea>("products");
  const [view, setView] = useState<AgentView>("home");
  const [activeProductId, setActiveProductId] = useState(products[0].id);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [activeSubtype, setActiveSubtype] = useState<string | null>(null);
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
  const [selectedGuideId, setSelectedGuideId] = useState(guides[0].id);
  const [query, setQuery] = useState("");
  const [mobileMenu, setMobileMenu] = useState(false);

  const activeProduct = products.find((product) => product.id === activeProductId) ?? products[0];
  const activeCategory = activeProduct.categories.find((category) => category.id === activeCategoryId) ?? null;
  const productGuides = useMemo(() => [...guides, ...publishedGuides.filter((guide) => Boolean(guide.productId)), ...importedGuides.filter((guide) => Boolean(guide.productId))], [importedGuides, publishedGuides]);
  const operationalContent = useMemo(() => [...operationalGuides, ...publishedGuides.filter((guide) => !guide.productId && guide.product === "Pedoman Operasional"), ...importedGuides.filter((guide) => !guide.productId && guide.product === "Pedoman Operasional")], [importedGuides, publishedGuides]);
  const allGuides = useMemo(() => [...productGuides, ...operationalContent], [operationalContent, productGuides]);
  const categoryGuides = productGuides.filter((guide) => guide.productId === activeProduct.id && taxonomyKey(guide.category) === taxonomyKey(activeCategory?.name ?? ""));
  const subtypes = uniqueTaxonomyLabels(categoryGuides.map((guide) => guide.subtype));
  const conditionGuides = categoryGuides.filter((guide) => taxonomyKey(guide.subtype) === taxonomyKey(activeSubtype ?? ""));
  const selectedGuide = allGuides.find((guide) => guide.id === selectedGuideId) ?? allGuides[0];
  const activeModule = operationalModules.find((module) => module.id === activeModuleId) ?? null;
  const moduleGuides = operationalContent.filter((guide) => guide.category === activeModule?.name);
  const searchResults = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return allGuides;
    return allGuides.filter((guide) => [guide.product, guide.category, guide.subtype, guide.title, guide.condition, guide.script].join(" ").toLowerCase().includes(term));
  }, [allGuides, query]);

  function chooseArea(nextArea: AgentArea) {
    setArea(nextArea);
    setView("home");
    setActiveCategoryId(null);
    setActiveSubtype(null);
    setActiveModuleId(null);
    setMobileMenu(false);
  }

  function chooseProduct(productId: string) {
    setActiveProductId(productId);
    setActiveCategoryId(null);
    setActiveSubtype(null);
    setView("home");
  }

  function chooseCategory(categoryId: string) {
    setActiveCategoryId(categoryId);
    setActiveSubtype(null);
    setView("subtypes");
  }

  function openGuide(guide: Guide) {
    setSelectedGuideId(guide.id);
    setView("detail");
  }

  const breadcrumbs = area === "operational"
    ? ["Pedoman Operasional", activeModule?.name, view === "detail" ? selectedGuide.title : undefined]
    : [activeProduct.name, activeCategory?.name, activeSubtype ?? undefined, view === "detail" ? selectedGuide.title : undefined];

  return <main className="agent-app">
    <header className="agent-topbar">
      <div className="agent-topbar-inner"><div className="agent-brand"><span className="brand-mark"><BookOpen size={17} /></span><strong>AFI</strong><span>Knowledge</span></div><nav className={`agent-primary-nav ${mobileMenu ? "is-open" : ""}`} aria-label="Navigasi knowledge"><button className={area === "products" ? "active" : ""} onClick={() => chooseArea("products")}>Produk</button><button className={area === "operational" ? "active" : ""} onClick={() => chooseArea("operational")}>Pedoman Operasional</button></nav><div className="agent-top-actions">{!(view === "home" && area === "products") && <GlobalSearchBar query={query} variant="compact" onChange={(value) => { setQuery(value); setView(value.trim() ? "search" : "home"); }} />}<button className="top-avatar" aria-label="Profil Agent">AD</button><button className="icon-button mobile-menu-trigger" aria-label="Buka menu" onClick={() => setMobileMenu(!mobileMenu)}>{mobileMenu ? <X size={19} /> : <Menu size={19} />}</button><button className="icon-button signout-button" aria-label="Keluar" onClick={onSignOut}><LogOut size={17} /></button></div></div>
    </header>
    <div className="agent-page">
      <div className="agent-breadcrumbs"><button onClick={() => { setView("home"); setActiveCategoryId(null); setActiveSubtype(null); }}>{area === "products" ? "Produk" : "Pedoman Operasional"}</button>{breadcrumbs.slice(0, -1).filter(Boolean).map((crumb) => <span key={crumb}><ChevronRight size={13} />{crumb}</span>)}</div>
      {view === "home" && area === "products" && <ProductHome activeProduct={activeProduct} query={query} onSearchChange={(value) => { setQuery(value); setView(value.trim() ? "search" : "home"); }} onChooseProduct={chooseProduct} onChooseCategory={chooseCategory} />}
      {view === "subtypes" && activeCategory && <SubtypeList product={activeProduct.name} category={activeCategory.name} subtypes={subtypes} onBack={() => { setView("home"); setActiveCategoryId(null); }} onChoose={(subtype) => { setActiveSubtype(subtype); setView("conditions"); }} />}
      {view === "conditions" && activeCategory && activeSubtype && <ConditionList product={activeProduct.name} category={activeCategory.name} subtype={activeSubtype} guides={conditionGuides} onBack={() => setView("subtypes")} onOpenGuide={openGuide} />}
      {view === "home" && area === "operational" && <OperationalHome onChooseModule={(moduleId) => { setActiveModuleId(moduleId); setView("module"); }} />}
      {view === "module" && activeModule && <OperationalModuleView moduleName={activeModule.name} guides={moduleGuides} onBack={() => { setView("home"); setActiveModuleId(null); }} onOpenGuide={openGuide} />}
      {view === "detail" && <GuideDetail guide={selectedGuide} onBack={() => setView(area === "operational" ? "module" : "conditions")} />}
      {view === "search" && <SearchViewLive query={query} results={searchResults} onBack={() => setView("home")} onOpenGuide={openGuide} />}
    </div>
  </main>;
}

function ProductHome({ activeProduct, query, onSearchChange, onChooseProduct, onChooseCategory }: { activeProduct: typeof products[number]; query: string; onSearchChange: (value: string) => void; onChooseProduct: (productId: string) => void; onChooseCategory: (categoryId: string) => void }) {
  return <>
    <section className="product-hero"><div><span className="eyebrow light">Live Chat Knowledge Base</span><h1>Pilih produk, lalu pilih kendalanya.</h1><p>Pedoman disusun mengikuti produk dan kategori agar kamu dapat merespons pelanggan lebih cepat.</p><GlobalSearchBar query={query} variant="hero" onChange={onSearchChange} /></div><div className="hero-guide-card"><BookOpen size={21} /><strong>1 kondisi</strong><span>1 pedoman utuh</span><small>Tier 1 dan eskalasi ada dalam satu flow</small></div></section>
    <section className="product-library"><div className="section-label"><span>01</span><div><strong>Pilih produk</strong><small>Produk aktif untuk Live Chat</small></div></div><div className="product-tabs" role="tablist">{products.map((product) => <button key={product.id} role="tab" aria-selected={product.id === activeProduct.id} className={product.id === activeProduct.id ? "active" : ""} onClick={() => onChooseProduct(product.id)}>{product.shortName}</button>)}</div></section>
    <section className="category-section"><div className="category-section-head"><div><span className="eyebrow muted">02 · Kategori kendala</span><h2>{activeProduct.name}</h2><p>Pilih kategori yang paling dekat dengan keluhan pelanggan.</p></div><span className="category-count">{activeProduct.categories.length} kategori</span></div><div className="product-category-grid">{activeProduct.categories.map((category, index) => <button className={`product-category-card tone-${index % 5}`} key={category.id} onClick={() => onChooseCategory(category.id)}><span className="category-index">{String(index + 1).padStart(2, "0")}</span><span className="category-card-copy"><strong>{category.name}</strong><small>{category.description}</small><em>Lihat sub tipe tiket</em></span><ArrowRight size={17} /></button>)}</div></section>
    <section className="update-strip"><div className="update-strip-head"><span className="eyebrow muted">Update penting</span><span>Hari ini</span></div>{updates.map((update) => <div key={update.title} className={`update-strip-row ${update.tone}`}><span>{update.tone === "warning" ? <Zap size={15} /> : update.tone === "success" ? <CheckCircle2 size={15} /> : <BookOpen size={15} />}</span><strong>{update.title}</strong><small>{update.detail}</small></div>)}</section>
  </>;
}

function SubtypeList({ product, category, subtypes, onBack, onChoose }: { product: string; category: string; subtypes: string[]; onBack: () => void; onChoose: (subtype: string) => void }) {
  return <section className="drill-page"><button className="back-link" onClick={onBack}><ArrowLeft size={15} /> Kembali ke kategori</button><span className="eyebrow muted">{product} · {category}</span><h1>Pilih sub tipe tiket</h1><p>Gunakan sub tipe yang paling sesuai dengan kendala pelanggan.</p>{subtypes.length ? <div className="subtype-list">{subtypes.map((subtype, index) => <button key={subtype} onClick={() => onChoose(subtype)}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{subtype}</strong><small>Lihat kondisi pelanggan yang tersedia</small></div><ChevronRight size={18} /></button>)}</div> : <EmptyState title="Sub tipe kategori ini akan tersedia setelah import" detail="Taxonomy kategori sudah siap. Konten dan kondisi pelanggan akan muncul setelah data produk dipublikasikan." />}</section>;
}

function ConditionList({ product, category, subtype, guides: conditionGuides, onBack, onOpenGuide }: { product: string; category: string; subtype: string; guides: Guide[]; onBack: () => void; onOpenGuide: (guide: Guide) => void }) {
  return <section className="drill-page"><button className="back-link" onClick={onBack}><ArrowLeft size={15} /> Kembali ke sub tipe tiket</button><span className="eyebrow muted">{product} · {category}</span><h1>{subtype}</h1><p>Pilih kondisi pelanggan yang paling sesuai sebelum membuka pedoman.</p>{conditionGuides.length ? <div className="condition-list">{conditionGuides.map((guide) => <button key={guide.id} onClick={() => onOpenGuide(guide)}><span className="condition-dot" /><div><strong>{guide.title}</strong><p>{guide.condition}</p><small>{guide.outcomes.map((outcome) => outcomeLabel(outcome.type)).join(" · ")}</small></div><ChevronRight size={18} /></button>)}</div> : <EmptyState title="Belum ada kondisi yang dipublikasikan" detail="Admin dapat menambahkan kondisi baru pada sub tipe ini melalui form Scenario." />}</section>;
}

function OperationalHome({ onChooseModule }: { onChooseModule: (moduleId: string) => void }) {
  return <section className="operational-home"><div className="operational-hero"><span className="eyebrow light"><ShieldCheck size={13} /> Sheet operasional tetap terpisah</span><h1>Pedoman Operasional</h1><p>Pilih jenis pedoman yang diperlukan. Konten di bawah tidak dicampur dengan pedoman produk.</p></div><div className="operational-grid">{operationalModules.map((module, index) => <button key={module.id} className={`operational-card tone-${index % 5}`} onClick={() => onChooseModule(module.id)}><span><BookOpen size={18} /></span><div><strong>{module.name}</strong><small>{module.description}</small></div><ChevronRight size={17} /></button>)}</div></section>;
}

function OperationalModuleView({ moduleName, guides: moduleGuides, onBack, onOpenGuide }: { moduleName: string; guides: Guide[]; onBack: () => void; onOpenGuide: (guide: Guide) => void }) {
  return <section className="drill-page"><button className="back-link" onClick={onBack}><ArrowLeft size={15} /> Kembali ke Pedoman Operasional</button><span className="eyebrow muted">Pedoman Operasional</span><h1>{moduleName}</h1><p>Konten dari sheet ini tersimpan dan dikelola secara terpisah dari pedoman produk.</p>{moduleGuides.length ? <div className="condition-list">{moduleGuides.map((guide) => <button key={guide.id} onClick={() => onOpenGuide(guide)}><span className="condition-dot" /><div><strong>{guide.title}</strong><p>{guide.condition}</p><small>{guide.outcomes.map((outcome) => outcomeLabel(outcome.type)).join(" · ")}</small></div><ChevronRight size={18} /></button>)}</div> : <EmptyState title="Isi modul akan tersedia setelah import" detail="Module sudah dipisahkan sejak awal agar tidak membingungkan Agent maupun Admin." />}</section>;
}

function splitGuidePoints(value: string) {
  return value
    .replace(/\r/g, "")
    .split(/\n+|(?=\d+[.)]\s)|(?=[*•](?:\s|[A-Za-z]))|(?=-\s)/g)
    .map((part) => part.replace(/^\s*(?:\d+[.)]\s*|[*•-]\s*)/, "").trim())
    .filter(Boolean);
}

function GuidePointList({ value, className = "" }: { value: string; className?: string }) {
  const points = splitGuidePoints(value);
  if (!points.length) return null;
  return <div className={`guide-points ${className}`}>{points.map((point, index) => <div key={`${point}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><p>{point}</p></div>)}</div>;
}

function GuideDetail({ guide, onBack }: { guide: Guide; onBack: () => void }) {
  const [copied, setCopied] = useState(false);
  const [outcomeId, setOutcomeId] = useState(guide.outcomes[0]?.id ?? "");
  const activeOutcome = guide.outcomes.find((outcome) => outcome.id === outcomeId) ?? guide.outcomes[0];
  const escalationOutcomes = guide.outcomes.filter((outcome) => outcome.type === "tier_2_3" || outcome.type === "transfer_asi");
  const escalationOnly = escalationOutcomes.length > 0 && !guide.outcomes.some((outcome) => outcome.type === "tier_1");
  const scriptPoints = splitGuidePoints(guide.script);

  async function copyScript() {
    const formattedScript = scriptPoints.length ? scriptPoints.map((point, index) => `${index + 1}. ${point}`).join("\n") : guide.script;
    await navigator.clipboard?.writeText(formattedScript);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return <section className="guide-detail"><button className="back-link" onClick={onBack}><ArrowLeft size={15} /> Kembali ke pilihan kondisi</button><div className="guide-path"><span>{guide.product}</span><ChevronRight size={13} /><span>{guide.category}</span><ChevronRight size={13} /><span>{guide.subtype}</span></div><div className="guide-detail-head"><div><span className="eyebrow muted">Kondisi pelanggan</span><h1>{guide.title}</h1><GuidePointList value={guide.condition} className="condition-points" /></div><span className="published-mark"><CheckCircle2 size={15} /> Published</span></div>{escalationOutcomes.length > 0 && <div className={`escalation-banner ${escalationOnly ? "required" : ""}`}><span className="escalation-mark">!</span><div><strong>{escalationOnly ? "Perlu eskalasi" : "Ada jalur eskalasi"}</strong><p>{escalationOutcomes.map((outcome) => outcomeLabel(outcome.type)).join(" · ")}. Lihat hasil penanganan untuk memastikan syarat dan prosesnya.</p></div></div>}{guide.warning && <div className="guide-warning"><Zap size={17} /><div><strong>Perhatian</strong><p>{guide.warning}</p></div></div>}<div className="guide-flow"><section className="guide-panel investigation-panel"><div className="panel-heading"><span>01</span><div><h2>Cek / penyelidikan</h2><p>Lakukan pengecekan ini sebelum menentukan hasil penanganan.</p></div></div><ol>{guide.investigation.map((item) => <li key={item}><Check size={15} />{item}</li>)}</ol></section><section className="guide-panel script-panel"><div className="panel-heading"><span>02</span><div><h2>Skrip Live Chat</h2><p>Skrip siap dikirim setelah pengecekan awal selesai.</p></div><button onClick={copyScript}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "Tersalin" : "Salin skrip"}</button></div><GuidePointList value={guide.script} className="script-points" /></section><section className="guide-panel outcome-panel"><div className="panel-heading"><span>03</span><div><h2>Tentukan hasil penanganan</h2><p>Tier adalah hasil dari kondisi yang sama, bukan pedoman yang berbeda.</p></div></div><div className="outcome-tabs">{guide.outcomes.map((outcome) => <button key={outcome.id} className={`${outcomeTone(outcome.type)} ${outcome.id === activeOutcome?.id ? "active" : ""}`} onClick={() => setOutcomeId(outcome.id)}><span>{outcomeLabel(outcome.type)}</span><small>{outcome.decision}</small></button>)}</div>{activeOutcome && <div className="outcome-content"><div className="outcome-rule"><strong>Kapan dipilih</strong><p>{activeOutcome.decision}</p></div><div className="outcome-grid"><div><strong>Agent operation</strong><ol>{activeOutcome.agentSteps.map((step) => <li key={step}>{step}</li>)}</ol></div><div className="crm-box"><span>Proses CRM</span><strong>{activeOutcome.ticketStatus}</strong><p>{activeOutcome.crmProcess}</p>{activeOutcome.escalationTeam && <div><span>Tim tujuan</span><strong>{activeOutcome.escalationTeam}</strong></div>}</div></div></div>}</section></div><div className="feedback-row"><span>Apakah pedoman ini membantu?</span><button><CheckCircle2 size={15} /> Membantu</button><button><LifeBuoy size={15} /> Laporkan masalah</button></div></section>;
}

function SearchView({ query, setQuery, results, onSearch, onBack, onOpenGuide }: { query: string; setQuery: (value: string) => void; results: Guide[]; onSearch: (event: FormEvent<HTMLFormElement>) => void; onBack: () => void; onOpenGuide: (guide: Guide) => void }) {
  return <section className="search-page-v4"><button className="back-link" onClick={onBack}><ArrowLeft size={15} /> Kembali ke beranda</button><span className="eyebrow muted">Jalur cadangan</span><h1>Cari pedoman</h1><p>Gunakan kata pelanggan jika produk atau kategorinya belum jelas.</p><form onSubmit={onSearch} className="search-form-v4"><Search size={19} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Contoh: QRIS gagal, tagihan belum masuk, limit..." /><button type="submit">Cari</button></form><div className="search-count"><strong>{results.length}</strong> pedoman ditemukan</div><div className="search-result-list">{results.map((guide) => <button key={guide.id} onClick={() => onOpenGuide(guide)}><span className="search-result-marker"><BookOpen size={15} /></span><div><strong>{guide.title}</strong><p>{guide.condition}</p><small>{guide.product} · {guide.category} · {guide.subtype}</small></div><ChevronRight size={17} /></button>)}</div></section>;
}

void SearchView;

function SearchViewLive({ query, results, onBack, onOpenGuide }: { query: string; results: Guide[]; onBack: () => void; onOpenGuide: (guide: Guide) => void }) {
  return <section className="search-page-v4"><button className="back-link" onClick={onBack}><ArrowLeft size={15} /> Kembali ke beranda</button><span className="eyebrow muted">Pencarian global</span><h1>Hasil pencarian</h1><p>Gunakan satu kolom pencarian global di header untuk menemukan pedoman.</p><div className="search-count"><strong>{results.length}</strong> pedoman ditemukan{query.trim() ? ` untuk “${query}”` : ""}</div><div className="search-result-list">{results.map((guide) => <button key={guide.id} onClick={() => onOpenGuide(guide)}><span className="search-result-marker"><BookOpen size={15} /></span><div><strong>{highlightText(guide.title, query)}</strong><p>{highlightText(guide.condition, query)}</p><small>{highlightText(guide.product + " · " + guide.category + " · " + guide.subtype, query)}</small></div><ChevronRight size={17} /></button>)}</div></section>;
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="empty-state-v4"><FileSpreadsheet size={25} /><strong>{title}</strong><p>{detail}</p></div>;
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

  return <main className="admin-app"><header className="admin-topbar"><div className="agent-brand"><span className="brand-mark"><BookOpen size={17} /></span><strong>AFI</strong><span>Knowledge</span><em>Admin KM</em></div><button className="icon-button" onClick={onSignOut} aria-label="Keluar"><LogOut size={17} /></button></header><div className="admin-layout"><aside><button className={view === "content" ? "active" : ""} onClick={() => setView("content")}><Database size={16} />Skenario</button><button className={view === "import" ? "active" : ""} onClick={() => setView("import")}><Upload size={16} />Import Excel</button><button className={view === "review" ? "active" : ""} onClick={() => setView("review")}><ClipboardCheck size={16} />Perlu diperiksa</button></aside><section className="admin-content-v4">
    {view === "content" && <><span className="eyebrow muted">Knowledge Management</span><h1>Kelola Skenario</h1><p>Satu kondisi pelanggan memiliki satu pedoman dan dapat mempunyai beberapa opsi penanganan.</p><div className="scenario-summary"><div><span>Scenario aktif</span><strong>{activeScenarioCount.toLocaleString("id-ID")}</strong></div><div><span>Selesai Tier 1</span><strong>{tier1Count.toLocaleString("id-ID")}</strong></div><div><span>Eskalasi ke Tier 2/3</span><strong>{escalationCount.toLocaleString("id-ID")}</strong></div></div>{importSummary && <div className="import-status-line"><CheckCircle2 size={15} /><span>Import terakhir: <strong>{importSummary.fileName}</strong> · {importSummary.scenarios.toLocaleString("id-ID")} Scenario tersimpan sebagai staging</span></div>}<div className="scenario-table">{displayGuides.slice(0, 80).map((guide) => <div key={guide.id}><div><strong>{guide.title}</strong><small>{guide.product} · {guide.category} · {guide.subtype}</small></div><span>{guide.outcomes.length} opsi penanganan</span><button>Edit <ChevronRight size={14} /></button></div>)}</div>{displayGuides.length > 80 && <p className="table-more">Menampilkan 80 dari {displayGuides.length.toLocaleString("id-ID")} Scenario. Gunakan pencarian pada tahap berikutnya untuk menemukan pedoman tertentu.</p>}</>}
    {view === "import" && <><span className="eyebrow muted">Bulk import</span><h1>Import Scenario dari Excel</h1><p>Pilih workbook AFI. Sistem membaca sheet produk dan aturan khusus, melewati produk arsip, lalu menyiapkan staging Draft.</p><label className={`import-drop-v4 ${preview ? "ready" : ""}`} htmlFor="excel-import-input">{isParsing ? <Zap size={26} className="spin" /> : preview ? <CheckCircle2 size={26} /> : <Upload size={26} />}<strong>{isParsing ? "Sedang membaca workbook..." : preview ? `${preview.summary.fileName} siap direview` : "Klik untuk memilih file Excel"}</strong><span>{preview ? "Hasil belum diterbitkan. Periksa ringkasan sebelum simpan ke staging." : "Format .xlsx atau .xls · produk arsip otomatis dilewati."}</span><input id="excel-import-input" className="import-file-input" type="file" accept=".xlsx,.xls" onChange={handleFile} /></label>{error && <div className="import-error"><X size={16} /><span>{error}</span></div>}{preview && <><div className="import-preview-head"><div><span className="eyebrow muted">Preview hasil import</span><h2>{preview.summary.scenarios.toLocaleString("id-ID")} Scenario terdeteksi</h2></div><button className="secondary-button" onClick={() => setPreview(null)}>Pilih file lain</button></div><div className="import-summary-grid"><div><span>Baris sumber</span><strong>{preview.summary.sourceRows.toLocaleString("id-ID")}</strong></div><div><span>Outcome</span><strong>{preview.summary.outcomes.toLocaleString("id-ID")}</strong></div><div><span>Perlu diperiksa</span><strong>{preview.summary.reviewCount.toLocaleString("id-ID")}</strong></div><div><span>Duplikat digabung</span><strong>{preview.summary.duplicateRows.toLocaleString("id-ID")}</strong></div></div>{preview.issues.length > 0 && <div className="import-issues"><strong>Yang perlu diperiksa</strong>{preview.issues.slice(0, 5).map((issue) => <div key={issue.reason}><span>{issue.reason}</span><b>{issue.count.toLocaleString("id-ID")}</b></div>)}</div>}{preview.summary.skippedSheets.length > 0 && <p className="import-note">Sheet di luar mapping dilewati: {preview.summary.skippedSheets.join(", ")}</p>}<button className="primary-button" onClick={confirmImport}>Simpan ke staging Draft <ArrowRight size={16} /></button></>}</>}
    {view === "review" && <><span className="eyebrow muted">Staging review</span><h1>Perlu diperiksa</h1><p>Data tidak lengkap tetap tersimpan sebagai Draft agar Admin cukup memperbaiki bagian yang perlu saja.</p>{importSummary ? <><div className="review-card-v4"><ClipboardCheck size={21} /><div><strong>{importSummary.reviewCount.toLocaleString("id-ID")} Scenario perlu diperiksa</strong><p>{importSummary.scenarios.toLocaleString("id-ID")} Scenario dari {importSummary.fileName} sudah masuk staging. Perbaiki kondisi, skrip, atau outcome yang ditandai sebelum publish.</p></div><button className="primary-button" onClick={() => setView("content")}>Lihat staging <ArrowRight size={16} /></button></div><div className="review-steps"><span>1</span><div><strong>Periksa data wajib</strong><p>Kondisi pelanggan, skrip Live Chat, dan langkah agent.</p></div><span>2</span><div><strong>Validasi outcome</strong><p>Pastikan status CRM dan tim eskalasi sudah benar.</p></div><span>3</span><div><strong>Publish</strong><p>Hanya Admin/Quality yang menerbitkan pedoman setelah review selesai.</p></div></div></> : <div className="empty-state-v4"><ClipboardCheck size={25} /><strong>Belum ada hasil import</strong><p>Pilih Import Excel untuk memulai staging workbook.</p><button className="primary-button" onClick={() => setView("import")}>Mulai import <Upload size={15} /></button></div>}</>}
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
  const operationalGuideList = allGuides.filter((guide) => guide.product === "Pedoman Operasional");
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

function AdminConsoleV2({ importedGuides, importSummary, onImport, onSaveScenario, onSignOut }: AdminConsoleV2Props) {
  const [view, setView] = useState<AdminView>("content");
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [editingGuide, setEditingGuide] = useState<Guide | null>(null);
  const [browseSelection, setBrowseSelection] = useState<AdminBrowseSelection>({ area: "products", productId: null, category: null, subtype: null });
  const pageSize = 100;
  const displayGuides = useMemo(() => importedGuides.length ? importedGuides : [...guides, ...operationalGuides], [importedGuides]);
  const browseGuides = useMemo(() => {
    if (browseSelection.area === "operational") {
      return displayGuides.filter((guide) => guide.product === "Pedoman Operasional" && (!browseSelection.category || taxonomyKey(guide.category) === taxonomyKey(browseSelection.category)) && (!browseSelection.subtype || taxonomyKey(guide.subtype) === taxonomyKey(browseSelection.subtype)));
    }
    if (!browseSelection.productId) return displayGuides;
    const product = products.find((item) => item.id === browseSelection.productId);
    if (!product) return displayGuides;
    return displayGuides.filter((guide) => (guide.productId === product.id || guide.product === product.name) && (!browseSelection.category || taxonomyKey(guide.category) === taxonomyKey(browseSelection.category)) && (!browseSelection.subtype || taxonomyKey(guide.subtype) === taxonomyKey(browseSelection.subtype)));
  }, [browseSelection, displayGuides]);
  const filteredGuides = useMemo(() => {
    const term = searchInput.trim().toLowerCase();
    if (!term) return browseGuides;
    return browseGuides.filter((guide) => [guide.product, guide.category, guide.subtype, guide.title, guide.condition, guide.status, guide.reviewReason].filter(Boolean).join(" ").toLowerCase().includes(term));
  }, [searchInput, browseGuides]);
  const totalPages = Math.max(1, Math.ceil(filteredGuides.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visibleGuides = filteredGuides.slice((safePage - 1) * pageSize, safePage * pageSize);
  const reviewGuides = displayGuides.filter((guide) => guide.needsReview || guide.status === "Perlu diperiksa");
  const activeScenarioCount = displayGuides.length;
  const tier1Count = displayGuides.flatMap((guide) => guide.outcomes).filter((outcome) => outcome.type === "tier_1").length;
  const escalationCount = displayGuides.flatMap((guide) => guide.outcomes).filter((outcome) => outcome.type === "tier_2_3").length;

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

  return <main className="admin-app"><header className="admin-topbar"><div className="agent-brand"><span className="brand-mark"><BookOpen size={17} /></span><strong>AFI</strong><span>Knowledge</span><em>Admin KM</em></div><button className="icon-button" onClick={onSignOut} aria-label="Keluar"><LogOut size={17} /></button></header><div className="admin-layout"><aside><button className={view === "content" && !editingGuide ? "active" : ""} onClick={() => { setEditingGuide(null); setView("content"); }}><Database size={16} />Skenario</button><button className={view === "import" && !editingGuide ? "active" : ""} onClick={() => { setEditingGuide(null); setView("import"); }}><Upload size={16} />Import Excel</button><button className={view === "review" && !editingGuide ? "active" : ""} onClick={() => { setEditingGuide(null); setView("review"); }}><ClipboardCheck size={16} />Perlu diperiksa</button></aside><section className="admin-content-v4">{editingGuide ? <ScenarioEditor guide={editingGuide} onCancel={() => setEditingGuide(null)} onSave={async (guide, publish) => { await onSaveScenario(guide, publish); setEditingGuide(null); }} /> : <>{view === "content" && <><span className="eyebrow muted">Knowledge Management</span><h1>Kelola Skenario</h1><p>Satu kondisi pelanggan memiliki satu pedoman. Perubahan dilakukan per kondisi, bukan per seluruh kategori.</p><div className="scenario-summary"><div><span>Scenario aktif</span><strong>{activeScenarioCount.toLocaleString("id-ID")}</strong></div><div><span>Selesai Tier 1</span><strong>{tier1Count.toLocaleString("id-ID")}</strong></div><div><span>Eskalasi ke Tier 2/3</span><strong>{escalationCount.toLocaleString("id-ID")}</strong></div></div>{importSummary && <div className="import-status-line"><CheckCircle2 size={15} /><span>Import terakhir: <strong>{importSummary.fileName}</strong> · {importSummary.scenarios.toLocaleString("id-ID")} scenario masuk ke staging</span></div>}<AdminCategoryNavigator guides={displayGuides} selection={browseSelection} onChange={(nextSelection) => { setBrowseSelection(nextSelection); setSearchInput(""); setPage(1); }} /><div className="scenario-toolbar"><div className="scenario-search"><Search size={16} /><input value={searchInput} onChange={(event) => { setSearchInput(event.target.value); setPage(1); }} placeholder="Ketik kondisi, produk, kategori..." aria-label="Cari scenario" /></div><span>{filteredGuides.length.toLocaleString("id-ID")} scenario ditemukan</span></div><div className="scenario-table">{visibleGuides.map((guide) => <div key={guide.id}><div><strong>{highlightText(guide.title, searchInput)}</strong><small>{highlightText(guide.product + " · " + guide.category + " · " + guide.subtype, searchInput)}</small></div><span className={"scenario-status " + (guide.status === "Published" ? "published" : guide.status === "Perlu diperiksa" ? "review" : "draft")}>{guide.status}</span><button onClick={() => { setEditingGuide(guide); setError(""); }}>Edit <ChevronRight size={14} /></button></div>)}</div>{visibleGuides.length === 0 && <div className="admin-empty">Tidak ada scenario yang cocok dengan pencarian.</div>}<div className="scenario-pagination"><span>Menampilkan {filteredGuides.length ? ((safePage - 1) * pageSize) + 1 : 0}–{Math.min(safePage * pageSize, filteredGuides.length)} dari {filteredGuides.length.toLocaleString("id-ID")} · 100 per halaman</span><div><button disabled={safePage === 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Sebelumnya</button><strong>Halaman {safePage} dari {totalPages}</strong><button disabled={safePage === totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Berikutnya</button></div></div></>}{view === "import" && <><span className="eyebrow muted">Bulk import</span><h1>Import Scenario dari Excel</h1><p>Pilih workbook AFI. Data lengkap akan langsung Published; data yang belum lengkap masuk Perlu diperiksa.</p><label className={"import-drop-v4 " + (preview ? "ready" : "")} htmlFor="excel-import-input">{isParsing ? <Zap size={26} className="spin" /> : preview ? <CheckCircle2 size={26} /> : <Upload size={26} />}<strong>{isParsing ? "Sedang membaca workbook..." : preview ? preview.summary.fileName + " siap direview" : "Klik untuk memilih file Excel"}</strong><span>{preview ? "Data lengkap akan langsung Published; data yang belum lengkap masuk Perlu diperiksa." : "Format .xlsx atau .xls · produk arsip otomatis dilewati."}</span><input id="excel-import-input" className="import-file-input" type="file" accept=".xlsx,.xls" onChange={handleFile} /></label>{error && <div className="import-error"><X size={16} /><span>{error}</span></div>}{preview && <><div className="import-preview-head"><div><span className="eyebrow muted">Preview hasil import</span><h2>{preview.summary.scenarios.toLocaleString("id-ID")} scenario terdeteksi</h2></div><button className="secondary-button" onClick={() => setPreview(null)}>Pilih file lain</button></div><div className="import-summary-grid"><div><span>Baris sumber</span><strong>{preview.summary.sourceRows.toLocaleString("id-ID")}</strong></div><div><span>Hasil penanganan</span><strong>{preview.summary.outcomes.toLocaleString("id-ID")}</strong></div><div><span>Perlu diperiksa</span><strong>{preview.summary.reviewCount.toLocaleString("id-ID")}</strong></div><div><span>Duplikat digabung</span><strong>{preview.summary.duplicateRows.toLocaleString("id-ID")}</strong></div></div>{preview.issues.length > 0 && <div className="import-issues"><strong>Yang perlu diperiksa</strong>{preview.issues.slice(0, 5).map((issue) => <div key={issue.reason}><span>{issue.reason}</span><b>{issue.count.toLocaleString("id-ID")}</b></div>)}</div>}{preview.summary.skippedSheets.length > 0 && <p className="import-note">Sheet di luar mapping dilewati: {preview.summary.skippedSheets.join(", ")}</p>}<button className="primary-button" onClick={confirmImport} disabled={isSaving}>{isSaving ? "Sedang menyimpan ke database..." : "Simpan hasil import"} <ArrowRight size={16} /></button></>}</>}{view === "review" && <><span className="eyebrow muted">Staging review</span><h1>Perlu diperiksa</h1><p>{reviewGuides.length.toLocaleString("id-ID")} scenario masih perlu dicek sebelum diterbitkan.</p>{reviewGuides.length ? <div className="admin-review-list">{reviewGuides.slice(0, 100).map((guide) => <button key={guide.id} className="admin-review-item" onClick={() => { setEditingGuide(guide); setError(""); }}><div><strong>{guide.title}</strong><small>{guide.reviewReason || "Periksa kelengkapan pedoman dan opsi penanganan."}</small></div><ChevronRight size={17} /></button>)}</div> : <div className="empty-state-v4"><ClipboardCheck size={25} /><strong>Belum ada scenario yang perlu diperiksa</strong><p>Import workbook atau buka daftar Skenario untuk melanjutkan.</p></div>}</>}</>}</section></div></main>;
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
  if (!guide.investigation.length) errors.push("Cek/penyelidikan belum diisi.");
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

  return <div className="scenario-editor"><div className="editor-header"><div><button className="back-link" onClick={onCancel}><ArrowLeft size={15} /> Kembali ke daftar skenario</button><span className="eyebrow muted">Edit satu kondisi</span><h1>{draft.title || "Kondisi pelanggan"}</h1><p>Perubahan hanya berlaku untuk kondisi ini, bukan seluruh kategori.</p></div><span className={"scenario-status " + (draft.status === "Published" ? "published" : draft.status === "Perlu diperiksa" ? "review" : "draft")}>{draft.status}</span></div><div className="editor-context"><strong>{draft.product}</strong><span>›</span><span>{draft.category}</span><span>›</span><span>{draft.subtype}</span></div><section className="editor-section"><div className="editor-section-title"><span>01</span><div><h2>Informasi kondisi</h2><p>Perbaiki inti pedoman yang dibaca Agent.</p></div></div><div className="editor-grid"><label className="editor-field full">Judul kondisi<input value={draft.title} onChange={(event) => updateDraft({ title: event.target.value })} /></label><label className="editor-field full">Kondisi pelanggan<textarea rows={3} value={draft.condition} onChange={(event) => updateDraft({ condition: event.target.value, title: draft.title || event.target.value.split(/\r?\n/)[0] })} /></label><label className="editor-field full">Cek / penyelidikan <small>Satu langkah per baris</small><textarea rows={5} value={listToText(draft.investigation)} onChange={(event) => updateDraft({ investigation: textToList(event.target.value) })} /></label><label className="editor-field full">Skrip Live Chat<textarea rows={5} value={draft.script} onChange={(event) => updateDraft({ script: event.target.value })} /></label><label className="editor-field full">Catatan perhatian <small>Opsional</small><textarea rows={3} value={draft.warning ?? ""} onChange={(event) => updateDraft({ warning: event.target.value || undefined })} /></label></div></section><section className="editor-section"><div className="editor-section-title"><span>02</span><div><h2>Hasil penanganan</h2><p>Pilih kalimat yang langsung dipahami Agent.</p></div><button className="secondary-button" onClick={addOutcome}>Tambah hasil</button></div><div className="editor-outcomes">{draft.outcomes.map((outcome, index) => <article className="editor-outcome" key={outcome.id}><div className="editor-outcome-head"><strong>Hasil {index + 1}</strong><button className="text-danger" onClick={() => removeOutcome(index)}>Hapus</button></div><label className="editor-field">Jenis hasil<select value={outcome.type} onChange={(event) => updateOutcome(index, { type: event.target.value as OutcomeType })}>{outcomeTypes.map((type) => <option key={type} value={type}>{outcomeLabel(type)}</option>)}</select></label><label className="editor-field">Kapan dipilih<textarea rows={3} value={outcome.decision} onChange={(event) => updateOutcome(index, { decision: event.target.value })} /></label><label className="editor-field">Langkah agent <small>Satu langkah per baris</small><textarea rows={4} value={listToText(outcome.agentSteps)} onChange={(event) => updateOutcome(index, { agentSteps: textToList(event.target.value) })} /></label><div className="editor-grid compact"><label className="editor-field">Status tiket<input value={outcome.ticketStatus} onChange={(event) => updateOutcome(index, { ticketStatus: event.target.value })} /></label><label className="editor-field">Tim tujuan <small>Opsional</small><input value={outcome.escalationTeam ?? ""} onChange={(event) => updateOutcome(index, { escalationTeam: event.target.value })} /></label></div><label className="editor-field">Proses CRM<textarea rows={3} value={outcome.crmProcess} onChange={(event) => updateOutcome(index, { crmProcess: event.target.value })} /></label></article>)}</div></section>{error && <div className="editor-error"><X size={16} /><span>{error}</span></div>}<div className="editor-actions"><button className="secondary-button" onClick={onCancel} disabled={busy}>Batal</button><button className="secondary-button" onClick={() => void submit(false)} disabled={busy}>{busy ? "Menyimpan..." : "Simpan Draft"}</button><button className="primary-button" onClick={() => void submit(true)} disabled={busy}>{busy ? "Menyimpan..." : "Publish"}</button></div></div>;
}
