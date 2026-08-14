"use client";

import { useState } from "react";
import { ShieldCheck, ArrowRight } from "lucide-react";
import { KoraMark } from "@/components/kora-mark";

export function LoginScreen({ onSignIn, authError, authBusy }: { onSignIn: (email: string, password: string) => Promise<void>; authError: string; authBusy: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return <>
    <main className="login-page">
      <section className="login-shell">
        <div className="login-brand"><span className="brand-mark large"><KoraMark size={23} /></span><div><strong>KORA</strong><span>Knowledge Operations &amp; Resolution Access</span></div></div>
        <div className="login-grid">
          <div className="login-intro"><span className="eyebrow">Product-first knowledge base</span><h1>Jawaban cepat, sesuai <em>kondisi pelanggan.</em></h1><p>Pilih produk, pilih kendala, lalu ikuti pedoman dan tindakan CRM yang tepat untuk Live Chat.</p><div className="login-proof"><div><strong>Produk</strong><span>Struktur berbasis kendala</span></div><div><strong>Pedoman</strong><span>Alur lengkap per kondisi</span></div><div><strong>Live Chat</strong><span>Siap dipakai Agent</span></div></div></div>
          <div className="login-card"><div className="login-card-head"><span className="login-card-icon"><ShieldCheck size={20} /></span><div><h2>Masuk ke KORA</h2><p>Gunakan akun internal kamu.</p></div></div><form onSubmit={(event) => { event.preventDefault(); void onSignIn(email, password); }}><label>Email kerja<input type="email" placeholder="nama@perusahaan.com" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>Password<input type="password" placeholder="Masukkan password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label><button className="primary-button login-button" type="submit">Masuk sebagai Agent <ArrowRight size={16} /></button></form><p className="login-note">Akses mengikuti role akun internal: Agent, Admin, atau Quality.</p></div>
        </div>
      </section>
    </main>
    {authError && <p className="login-error login-error-global">{authError}</p>}
    {authBusy && <span className="login-busy-global">Memeriksa akun...</span>}
  </>;
}
