"use client";

import { ChangeEvent, FormEvent, useMemo, useState } from "react";
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
  Sparkles,
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
  if (type === "tier_2_3") return "Eskalasi Tier 2/3";
  if (type === "transfer_asi") return "Transfer ke ASI";
  return "Referensi saja";
}

function outcomeTone(type: OutcomeType) {
  if (type === "tier_1") return "success";
  if (type === "tier_2_3") return "warning";
  if (type === "transfer_asi") return "teal";
  return "slate";
}

export default function Home() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [role, setRole] = useState<Role>("agent");
  const [importState, setImportState] = useState(getInitialImportState);
  const { importedGuides, importSummary } = { importedGuides: importState.guides, importSummary: importState.summary };

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

  function enterApp(nextRole: Role) {
    setRole(nextRole);
    setLoggedIn(true);
  }

  if (!loggedIn) return <LoginScreen onLogin={enterApp} />;

  return role === "admin" ? <AdminConsole importedGuides={importedGuides} importSummary={importSummary} onImport={saveImport} onSignOut={() => setLoggedIn(false)} /> : <AgentWorkspace importedGuides={importedGuides} onSignOut={() => setLoggedIn(false)} />;
}

function LoginScreen({ onLogin }: { onLogin: (role: Role) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return <main className="login-page">
    <section className="login-shell">
      <div className="login-brand"><span className="brand-mark large"><BookOpen size={22} /></span><div><strong>AFI</strong> Knowledge<span>Live Chat E-Knowledge Base</span></div></div>
      <div className="login-grid">
        <div className="login-intro"><span className="eyebrow"><Sparkles size={14} /> Product-first knowledge base</span><h1>Jawaban cepat, sesuai <em>kondisi pelanggan.</em></h1><p>Pilih produk, pilih kendala, lalu ikuti pedoman dan tindakan CRM yang tepat untuk Live Chat.</p><div className="login-proof"><div><strong>8</strong><span>produk aktif</span></div><div><strong>30</strong><span>pengguna internal</span></div><div><strong>Tier 1</strong><span>Live Chat focused</span></div></div></div>
        <div className="login-card"><div className="login-card-head"><span className="login-card-icon"><ShieldCheck size={20} /></span><div><h2>Masuk ke AFI Knowledge</h2><p>Gunakan akun internal AFI kamu.</p></div></div><form onSubmit={(event) => { event.preventDefault(); onLogin("agent"); }}><label>Email kerja<input type="email" placeholder="nama@akulaku.com" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>Password<input type="password" placeholder="Masukkan password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label><button className="primary-button login-button" type="submit">Masuk sebagai Agent <ArrowRight size={16} /></button></form><div className="demo-divider"><span>Preview sementara</span></div><div className="demo-actions"><button className="demo-button" onClick={() => onLogin("agent")}><Headphones size={16} /><span><strong>Agent demo</strong><small>Produk → kategori → kondisi</small></span><ArrowRight size={15} /></button><button className="demo-button" onClick={() => onLogin("admin")}><Settings2 size={16} /><span><strong>Admin demo</strong><small>Kelola skenario dan outcome</small></span><ArrowRight size={15} /></button></div><p className="login-note">Login produksi akan memakai akun internal dan hak akses berbasis role.</p></div>
      </div>
    </section>
  </main>;
}

function AgentWorkspace({ importedGuides, onSignOut }: { importedGuides: Guide[]; onSignOut: () => void }) {
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
  const productGuides = useMemo(() => [...guides, ...importedGuides.filter((guide) => Boolean(guide.productId))], [importedGuides]);
  const operationalContent = useMemo(() => [...operationalGuides, ...importedGuides.filter((guide) => !guide.productId && guide.product === "Pedoman Operasional")], [importedGuides]);
  const allGuides = useMemo(() => [...productGuides, ...operationalContent], [operationalContent, productGuides]);
  const categoryGuides = productGuides.filter((guide) => guide.productId === activeProduct.id && guide.category === activeCategory?.name);
  const subtypes = Array.from(new Set(categoryGuides.map((guide) => guide.subtype)));
  const conditionGuides = categoryGuides.filter((guide) => guide.subtype === activeSubtype);
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

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setView("search");
  }

  const breadcrumbs = area === "operational"
    ? ["Pedoman Operasional", activeModule?.name, view === "detail" ? selectedGuide.title : undefined]
    : [activeProduct.name, activeCategory?.name, activeSubtype ?? undefined, view === "detail" ? selectedGuide.title : undefined];

  return <main className="agent-app">
    <header className="agent-topbar">
      <div className="agent-topbar-inner"><div className="agent-brand"><span className="brand-mark"><BookOpen size={17} /></span><strong>AFI</strong><span>Knowledge</span></div><nav className={`agent-primary-nav ${mobileMenu ? "is-open" : ""}`} aria-label="Navigasi knowledge"><button className={area === "products" ? "active" : ""} onClick={() => chooseArea("products")}>Produk</button><button className={area === "operational" ? "active" : ""} onClick={() => chooseArea("operational")}>Pedoman Operasional</button></nav><div className="agent-top-actions"><button className="top-search-trigger" onClick={() => setView("search")}><Search size={16} /><span>Cari pedoman</span></button><button className="top-avatar" aria-label="Profil Agent">AD</button><button className="icon-button mobile-menu-trigger" aria-label="Buka menu" onClick={() => setMobileMenu(!mobileMenu)}>{mobileMenu ? <X size={19} /> : <Menu size={19} />}</button><button className="icon-button signout-button" aria-label="Keluar" onClick={onSignOut}><LogOut size={17} /></button></div></div>
    </header>
    <div className="agent-page">
      <div className="agent-breadcrumbs"><button onClick={() => { setView("home"); setActiveCategoryId(null); setActiveSubtype(null); }}>{area === "products" ? "Produk" : "Pedoman Operasional"}</button>{breadcrumbs.slice(0, -1).filter(Boolean).map((crumb) => <span key={crumb}><ChevronRight size={13} />{crumb}</span>)}</div>
      {view === "home" && area === "products" && <ProductHome activeProduct={activeProduct} onChooseProduct={chooseProduct} onChooseCategory={chooseCategory} query={query} setQuery={setQuery} onSearch={search} />}
      {view === "subtypes" && activeCategory && <SubtypeList product={activeProduct.name} category={activeCategory.name} subtypes={subtypes} onBack={() => { setView("home"); setActiveCategoryId(null); }} onChoose={(subtype) => { setActiveSubtype(subtype); setView("conditions"); }} />}
      {view === "conditions" && activeCategory && activeSubtype && <ConditionList product={activeProduct.name} category={activeCategory.name} subtype={activeSubtype} guides={conditionGuides} onBack={() => setView("subtypes")} onOpenGuide={openGuide} />}
      {view === "home" && area === "operational" && <OperationalHome onChooseModule={(moduleId) => { setActiveModuleId(moduleId); setView("module"); }} />}
      {view === "module" && activeModule && <OperationalModuleView moduleName={activeModule.name} guides={moduleGuides} onBack={() => { setView("home"); setActiveModuleId(null); }} onOpenGuide={openGuide} />}
      {view === "detail" && <GuideDetail guide={selectedGuide} onBack={() => setView(area === "operational" ? "module" : "conditions")} />}
      {view === "search" && <SearchView query={query} setQuery={setQuery} results={searchResults} onSearch={search} onBack={() => setView("home")} onOpenGuide={openGuide} />}
    </div>
  </main>;
}

function ProductHome({ activeProduct, onChooseProduct, onChooseCategory, query, setQuery, onSearch }: { activeProduct: typeof products[number]; onChooseProduct: (productId: string) => void; onChooseCategory: (categoryId: string) => void; query: string; setQuery: (value: string) => void; onSearch: (event: FormEvent<HTMLFormElement>) => void }) {
  return <>
    <section className="product-hero"><div><span className="eyebrow light"><Sparkles size={13} /> Live Chat Knowledge Base</span><h1>Pilih produk, lalu pilih kendalanya.</h1><p>Pedoman disusun mengikuti produk dan kategori agar kamu dapat merespons pelanggan lebih cepat.</p><form className="product-search" onSubmit={onSearch}><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari kendala pelanggan bila produk belum jelas..." /><button type="submit">Cari <ArrowRight size={15} /></button></form></div><div className="hero-guide-card"><BookOpen size={21} /><strong>1 kondisi</strong><span>1 pedoman utuh</span><small>Tier 1 dan eskalasi ada dalam satu flow</small></div></section>
    <section className="product-library"><div className="section-label"><span>01</span><div><strong>Pilih produk</strong><small>Produk aktif untuk Live Chat</small></div></div><div className="product-tabs" role="tablist">{products.map((product) => <button key={product.id} role="tab" aria-selected={product.id === activeProduct.id} className={product.id === activeProduct.id ? "active" : ""} onClick={() => onChooseProduct(product.id)}>{product.shortName}</button>)}</div></section>
    <section className="category-section"><div className="category-section-head"><div><span className="eyebrow muted">02 · Kategori kendala</span><h2>{activeProduct.name}</h2><p>Pilih kategori yang paling dekat dengan keluhan pelanggan.</p></div><span className="category-count">{activeProduct.categories.length} kategori</span></div><div className="product-category-grid">{activeProduct.categories.map((category, index) => <button className={`product-category-card tone-${index % 5}`} key={category.id} onClick={() => onChooseCategory(category.id)}><span className="category-index">{String(index + 1).padStart(2, "0")}</span><span className="category-card-copy"><strong>{category.name}</strong><small>{category.description}</small><em>Lihat sub tipe tiket</em></span><ArrowRight size={17} /></button>)}</div></section>
    <section className="update-strip"><div className="update-strip-head"><span className="eyebrow muted">Update penting</span><span>Hari ini</span></div>{updates.map((update) => <div key={update.title} className={`update-strip-row ${update.tone}`}><span>{update.tone === "warning" ? <Zap size={15} /> : update.tone === "success" ? <CheckCircle2 size={15} /> : <Sparkles size={15} />}</span><strong>{update.title}</strong><small>{update.detail}</small></div>)}</section>
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

function GuideDetail({ guide, onBack }: { guide: Guide; onBack: () => void }) {
  const [copied, setCopied] = useState(false);
  const [outcomeId, setOutcomeId] = useState(guide.outcomes[0]?.id ?? "");
  const activeOutcome = guide.outcomes.find((outcome) => outcome.id === outcomeId) ?? guide.outcomes[0];

  async function copyScript() {
    await navigator.clipboard?.writeText(guide.script);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return <section className="guide-detail"><button className="back-link" onClick={onBack}><ArrowLeft size={15} /> Kembali ke pilihan kondisi</button><div className="guide-path"><span>{guide.product}</span><ChevronRight size={13} /><span>{guide.category}</span><ChevronRight size={13} /><span>{guide.subtype}</span></div><div className="guide-detail-head"><div><span className="eyebrow muted">Kondisi pelanggan</span><h1>{guide.title}</h1><p>{guide.condition}</p></div><span className="published-mark"><CheckCircle2 size={15} /> Published</span></div>{guide.warning && <div className="guide-warning"><Zap size={17} /><div><strong>Perhatian</strong><p>{guide.warning}</p></div></div>}<div className="guide-flow"><section className="guide-panel investigation-panel"><div className="panel-heading"><span>01</span><div><h2>Cek / penyelidikan</h2><p>Lakukan pengecekan ini sebelum menentukan hasil penanganan.</p></div></div><ol>{guide.investigation.map((item) => <li key={item}><Check size={15} />{item}</li>)}</ol></section><section className="guide-panel script-panel"><div className="panel-heading"><span>02</span><div><h2>Skrip Live Chat</h2><p>Skrip siap dikirim setelah pengecekan awal selesai.</p></div><button onClick={copyScript}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "Tersalin" : "Salin skrip"}</button></div><blockquote>{guide.script}</blockquote></section><section className="guide-panel outcome-panel"><div className="panel-heading"><span>03</span><div><h2>Tentukan hasil penanganan</h2><p>Tier adalah hasil dari kondisi yang sama, bukan pedoman yang berbeda.</p></div></div><div className="outcome-tabs">{guide.outcomes.map((outcome) => <button key={outcome.id} className={`${outcomeTone(outcome.type)} ${outcome.id === activeOutcome?.id ? "active" : ""}`} onClick={() => setOutcomeId(outcome.id)}><span>{outcomeLabel(outcome.type)}</span><small>{outcome.decision}</small></button>)}</div>{activeOutcome && <div className="outcome-content"><div className="outcome-rule"><strong>Kapan dipilih</strong><p>{activeOutcome.decision}</p></div><div className="outcome-grid"><div><strong>Agent operation</strong><ol>{activeOutcome.agentSteps.map((step) => <li key={step}>{step}</li>)}</ol></div><div className="crm-box"><span>Proses CRM</span><strong>{activeOutcome.ticketStatus}</strong><p>{activeOutcome.crmProcess}</p>{activeOutcome.escalationTeam && <div><span>Tim tujuan</span><strong>{activeOutcome.escalationTeam}</strong></div>}</div></div></div>}</section></div><div className="feedback-row"><span>Apakah pedoman ini membantu?</span><button><CheckCircle2 size={15} /> Membantu</button><button><LifeBuoy size={15} /> Laporkan masalah</button></div></section>;
}

function SearchView({ query, setQuery, results, onSearch, onBack, onOpenGuide }: { query: string; setQuery: (value: string) => void; results: Guide[]; onSearch: (event: FormEvent<HTMLFormElement>) => void; onBack: () => void; onOpenGuide: (guide: Guide) => void }) {
  return <section className="search-page-v4"><button className="back-link" onClick={onBack}><ArrowLeft size={15} /> Kembali ke beranda</button><span className="eyebrow muted">Jalur cadangan</span><h1>Cari pedoman</h1><p>Gunakan kata pelanggan jika produk atau kategorinya belum jelas.</p><form onSubmit={onSearch} className="search-form-v4"><Search size={19} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Contoh: QRIS gagal, tagihan belum masuk, limit..." /><button type="submit">Cari</button></form><div className="search-count"><strong>{results.length}</strong> pedoman ditemukan</div><div className="search-result-list">{results.map((guide) => <button key={guide.id} onClick={() => onOpenGuide(guide)}><span className="search-result-marker"><BookOpen size={15} /></span><div><strong>{guide.title}</strong><p>{guide.condition}</p><small>{guide.product} · {guide.category} · {guide.subtype}</small></div><ChevronRight size={17} /></button>)}</div></section>;
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="empty-state-v4"><FileSpreadsheet size={25} /><strong>{title}</strong><p>{detail}</p></div>;
}

function AdminConsole({ importedGuides, importSummary, onImport, onSignOut }: { importedGuides: Guide[]; importSummary: ImportSummary | null; onImport: (result: ImportResult) => void; onSignOut: () => void }) {
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

  function confirmImport() {
    if (!preview) return;
    onImport(preview);
    setPreview(null);
    setView("review");
  }

  return <main className="admin-app"><header className="admin-topbar"><div className="agent-brand"><span className="brand-mark"><BookOpen size={17} /></span><strong>AFI</strong><span>Knowledge</span><em>Admin KM</em></div><button className="icon-button" onClick={onSignOut} aria-label="Keluar"><LogOut size={17} /></button></header><div className="admin-layout"><aside><button className={view === "content" ? "active" : ""} onClick={() => setView("content")}><Database size={16} />Skenario</button><button className={view === "import" ? "active" : ""} onClick={() => setView("import")}><Upload size={16} />Import Excel</button><button className={view === "review" ? "active" : ""} onClick={() => setView("review")}><ClipboardCheck size={16} />Perlu diperiksa</button></aside><section className="admin-content-v4">
    {view === "content" && <><span className="eyebrow muted">Knowledge Management</span><h1>Kelola Skenario</h1><p>Satu kondisi pelanggan memiliki satu pedoman dan dapat mempunyai beberapa outcome.</p><div className="scenario-summary"><div><span>Scenario aktif</span><strong>{activeScenarioCount.toLocaleString("id-ID")}</strong></div><div><span>Outcome Tier 1</span><strong>{tier1Count.toLocaleString("id-ID")}</strong></div><div><span>Outcome eskalasi</span><strong>{escalationCount.toLocaleString("id-ID")}</strong></div></div>{importSummary && <div className="import-status-line"><CheckCircle2 size={15} /><span>Import terakhir: <strong>{importSummary.fileName}</strong> · {importSummary.scenarios.toLocaleString("id-ID")} Scenario tersimpan sebagai staging</span></div>}<div className="scenario-table">{displayGuides.slice(0, 80).map((guide) => <div key={guide.id}><div><strong>{guide.title}</strong><small>{guide.product} · {guide.category} · {guide.subtype}</small></div><span>{guide.outcomes.length} outcome</span><button>Edit <ChevronRight size={14} /></button></div>)}</div>{displayGuides.length > 80 && <p className="table-more">Menampilkan 80 dari {displayGuides.length.toLocaleString("id-ID")} Scenario. Gunakan pencarian pada tahap berikutnya untuk menemukan pedoman tertentu.</p>}</>}
    {view === "import" && <><span className="eyebrow muted">Bulk import</span><h1>Import Scenario dari Excel</h1><p>Pilih workbook AFI. Sistem membaca sheet produk dan aturan khusus, melewati produk arsip, lalu menyiapkan staging Draft.</p><label className={`import-drop-v4 ${preview ? "ready" : ""}`} htmlFor="excel-import-input">{isParsing ? <Zap size={26} className="spin" /> : preview ? <CheckCircle2 size={26} /> : <Upload size={26} />}<strong>{isParsing ? "Sedang membaca workbook..." : preview ? `${preview.summary.fileName} siap direview` : "Klik untuk memilih file Excel"}</strong><span>{preview ? "Hasil belum diterbitkan. Periksa ringkasan sebelum simpan ke staging." : "Format .xlsx atau .xls · produk arsip otomatis dilewati."}</span><input id="excel-import-input" className="import-file-input" type="file" accept=".xlsx,.xls" onChange={handleFile} /></label>{error && <div className="import-error"><X size={16} /><span>{error}</span></div>}{preview && <><div className="import-preview-head"><div><span className="eyebrow muted">Preview hasil import</span><h2>{preview.summary.scenarios.toLocaleString("id-ID")} Scenario terdeteksi</h2></div><button className="secondary-button" onClick={() => setPreview(null)}>Pilih file lain</button></div><div className="import-summary-grid"><div><span>Baris sumber</span><strong>{preview.summary.sourceRows.toLocaleString("id-ID")}</strong></div><div><span>Outcome</span><strong>{preview.summary.outcomes.toLocaleString("id-ID")}</strong></div><div><span>Perlu diperiksa</span><strong>{preview.summary.reviewCount.toLocaleString("id-ID")}</strong></div><div><span>Duplikat digabung</span><strong>{preview.summary.duplicateRows.toLocaleString("id-ID")}</strong></div></div>{preview.issues.length > 0 && <div className="import-issues"><strong>Yang perlu diperiksa</strong>{preview.issues.slice(0, 5).map((issue) => <div key={issue.reason}><span>{issue.reason}</span><b>{issue.count.toLocaleString("id-ID")}</b></div>)}</div>}{preview.summary.skippedSheets.length > 0 && <p className="import-note">Sheet di luar mapping dilewati: {preview.summary.skippedSheets.join(", ")}</p>}<button className="primary-button" onClick={confirmImport}>Simpan ke staging Draft <ArrowRight size={16} /></button></>}</>}
    {view === "review" && <><span className="eyebrow muted">Staging review</span><h1>Perlu diperiksa</h1><p>Data tidak lengkap tetap tersimpan sebagai Draft agar Admin cukup memperbaiki bagian yang perlu saja.</p>{importSummary ? <><div className="review-card-v4"><ClipboardCheck size={21} /><div><strong>{importSummary.reviewCount.toLocaleString("id-ID")} Scenario perlu diperiksa</strong><p>{importSummary.scenarios.toLocaleString("id-ID")} Scenario dari {importSummary.fileName} sudah masuk staging. Perbaiki kondisi, skrip, atau outcome yang ditandai sebelum publish.</p></div><button className="primary-button" onClick={() => setView("content")}>Lihat staging <ArrowRight size={16} /></button></div><div className="review-steps"><span>1</span><div><strong>Periksa data wajib</strong><p>Kondisi pelanggan, skrip Live Chat, dan langkah agent.</p></div><span>2</span><div><strong>Validasi outcome</strong><p>Pastikan status CRM dan tim eskalasi sudah benar.</p></div><span>3</span><div><strong>Publish</strong><p>Hanya Admin/Quality yang menerbitkan pedoman setelah review selesai.</p></div></div></> : <div className="empty-state-v4"><ClipboardCheck size={25} /><strong>Belum ada hasil import</strong><p>Pilih Import Excel untuk memulai staging workbook.</p><button className="primary-button" onClick={() => setView("import")}>Mulai import <Upload size={15} /></button></div>}</>}
  </section></div></main>;
}
