"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  Command,
  Copy,
  Database,
  FileCheck2,
  FileSpreadsheet,
  Filter,
  Headphones,
  HelpCircle,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Star,
  Tag,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { guides, updates, type Guide, type Role } from "@/lib/mock-data";

type AgentView = "home" | "search" | "detail";
type AdminView = "content" | "import" | "review";

const navItems = [
  { id: "home" as AgentView, label: "Beranda", icon: LayoutDashboard },
  { id: "search" as AgentView, label: "Cari pedoman", icon: Search },
  { id: "updates" as const, label: "Update penting", icon: Zap },
  { id: "favorites" as const, label: "Favorit", icon: Star },
];

export default function Home() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [role, setRole] = useState<Role>("agent");
  const [agentView, setAgentView] = useState<AgentView>("home");
  const [adminView, setAdminView] = useState<AdminView>("content");
  const [query, setQuery] = useState("");
  const [selectedGuideId, setSelectedGuideId] = useState(guides[0].id);
  const [mobileNav, setMobileNav] = useState(false);

  const selectedGuide = guides.find((guide) => guide.id === selectedGuideId) ?? guides[0];
  const filteredGuides = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return guides;
    return guides.filter((guide) => [guide.title, guide.product, guide.category, guide.subtype, guide.condition].join(" ").toLowerCase().includes(value));
  }, [query]);

  function enterApp(nextRole: Role) {
    setRole(nextRole);
    setLoggedIn(true);
    setAgentView("home");
    setAdminView("content");
    setMobileNav(false);
  }

  function signOut() {
    setLoggedIn(false);
    setMobileNav(false);
  }

  function openGuide(guide: Guide) {
    setSelectedGuideId(guide.id);
    setAgentView("detail");
    setMobileNav(false);
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAgentView("search");
    setMobileNav(false);
  }

  if (!loggedIn) return <LoginScreen onLogin={enterApp} />;

  return (
    <div className="app-frame">
      <button className="mobile-overlay" aria-label="Tutup menu" data-open={mobileNav} onClick={() => setMobileNav(false)} />
      <aside className={`sidebar ${mobileNav ? "is-open" : ""}`}>
        <div className="sidebar-top">
          <div className="brand-lockup">
            <span className="brand-mark"><BookOpen size={18} strokeWidth={2.4} /></span>
            <span><strong>AFI</strong> Knowledge</span>
          </div>
          <button className="icon-button sidebar-close" aria-label="Tutup menu" onClick={() => setMobileNav(false)}><X size={18} /></button>
          <div className="workspace-switch"><span className="status-dot" /> Live Chat Operations <ChevronDown size={14} /></div>
        </div>

        <nav className="side-nav" aria-label="Navigasi utama">
          <span className="nav-label">Workspace</span>
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = item.id === agentView || (item.id === "home" && agentView === "detail");
            return <button key={item.id} className={`nav-item ${active ? "active" : ""}`} onClick={() => { if (item.id === "updates") setAgentView("home"); else if (item.id === "favorites") setAgentView("search"); else setAgentView(item.id); setMobileNav(false); }}><Icon size={17} />{item.label}{item.id === "updates" && <span className="nav-count">3</span>}</button>;
          })}

          {role === "admin" && <>
            <span className="nav-label admin-nav-label">Admin KM</span>
            <button className={`nav-item ${adminView === "content" ? "active" : ""}`} onClick={() => { setAdminView("content"); setMobileNav(false); }}><Database size={17} />Kelola konten</button>
            <button className={`nav-item ${adminView === "import" ? "active" : ""}`} onClick={() => { setAdminView("import"); setMobileNav(false); }}><FileSpreadsheet size={17} />Import Excel</button>
            <button className={`nav-item ${adminView === "review" ? "active" : ""}`} onClick={() => { setAdminView("review"); setMobileNav(false); }}><ClipboardCheck size={17} />Perlu diperiksa<span className="nav-count soft">445</span></button>
          </>}
        </nav>

        <div className="sidebar-bottom">
          <div className="help-card"><div className="help-icon"><LifeBuoy size={16} /></div><div><strong>Butuh bantuan?</strong><span>Buka panduan penggunaan</span></div><ArrowRight size={15} /></div>
          <div className="user-card"><div className="avatar">{role === "admin" ? "KM" : "AD"}</div><div className="user-copy"><strong>{role === "admin" ? "Admin KM" : "Agent Dita"}</strong><span>{role === "admin" ? "Knowledge Manager" : "Live Chat Tier 1"}</span></div><button className="icon-button" aria-label="Keluar" onClick={signOut}><LogOut size={16} /></button></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left"><button className="icon-button menu-button" aria-label="Buka menu" onClick={() => setMobileNav(true)}><Menu size={20} /></button><div className="breadcrumbs"><span>AFI Knowledge</span><span>/</span><strong>{role === "admin" && adminView !== "content" ? adminView === "import" ? "Import Excel" : "Perlu diperiksa" : role === "admin" ? "Kelola konten" : agentView === "home" ? "Beranda" : agentView === "search" ? "Cari pedoman" : "Detail pedoman"}</strong></div></div>
          <div className="topbar-actions"><button className="topbar-search" onClick={() => { setAgentView("search"); setMobileNav(false); }}><Search size={16} /><span>Cari pedoman...</span><kbd><Command size={12} /> K</kbd></button><button className="icon-button" aria-label="Notifikasi"><Bell size={18} /><span className="notification-dot" /></button><button className="icon-button" aria-label="Bantuan"><HelpCircle size={18} /></button><div className="top-avatar">{role === "admin" ? "KM" : "AD"}</div></div>
        </header>

        <div className="page-scroll">
          {role === "admin" && adminView === "import" ? <AdminImport onBack={() => setAdminView("content")} /> : role === "admin" && adminView === "review" ? <AdminReview /> : role === "admin" ? <AdminContent onImport={() => setAdminView("import")} /> : agentView === "home" ? <AgentHome query={query} setQuery={setQuery} onSearch={submitSearch} onOpenGuide={openGuide} /> : agentView === "search" ? <AgentSearch query={query} setQuery={setQuery} guides={filteredGuides} onSearch={submitSearch} onOpenGuide={openGuide} /> : <AgentDetail guide={selectedGuide} onBack={() => setAgentView("search")} />}
        </div>
      </main>
    </div>
  );
}

function LoginScreen({ onLogin }: { onLogin: (role: Role) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  return <main className="login-page">
    <div className="login-decoration decoration-one" /><div className="login-decoration decoration-two" />
    <section className="login-shell">
      <div className="login-brand"><span className="brand-mark large"><BookOpen size={22} strokeWidth={2.5} /></span><div><strong>AFI</strong> Knowledge<span>Live Chat Command Center</span></div></div>
      <div className="login-grid">
        <div className="login-intro"><div className="eyebrow"><Sparkles size={14} /> Built for faster, safer conversations</div><h1>Jawaban yang tepat, <em>di saat yang tepat.</em></h1><p>Satu tempat untuk menemukan pedoman, menyalin skrip, dan menjalankan tindakan CRM tanpa berpindah-pindah tab.</p><div className="login-proof"><div><strong>1.890+</strong><span>pedoman siap dicari</span></div><div><strong>30</strong><span>pengguna internal</span></div><div><strong>Tier 1</strong><span>Live Chat focused</span></div></div></div>
        <div className="login-card"><div className="login-card-head"><span className="login-card-icon"><ShieldCheck size={20} /></span><div><h2>Masuk ke workspace</h2><p>Gunakan akun internal AFI kamu.</p></div></div><form onSubmit={(event) => { event.preventDefault(); onLogin("agent"); }}><label>Email kerja<input type="email" placeholder="nama@akulaku.com" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>Password<input type="password" placeholder="Masukkan password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label><div className="login-options"><label className="check-row"><input type="checkbox" defaultChecked /> Ingat saya</label><button type="button" className="text-button">Lupa password?</button></div><button className="primary-button login-button" type="submit">Masuk ke AFI Knowledge <ArrowRight size={16} /></button></form><div className="demo-divider"><span>Preview sementara</span></div><div className="demo-actions"><button className="demo-button" onClick={() => onLogin("agent")}><Headphones size={16} /><span><strong>Agent demo</strong><small>Masuk sebagai Agent</small></span><ArrowRight size={15} /></button><button className="demo-button" onClick={() => onLogin("admin")}><Settings2 size={16} /><span><strong>Admin demo</strong><small>Masuk sebagai Admin KM</small></span><ArrowRight size={15} /></button></div><p className="login-note">Akses demo hanya untuk melihat alur. Login production akan menggunakan Supabase Auth.</p></div>
      </div>
      <div className="login-footer"><span>© 2026 AFI Knowledge</span><span className="secure-note"><ShieldCheck size={14} /> Internal workspace</span></div>
    </section>
  </main>;
}

function AgentHome({ query, setQuery, onSearch, onOpenGuide }: { query: string; setQuery: (value: string) => void; onSearch: (event: FormEvent<HTMLFormElement>) => void; onOpenGuide: (guide: Guide) => void }) {
  return <div className="content-wrap agent-home"><section className="welcome-row"><div><div className="eyebrow muted"><span className="status-dot" /> Workspace aktif · Kamis, 6 Agustus 2026</div><h1>Selamat pagi, Dita <span>👋</span></h1><p>Temukan pedoman yang kamu butuhkan untuk membantu pelanggan dengan percaya diri.</p></div><div className="session-pill"><span className="pulse" /> Live Chat aktif<strong>Tier 1</strong></div></section><section className="search-hero"><div className="search-hero-copy"><span className="search-kicker"><Search size={15} /> Quick search</span><h2>Apa kendala pelanggan?</h2><p>Ketik dengan bahasa pelanggan. Kami akan menemukan pedoman yang paling relevan.</p><form className="hero-search" onSubmit={onSearch}><Search size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Contoh: tagihan belum masuk..." /><kbd><Command size={12} /> K</kbd><button type="submit">Cari <ArrowRight size={16} /></button></form><div className="search-hints"><span>Sering dicari:</span><button onClick={() => setQuery("tagihan belum masuk")}>tagihan belum masuk</button><button onClick={() => setQuery("QRIS gagal")}>QRIS gagal</button><button onClick={() => setQuery("transfer ASI")}>transfer ASI</button></div></div><div className="search-orbit"><div className="orbit-ring ring-one" /><div className="orbit-ring ring-two" /><div className="orbit-center"><BookOpen size={23} /><span>AFI<br /><b>Knowledge</b></span></div><span className="orbit-chip chip-one">Script siap salin</span><span className="orbit-chip chip-two">CRM aware</span><span className="orbit-chip chip-three">Live updates</span></div></section><section className="section-block"><div className="section-heading"><div><span className="eyebrow muted">Pintu masuk cepat</span><h2>Mulai dari yang paling sering dipakai</h2></div><button className="link-button" onClick={() => onOpenGuide(guides[0])}>Lihat semua <ArrowRight size={15} /></button></div><div className="shortcut-grid"><Shortcut icon={<ShieldCheck />} title="Verifikasi data" detail="Aturan wajib Live Chat" tone="blue" /><Shortcut icon={<FileCheck2 />} title="Logika tiket" detail="Pembuatan & pilihan tiket" tone="violet" /><Shortcut icon={<LifeBuoy />} title="Special treatment" detail="HC, insist, dan ancaman OJK" tone="orange" /><Shortcut icon={<ArrowRight />} title="Transfer ke ASI" detail="Flow dan skrip transfer" tone="teal" /></div></section><section className="section-block updates-section"><div className="section-heading"><div><span className="eyebrow muted">Dari Knowledge Manager</span><h2>Update terbaru</h2></div><button className="link-button">Semua update <ArrowRight size={15} /></button></div><div className="updates-list">{updates.map((update) => <div className={`update-row ${update.tone}`} key={update.title}><span className="update-icon">{update.tone === "warning" ? <Zap size={16} /> : update.tone === "success" ? <CheckCircle2 size={16} /> : <Sparkles size={16} />}</span><div><strong>{update.title}</strong><span>{update.detail}</span></div><ArrowRight size={15} /></div>)}</div></section></div>;
}

function Shortcut({ icon, title, detail, tone }: { icon: React.ReactNode; title: string; detail: string; tone: string }) { return <button className={`shortcut-card ${tone}`}><span className="shortcut-icon">{icon}</span><span><strong>{title}</strong><small>{detail}</small></span><ArrowRight size={15} /></button>; }

function AgentSearch({ query, setQuery, guides: filtered, onSearch, onOpenGuide }: { query: string; setQuery: (value: string) => void; guides: Guide[]; onSearch: (event: FormEvent<HTMLFormElement>) => void; onOpenGuide: (guide: Guide) => void }) {
  return <div className="content-wrap search-page"><div className="page-intro compact"><div><span className="eyebrow muted">Knowledge search</span><h1>Cari pedoman</h1><p>Gunakan kata-kata pelanggan atau filter berdasarkan produk dan kategori.</p></div><button className="outline-button"><Filter size={16} /> Filter <span className="filter-count">2</span></button></div><form className="search-bar-large" onSubmit={onSearch}><Search size={19} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari: pembayaran, cicilan, QRIS, transfer..." /><button type="submit">Cari</button></form><div className="search-meta"><span><strong>{filtered.length}</strong> pedoman ditemukan</span><span className="sort-control">Paling relevan <ChevronDown size={15} /></span></div><div className="search-results-layout"><div className="result-list">{filtered.length ? filtered.map((guide) => <button className="result-card" key={guide.id} onClick={() => onOpenGuide(guide)}><div className="result-card-top"><span className={`status-badge ${guide.resolution === "Eskalasi Tier 2/3" ? "orange" : guide.resolution === "Transfer ke ASI" ? "teal" : "blue"}`}>{guide.resolution}</span><span className="result-time">{guide.updated}</span></div><h3>{guide.title}</h3><p>{guide.condition}</p><div className="result-footer"><span><Tag size={13} /> {guide.product}</span><span>{guide.category}</span><ArrowRight size={15} /></div></button>) : <div className="empty-state"><Search size={24} /><h3>Belum ada hasil</h3><p>Coba gunakan kata yang lebih umum, seperti “pembayaran” atau “akun”.</p></div>}</div><aside className="search-insight"><div className="insight-heading"><Sparkles size={16} /><strong>Tips pencarian</strong></div><p>Gunakan kalimat yang sama dengan pelanggan. Sistem akan mencocokkan produk, kategori, dan kondisi.</p><div className="tip-row"><span>01</span><div><strong>Mulai dari masalahnya</strong><small>“tagihan belum masuk”</small></div></div><div className="tip-row"><span>02</span><div><strong>Tambahkan produk</strong><small>“QRIS Openpay gagal”</small></div></div><div className="tip-row"><span>03</span><div><strong>Gunakan filter</strong><small>Untuk hasil yang lebih spesifik</small></div></div></aside></div></div>;
}

function AgentDetail({ guide, onBack }: { guide: Guide; onBack: () => void }) {
  const [copied, setCopied] = useState(false);
  const [favorite, setFavorite] = useState(false);
  return <div className="content-wrap detail-page"><button className="back-link" onClick={onBack}><ArrowLeft size={15} /> Kembali ke hasil pencarian</button><div className="detail-layout"><article className="detail-main"><div className="detail-heading"><div><div className="tag-line"><span className="status-badge orange"><Zap size={13} /> {guide.resolution}</span><span className="muted-dot">·</span><span>{guide.product}</span><span className="muted-dot">·</span><span>Diperbarui {guide.updated}</span></div><h1>{guide.title}</h1><p>{guide.condition}</p></div><button className={`icon-button favorite-button ${favorite ? "is-favorite" : ""}`} aria-label="Simpan favorit" onClick={() => setFavorite(!favorite)}><Star size={20} fill={favorite ? "currentColor" : "none"} /></button></div><div className="alert-banner"><span className="alert-mark"><Zap size={16} /></span><div><strong>Perhatikan update hari ini</strong><p>Pastikan gunakan probing dan status CRM terbaru sebelum membuat tiket.</p></div></div><section className="detail-card"><div className="card-title-row"><div><span className="eyebrow muted">01 · Sebelum menjawab</span><h2>Yang perlu ditanyakan</h2></div><span className="step-pill">Wajib</span></div><div className="probe-list">{guide.probing.map((item, index) => <div key={item}><span>{String(index + 1).padStart(2, "0")}</span><p>{item}</p><Check size={15} /></div>)}</div></section><section className="script-card"><div className="script-head"><div><span className="eyebrow light">02 · Siap dikirim</span><h2>Skrip Live Chat</h2></div><button className="script-copy" onClick={() => { setCopied(true); setTimeout(() => setCopied(false), 1600); }}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "Tersalin" : "Salin skrip"}</button></div><p>{guide.script}</p></section><section className="detail-card"><div className="card-title-row"><div><span className="eyebrow muted">03 · Setelah data lengkap</span><h2>Langkah agent</h2></div></div><div className="agent-steps">{guide.steps.map((step, index) => <div key={step}><span>{index + 1}</span><p>{step}</p></div>)}</div></section><div className="feedback-row"><span>Apakah pedoman ini membantu?</span><button className="feedback-button">👍 Ya</button><button className="feedback-button">👎 Belum</button><span className="feedback-spacer" /><button className="text-button"><MoreHorizontal size={16} /> Laporkan masalah</button></div></article><aside className="detail-aside"><div className="action-card"><div className="action-card-heading"><span className="action-icon"><ShieldCheck size={17} /></span><div><span className="eyebrow muted">Tindakan CRM</span><h3>{guide.resolution}</h3></div></div><div className="action-divider" /><div className="action-field"><span>Status tiket</span><strong>{guide.crmStatus}</strong></div>{guide.team && <div className="action-field"><span>Tim tujuan</span><strong>{guide.team}</strong></div>}<button className="primary-button full">Buka flow CRM <ArrowRight size={16} /></button></div><div className="related-card"><div className="card-title-row"><h3>Pedoman terkait</h3><ArrowRight size={15} /></div><button><span className="related-dot blue" /><div><strong>Ketentuan verifikasi data</strong><small>Verifikasi · Lintas Produk</small></div></button><button><span className="related-dot orange" /><div><strong>Logika pembuatan tiket</strong><small>Logika Tiket · Umum</small></div></button></div><div className="source-card"><FileCheck2 size={16} /><div><strong>Konten terverifikasi</strong><small>Terakhir diperiksa oleh Admin KM</small></div><CheckCircle2 size={15} /></div></aside></div></div>;
}

function AdminContent({ onImport }: { onImport: () => void }) {
  return <div className="content-wrap admin-page"><div className="page-intro"><div><span className="eyebrow muted">Knowledge management</span><h1>Kelola konten</h1><p>Jaga agar setiap jawaban agent tetap akurat, konsisten, dan mudah ditemukan.</p></div><div className="intro-actions"><button className="outline-button"><Plus size={16} /> Pedoman baru</button><button className="primary-button" onClick={onImport}><Upload size={16} /> Import Excel</button></div></div><div className="admin-stat-grid"><AdminStat label="Total pedoman" value="1.890" trend="+42 bulan ini" icon={<BookOpen />} tone="blue" /><AdminStat label="Published" value="1.445" trend="76% dari total" icon={<CheckCircle2 />} tone="green" /><AdminStat label="Perlu diperiksa" value="445" trend="Prioritaskan minggu ini" icon={<ClipboardCheck />} tone="orange" /><AdminStat label="Update sementara" value="03" trend="2 berakhir hari ini" icon={<Clock3 />} tone="violet" /></div><section className="admin-panel"><div className="table-toolbar"><div><h2>Semua pedoman</h2><p>Terakhir disinkronkan hari ini, 10:15</p></div><div className="table-tools"><div className="table-search"><Search size={15} /><input placeholder="Cari judul pedoman..." /></div><button className="outline-button small"><Filter size={15} /> Filter</button><button className="icon-button bordered" aria-label="Menu"><MoreHorizontal size={18} /></button></div></div><div className="table-wrap"><table><thead><tr><th>Judul pedoman</th><th>Produk / kategori</th><th>Tindakan</th><th>Status</th><th>Terakhir diubah</th><th /></tr></thead><tbody>{guides.map((guide) => <tr key={guide.id}><td><div className="table-title"><strong>{guide.title}</strong><span>{guide.subtype}</span></div></td><td><div className="table-title"><strong>{guide.product}</strong><span>{guide.category}</span></div></td><td><span className={`status-badge ${guide.resolution === "Eskalasi Tier 2/3" ? "orange" : guide.resolution === "Transfer ke ASI" ? "teal" : "blue"}`}>{guide.resolution}</span></td><td><span className={`table-status ${guide.status === "Published" ? "published" : "review"}`}><span />{guide.status}</span></td><td><span className="table-date">{guide.updated}</span></td><td><button className="icon-button" aria-label={`Buka ${guide.title}`}><MoreHorizontal size={17} /></button></td></tr>)}</tbody></table></div><div className="table-footer"><span>Menampilkan <strong>4</strong> dari 1.890 pedoman</span><div className="pagination"><button className="icon-button bordered" disabled><ArrowLeft size={15} /></button><button className="page-number active">1</button><button className="page-number">2</button><button className="page-number">3</button><span>...</span><button className="page-number">189</button><button className="icon-button bordered"><ArrowRight size={15} /></button></div></div></section></div>;
}

function AdminStat({ label, value, trend, icon, tone }: { label: string; value: string; trend: string; icon: React.ReactNode; tone: string }) { return <div className="admin-stat"><span className={`stat-icon ${tone}`}>{icon}</span><div><span>{label}</span><strong>{value}</strong><small>{trend}</small></div></div>; }

function AdminImport({ onBack }: { onBack: () => void }) {
  const [file, setFile] = useState(false);
  const [started, setStarted] = useState(false);
  return <div className="content-wrap admin-page import-page"><button className="back-link" onClick={onBack}><ArrowLeft size={15} /> Kembali ke daftar konten</button><div className="page-intro"><div><span className="eyebrow muted">Bulk import</span><h1>Import pedoman dari Excel</h1><p>Masukkan banyak pedoman sekaligus. Data akan masuk sebagai Draft sebelum diterbitkan.</p></div><span className="secure-tag"><ShieldCheck size={14} /> Import aman & dapat dibatalkan</span></div>{!started ? <div className="import-grid"><section className="import-card"><div className={`dropzone ${file ? "has-file" : ""}`} onClick={() => setFile(true)}><span className="drop-icon">{file ? <FileSpreadsheet size={24} /> : <Upload size={24} />}</span>{file ? <><strong>1-Salinan-dari-NEW-AFI.xlsx</strong><span>1.8 MB · Siap dianalisis</span><button className="text-button" onClick={(event) => { event.stopPropagation(); setFile(false); }}><X size={14} /> Hapus file</button></> : <><strong>Tarik file Excel ke sini</strong><span>atau klik untuk memilih file .xlsx</span><small>Maksimal 25 MB</small></>}</div><div className="import-checklist"><h3>Sebelum import</h3><div><CheckCircle2 size={16} /><span>Sheet produk arsip akan dilewati otomatis.</span></div><div><CheckCircle2 size={16} /><span>Duplikat persis akan digabung dan dicatat.</span></div><div><CheckCircle2 size={16} /><span>Data yang belum lengkap masuk sebagai Draft.</span></div></div><button className="primary-button full" disabled={!file} onClick={() => setStarted(true)}>Analisis file <ArrowRight size={16} /></button></section><aside className="import-side"><div className="import-side-heading"><Sparkles size={17} /><strong>Yang akan terjadi</strong></div><div className="import-step"><span>01</span><div><strong>Validasi</strong><small>Kolom, format, duplikat, dan data kosong.</small></div></div><div className="import-step"><span>02</span><div><strong>Staging</strong><small>Data masuk sebagai draft yang bisa ditinjau.</small></div></div><div className="import-step"><span>03</span><div><strong>Publish</strong><small>Admin memilih kapan data tersedia untuk agent.</small></div></div><div className="import-note"><ShieldCheck size={16} /><span>Source row disimpan agar setiap pedoman dapat dilacak kembali ke Excel.</span></div></aside></div> : <ImportResult onBack={onBack} />}</div>;
}

function ImportResult({ onBack }: { onBack: () => void }) { return <div className="import-result"><div className="result-success"><span><CheckCircle2 size={23} /></span><div><h2>File siap masuk staging</h2><p>Validasi selesai tanpa mengubah data asli.</p></div><span className="result-time">Baru saja</span></div><div className="import-summary-grid"><div><span>Baris sumber</span><strong>1.846</strong><small>Dari 8 sheet produk + aturan khusus</small></div><div><span>Siap diimpor</span><strong className="green-text">1.890</strong><small>Setelah varian tindakan dibuat</small></div><div><span>Perlu diperiksa</span><strong className="orange-text">445</strong><small>Masuk sebagai Draft</small></div><div><span>Duplikat digabung</span><strong>18</strong><small>Tetap tercatat di riwayat</small></div></div><div className="validation-panel"><div className="validation-head"><div><h3>Ringkasan validasi</h3><p>Review sebelum melanjutkan ke staging.</p></div><span className="status-badge green"><Check size={13} /> Valid</span></div><div className="validation-row"><CheckCircle2 size={17} /><div><strong>Kolom wajib terbaca</strong><small>Judul, produk, kategori, kondisi, dan tindakan ditemukan.</small></div><span>OK</span></div><div className="validation-row warning"><ClipboardCheck size={17} /><div><strong>445 artikel perlu diperiksa</strong><small>Mayoritas karena kondisi atau langkah agent belum lengkap.</small></div><button className="link-button">Lihat daftar <ArrowRight size={14} /></button></div><div className="validation-row"><CheckCircle2 size={17} /><div><strong>Produk arsip dilewati</strong><small>Sheet tersembunyi tidak masuk ke data staging.</small></div><span>OK</span></div></div><div className="result-actions"><button className="outline-button" onClick={onBack}>Batalkan</button><button className="primary-button" onClick={onBack}>Masukkan ke staging <ArrowRight size={16} /></button></div></div>; }

function AdminReview() { return <div className="content-wrap admin-page review-page"><div className="page-intro"><div><span className="eyebrow muted">Quality queue</span><h1>Perlu diperiksa</h1><p>Prioritaskan artikel yang belum lengkap sebelum diterbitkan ke Agent.</p></div><span className="secure-tag orange"><ClipboardCheck size={14} /> 445 artikel</span></div><div className="review-banner"><span><Sparkles size={19} /></span><div><strong>Mulai dari yang paling berdampak</strong><p>Artikel dengan banyak dibuka dan memiliki kondisi kosong akan berada di urutan teratas.</p></div><button className="primary-button">Mulai review <ArrowRight size={16} /></button></div><section className="admin-panel"><div className="table-toolbar"><div><h2>Queue review</h2><p>Diurutkan berdasarkan prioritas penggunaan.</p></div><button className="outline-button small"><Filter size={15} /> Filter</button></div><div className="review-list"><ReviewItem title="Pelanggan mengeluhkan pembayaran belum masuk" detail="Akulaku Paylater · Kondisi pelanggan kosong" priority="Tinggi" /><ReviewItem title="Informasi terkait akun" detail="General · Langkah agent belum lengkap" priority="Sedang" /><ReviewItem title="Kontak platform eksternal" detail="Other App Contact · Perlu verifikasi sumber" priority="Sedang" /></div></section></div>; }

function ReviewItem({ title, detail, priority }: { title: string; detail: string; priority: string }) { return <div className="review-item"><span className={`priority-dot ${priority === "Tinggi" ? "high" : "medium"}`} /><div><strong>{title}</strong><small>{detail}</small></div><span className={`priority-label ${priority === "Tinggi" ? "high" : "medium"}`}>{priority}</span><button className="outline-button small">Buka <ArrowRight size={14} /></button></div>; }
