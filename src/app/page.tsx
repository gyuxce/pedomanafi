"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { Guide } from "@/lib/mock-data";
import type { ImportResult, ImportSummary } from "@/lib/excel-importer";
import type { Announcement, AnnouncementTone, GuideFeedbackInput, GuideFeedbackRecord } from "@/lib/ops-types";
import { deleteAnnouncement, loadAdminGuides, loadAnnouncements, loadGuideFeedback, loadPublishedGuides, roleFromUser, saveAnnouncement, saveGuideFeedback, saveImportToDatabase, updateScenarioInDatabase, type SaveImportResult } from "@/lib/ekb-repository";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { LoginScreen } from "@/components/login-screen";
import { AgentWorkspace } from "@/components/agent-workspace";
import { AdminConsole } from "@/components/admin-console";

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
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [announcementsLocalOnly, setAnnouncementsLocalOnly] = useState(false);
  const [feedbackItems, setFeedbackItems] = useState<GuideFeedbackRecord[]>([]);
  const [feedbackLocalOnly, setFeedbackLocalOnly] = useState(false);
  const { importedGuides, importSummary } = { importedGuides: importState.guides, importSummary: importState.summary };

  useEffect(() => {
    if (!supabase) return;
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
    if (!supabase || !user?.id) return;
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
    if (!supabase || !user?.id || roleFromUser(user) !== "admin") return;
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

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    const publishedOnly = roleFromUser(user) !== "admin";
    void loadAnnouncements(supabase, publishedOnly).then((result) => {
      if (!active) return;
      setAnnouncements(result.items);
      setAnnouncementsLocalOnly(result.localOnly);
    }).catch(() => {
      if (active) setAnnouncements([]);
    });
    if (roleFromUser(user) === "admin") {
      void loadGuideFeedback(supabase).then((result) => {
        if (!active) return;
        setFeedbackItems(result.items);
        setFeedbackLocalOnly(result.localOnly);
      }).catch(() => {
        if (active) setFeedbackItems([]);
      });
    }
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
    }
  }

  async function signOut() {
    if (supabase && user) await supabase.auth.signOut();
    setUser(null);
  }

  async function persistImport(result: ImportResult): Promise<SaveImportResult | void> {
    const previous = adminGuides.length ? adminGuides : importedGuides;
    saveImport(result);
    if (supabase && user && roleFromUser(user) === "admin") {
      const saved = await saveImportToDatabase(supabase, result, user, previous);
      if (!saved.skipped) await refreshAdminGuides();
      return saved;
    }
  }

  async function saveScenario(guide: Guide, publish: boolean) {
    if (!supabase || !user || roleFromUser(user) !== "admin") {
      throw new Error("Edit dan Publish hanya tersedia untuk Admin yang terhubung ke database.");
    }
    await updateScenarioInDatabase(supabase, guide, user, publish);
    await refreshAdminGuides();
  }

  async function persistAnnouncement(draft: { id?: string; title: string; detail: string; tone: AnnouncementTone; published: boolean }) {
    const result = await saveAnnouncement(supabase, user, draft);
    setAnnouncementsLocalOnly(result.localOnly);
    const loaded = await loadAnnouncements(supabase, false);
    setAnnouncements(loaded.items);
    setAnnouncementsLocalOnly(loaded.localOnly || result.localOnly);
  }

  async function removeAnnouncement(id: string) {
    const result = await deleteAnnouncement(supabase, id);
    setAnnouncementsLocalOnly(result.localOnly);
    const loaded = await loadAnnouncements(supabase, false);
    setAnnouncements(loaded.items);
  }

  async function persistFeedback(input: GuideFeedbackInput) {
    const result = await saveGuideFeedback(supabase, user, input);
    if (roleFromUser(user) === "admin") {
      setFeedbackItems((current) => [result.item, ...current]);
      setFeedbackLocalOnly(result.localOnly);
    }
  }

  if (!authReady || !user) return <LoginScreen onSignIn={signIn} authError={authError} authBusy={authBusy} />;

  const role = roleFromUser(user);
  const agentStagingGuides = importedGuides.filter((guide) => guide.status === "Published");
  const publishedAnnouncements = announcements.filter((item) => item.published);
  return role === "admin"
    ? <AdminConsole
        importedGuides={adminGuides.length ? adminGuides : importedGuides}
        importSummary={importSummary}
        onImport={persistImport}
        onSaveScenario={saveScenario}
        announcements={announcements}
        announcementsLocalOnly={announcementsLocalOnly}
        onSaveAnnouncement={persistAnnouncement}
        onDeleteAnnouncement={removeAnnouncement}
        feedbackItems={feedbackItems}
        feedbackLocalOnly={feedbackLocalOnly}
        onSignOut={signOut}
      />
    : <AgentWorkspace
        importedGuides={agentStagingGuides}
        publishedGuides={publishedGuides}
        guidesLoading={guidesLoading}
        guidesError={guidesError}
        announcements={publishedAnnouncements}
        onSubmitFeedback={persistFeedback}
        onSignOut={signOut}
      />;
}
