"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { adminApi, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import Pagination from "@/components/Pagination";
import { Badge, Card, Notice, SearchInput, Spinner, fmtDate } from "@/components/ui";

/**
 * The support inbox.
 *
 * Users write to "Support Mobly" from the Help Center; this is where those
 * conversations are read and answered. Replies go out as the shared support
 * identity, so the user always sees one consistent contact — the audit log
 * records which admin actually typed each one.
 */

interface SupportUser {
  id: string; fullName: string; phone: string; email?: string | null;
  avatarColor?: string | null; isOwner: boolean; identityVerified: boolean;
  isActive: boolean; online?: boolean; city?: string | null; createdAt?: string;
}

interface ThreadRow {
  id: string;
  user: SupportUser | null;
  unread: number;
  messageCount: number;
  lastMessage: { text: string; createdAt: string; senderId: string } | null;
  frozenAt?: string | null;
  updatedAt: string;
}

interface Message {
  id: string; senderId: string; text: string; kind: string;
  createdAt: string; deletedAt?: string | null;
  sender?: { id: string; fullName: string; avatarColor?: string | null };
}

export default function SupportPage() {
  const { token } = useAuth();
  const [list, setList] = useState<{ items: ThreadRow[]; total: number; page: number; pageSize: number } | null>(null);
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const [openId, setOpenId] = useState<string | null>(null);
  const [thread, setThread] = useState<{ items: Message[]; user: SupportUser | null; supportUserId: string } | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  const loadList = useCallback(() => {
    if (!token) return;
    adminApi<typeof list>("/support/threads", token, {
      params: { page, pageSize: 25, query, unread: filter },
    })
      .then(setList)
      .catch((e) => setError(String(e.message)));
  }, [token, page, query, filter]);

  useEffect(() => { loadList(); }, [loadList]);

  // Poll the list so a question arriving while the tab is open surfaces
  // without the agent having to refresh. Slow enough not to fight the API.
  useEffect(() => {
    const t = setInterval(loadList, 15000);
    return () => clearInterval(t);
  }, [loadList]);

  // Deliberately does NOT depend on `loadList`. It used to call it directly,
  // which chained the two callbacks together and re-fired the list fetch on
  // every transcript load — a refetch loop visible in the network panel.
  const loadThread = useCallback((id: string) => {
    if (!token) return;
    adminApi<{ items: Message[]; user: SupportUser | null; supportUserId: string }>(
      `/support/threads/${id}`, token,
    )
      .then((d) => {
        setThread(d);
        requestAnimationFrame(() => bottom.current?.scrollIntoView({ behavior: "auto" }));
      })
      .catch((e) => setError(String(e.message)));
  }, [token]);

  useEffect(() => {
    if (!openId) { setThread(null); return; }
    loadThread(openId);
    // Opening clears the unread counter server-side, so pull the list once
    // more to drop the badge.
    loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, loadThread]);

  async function reply() {
    const text = draft.trim();
    if (!token || !openId || !text) return;
    setSending(true); setError("");
    try {
      const sent = await adminApi<{ message: Message }>(
        `/support/threads/${openId}/messages`, token,
        { method: "POST", body: { text } },
      );
      setDraft("");
      // Append what the server actually stored rather than refetching. The
      // refetch was the bug: it resolved against a stale closure and the new
      // message never appeared, even though it had been saved and delivered.
      setThread((t) => (t ? { ...t, items: [...t.items, sent.message] } : t));
      requestAnimationFrame(() => bottom.current?.scrollIntoView({ behavior: "smooth" }));
      loadList();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-dark mb-1">Support</h1>
      <p className="text-sm text-text mb-6">
        Les conversations ouvertes depuis le Centre d&apos;aide de l&apos;application.
        Vos réponses partent au nom de « Support Mobly ».
      </p>

      {error && <div className="mb-4"><Notice kind="danger">{error}</Notice></div>}

      <div className="flex items-center gap-3 mb-4">
        <SearchInput
          value={query}
          onChange={(v) => { setQuery(v); setPage(0); }}
          placeholder="Nom, téléphone ou e-mail"
        />
        <div className="flex gap-1">
          {(["all", "unread"] as const).map((f) => (
            <button
              key={f}
              onClick={() => { setFilter(f); setPage(0); }}
              className={`px-3 py-2 rounded-xl text-sm font-medium transition cursor-pointer ${
                filter === f ? "bg-primary text-white" : "bg-white border border-border text-text hover:bg-surface"
              }`}
            >
              {f === "all" ? "Toutes" : "Non lues"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-4 items-start">
        {/* Conversations */}
        <Card className="flex-1 min-w-0">
          {!list ? (
            <div className="flex justify-center py-16"><Spinner /></div>
          ) : list.items.length === 0 ? (
            <p className="text-sm text-text p-6">
              Aucune conversation. Les demandes arrivent ici dès qu&apos;un utilisateur
              touche « Contacter le support » dans l&apos;application.
            </p>
          ) : (
            <>
              <div className="divide-y divide-border/30">
                {list.items.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setOpenId(t.id)}
                    className={`w-full text-left px-5 py-3 flex items-center gap-3 transition cursor-pointer ${
                      openId === t.id ? "bg-primary/5" : "hover:bg-surface/40"
                    }`}
                  >
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                      style={{ background: t.user?.avatarColor || "#3A4FF0" }}
                    >
                      {t.user?.fullName?.slice(0, 2).toUpperCase() ?? "??"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-dark truncate">
                          {t.user?.fullName ?? "Utilisateur supprimé"}
                        </span>
                        {t.user?.online && <Badge variant="success">En ligne</Badge>}
                        {t.unread > 0 && <Badge variant="danger">{t.unread}</Badge>}
                        {t.frozenAt && <Badge variant="warning">Gelée</Badge>}
                      </div>
                      <p className="text-xs text-text truncate">
                        {t.lastMessage?.text || "—"}
                      </p>
                    </div>
                    <span className="text-xs text-text whitespace-nowrap shrink-0">
                      {fmtDate(t.updatedAt)}
                    </span>
                  </button>
                ))}
              </div>
              <div className="px-5 pb-4 pt-2">
                <Pagination
                  page={list.page}
                  pageSize={list.pageSize}
                  total={list.total}
                  onPageChange={setPage}
                />
              </div>
            </>
          )}
        </Card>

        {/* Transcript + reply */}
        {openId && (
          <Card className="w-[460px] shrink-0 flex flex-col" >
            <div className="flex items-center gap-3 px-5 py-3 border-b border-border">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-dark truncate">
                  {thread?.user?.fullName ?? "…"}
                </p>
                <p className="text-xs text-text truncate">
                  {thread?.user?.phone}
                  {thread?.user?.email ? ` · ${thread.user.email}` : ""}
                </p>
              </div>
              {thread?.user && (
                <Link
                  href={`/users/${thread.user.id}`}
                  className="text-xs text-primary hover:underline whitespace-nowrap"
                >
                  Voir le profil
                </Link>
              )}
              <button
                onClick={() => setOpenId(null)}
                className="text-xs text-text hover:text-dark cursor-pointer"
              >
                Fermer
              </button>
            </div>

            {thread?.user && (
              <div className="flex flex-wrap gap-1.5 px-5 py-2 border-b border-border/50">
                {thread.user.isActive
                  ? <Badge variant="success">Actif</Badge>
                  : <Badge variant="danger">Suspendu</Badge>}
                {thread.user.identityVerified
                  ? <Badge variant="success">Identité vérifiée</Badge>
                  : <Badge variant="warning">Non vérifiée</Badge>}
                {thread.user.isOwner && <Badge variant="primary">Propriétaire</Badge>}
                {thread.user.city && <Badge variant="neutral">{thread.user.city}</Badge>}
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[52vh] min-h-[240px]">
              {!thread ? (
                <div className="flex justify-center py-10"><Spinner /></div>
              ) : (
                thread.items.map((m) => {
                  const fromSupport = m.senderId === thread.supportUserId;
                  return (
                    <div key={m.id} className={`flex ${fromSupport ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[80%] rounded-2xl px-3.5 py-2 ${
                          fromSupport
                            ? "bg-primary text-white rounded-br-sm"
                            : "bg-surface text-dark rounded-bl-sm"
                        } ${m.deletedAt ? "opacity-50 line-through" : ""}`}
                      >
                        {m.kind !== "TEXT" && (
                          <p className={`text-[10px] uppercase tracking-wide mb-0.5 ${fromSupport ? "text-white/70" : "text-text"}`}>
                            {m.kind}
                          </p>
                        )}
                        <p className="text-sm whitespace-pre-wrap break-words">
                          {m.text || <span className="italic opacity-70">(sans texte)</span>}
                        </p>
                        <p className={`text-[10px] mt-1 ${fromSupport ? "text-white/60" : "text-text"}`}>
                          {fromSupport ? "Support Mobly" : m.sender?.fullName} · {fmtDate(m.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={bottom} />
            </div>

            <div className="border-t border-border p-3">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  // Enter sends, Shift+Enter breaks the line — what an agent
                  // answering dozens of messages expects.
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    reply();
                  }
                }}
                placeholder="Répondre en tant que Support Mobly…"
                rows={3}
                className="w-full px-3 py-2 rounded-xl border border-border bg-surface text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={reply}
                  disabled={!draft.trim() || sending}
                  className="px-4 py-2 text-sm rounded-xl bg-primary text-white font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                >
                  {sending ? "Envoi…" : "Envoyer"}
                </button>
                <span className="text-xs text-text">
                  Entrée pour envoyer · Maj+Entrée pour un retour à la ligne
                </span>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
