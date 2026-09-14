"use client";

import { useAuth } from "@/lib/auth";
import { adminApi, ApiError } from "@/lib/api";
import { useEffect, useState, useCallback } from "react";
import Pagination from "@/components/Pagination";
import Topbar from "@/components/Topbar";
import { Modal, Btn, Notice, Field, inputClass } from "@/components/ui";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface Participant {
  id: string;
  fullName: string;
  avatarUrl?: string | null;
  avatarColor?: string | null;
}

interface Thread {
  id: string;
  listing: { id: string; title: string } | null;
  participants: Participant[];
  messageCount: number;
  lastMessage: { text: string; kind: string; createdAt: string } | null;
  updatedAt: string;
  frozenAt: string | null;
  frozenReason: string | null;
}

interface Paged<T> {
  total: number;
  page: number;
  pageSize: number;
  items: T[];
}

interface UserRow extends Participant {
  email?: string | null;
  phone: string;
  isOwner: boolean;
  isAdmin: boolean;
  isSupport: boolean;
  threadCount: number;
  lastActivity: string | null;
}

interface Message {
  id: string;
  text: string | null;
  kind: "TEXT" | "IMAGE" | "VOICE" | (string & {});
  mediaUrl: string | null;
  createdAt: string;
  deletedAt: string | null;
  deletedBy?: string | null;
  deleteReason: string | null;
  sender: { id: string; fullName: string; avatarColor?: string | null };
}

interface NoticeState {
  kind: "success" | "danger";
  text: string;
}

const errMsg = (e: unknown, fallback: string) =>
  e instanceof ApiError ? e.message || fallback : e instanceof Error ? e.message || fallback : fallback;

type Mode = "byUser" | "all";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function timeAgo(d: string | null) {
  if (!d) return "—";
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} h`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} j`;
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

function Avatar({ p, size = 9 }: { p: Participant; size?: 7 | 8 | 9 }) {
  const cls = { 7: "w-7 h-7 text-[10px]", 8: "w-8 h-8 text-[11px]", 9: "w-9 h-9 text-xs" }[size];
  if (p.avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={p.avatarUrl} alt="" className={`${cls} rounded-full object-cover shrink-0 bg-line`} />;
  }
  return (
    <span
      className={`${cls} rounded-full grid place-items-center text-white font-bold shrink-0`}
      style={{ background: p.avatarColor || "#3A4FF0" }}
    >
      {p.fullName?.slice(0, 2).toUpperCase()}
    </span>
  );
}

const roleBadge = (u: UserRow) =>
  u.isSupport ? { t: "Support", c: "bg-violet/15 text-violet" }
  : u.isAdmin ? { t: "Admin", c: "bg-danger/12 text-danger" }
  : u.isOwner ? { t: "Propriétaire", c: "bg-accent/12 text-accent" }
  : { t: "Visiteur", c: "bg-primary-light text-primary-text" };

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function ThreadsPage() {
  const { token } = useAuth();
  const [mode, setMode] = useState<Mode>("byUser");
  const [query, setQuery] = useState("");

  // by-user mode
  const [users, setUsers] = useState<Paged<UserRow> | null>(null);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [userPage, setUserPage] = useState(0);
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);

  // threads (either the selected user's, or all)
  const [threads, setThreads] = useState<Paged<Thread> | null>(null);
  const [threadPage, setThreadPage] = useState(0);

  // messages
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[] | null>(null);

  // moderation
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [freezeOpen, setFreezeOpen] = useState(false);
  const [freezeReason, setFreezeReason] = useState("");
  const [freezeBusy, setFreezeBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Message | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Feedback fades on its own so a stale message doesn't linger over the list.
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  /* ---- loaders ---------------------------------------------------- */

  const loadUsers = useCallback(() => {
    if (!token || mode !== "byUser") return;
    setUsersError(null);
    adminApi<Paged<UserRow>>("/threads/by-user", token, {
      params: { page: userPage, query, pageSize: 30 },
    })
      .then(setUsers)
      .catch((e: { status?: number; message?: string }) => {
        // A 404 here means the backend behind this admin predates the
        // endpoint — say so instead of spinning forever.
        setUsersError(
          e?.status === 404
            ? "Le serveur connecté n'a pas encore la route /threads/by-user (déployez le backend)."
            : e?.message || "Impossible de charger les utilisateurs.",
        );
      });
  }, [token, mode, userPage, query]);

  const loadThreads = useCallback(() => {
    if (!token) return;
    if (mode === "byUser" && !selectedUser) {
      setThreads(null);
      return;
    }
    adminApi<Paged<Thread>>("/threads", token, {
      params: {
        page: threadPage,
        pageSize: 30,
        userId: mode === "byUser" ? selectedUser?.id : undefined,
        query: mode === "all" ? query : undefined,
      },
    })
      .then(setThreads)
      .catch(console.error);
  }, [token, mode, selectedUser, threadPage, query]);

  useEffect(() => { loadUsers(); }, [loadUsers]);
  useEffect(() => { loadThreads(); }, [loadThreads]);

  // Reset the drill-down when the mode or search changes.
  useEffect(() => {
    setSelectedUser(null);
    setSelectedThread(null);
    setMessages(null);
    setNotice(null);
    setUserPage(0);
    setThreadPage(0);
  }, [mode, query]);

  async function openThread(t: Thread) {
    if (!token) return;
    setSelectedThread(t);
    setMessages(null);
    setNotice(null);
    const res = await adminApi<{ items: Message[] }>(`/threads/${t.id}/messages`, token);
    setMessages(res.items);
  }

  function closeThread() {
    setSelectedThread(null);
    setMessages(null);
    setNotice(null);
  }

  /** Patch one thread both in the open pane and in the list, without a reload. */
  function patchThread(id: string, patch: Partial<Thread>) {
    setSelectedThread((prev) => (prev && prev.id === id ? { ...prev, ...patch } : prev));
    setThreads((prev) =>
      prev ? { ...prev, items: prev.items.map((t) => (t.id === id ? { ...t, ...patch } : t)) } : prev,
    );
  }

  async function setFrozen(frozen: boolean, reason?: string) {
    if (!token || !selectedThread) return;
    const id = selectedThread.id;
    setFreezeBusy(true);
    try {
      const res = await adminApi<Partial<Pick<Thread, "frozenAt" | "frozenReason">> | undefined>(
        `/moderation/threads/${id}/freeze`,
        token,
        { method: "POST", body: frozen ? { frozen, reason: reason || undefined } : { frozen } },
      );
      patchThread(
        id,
        frozen
          ? {
              frozenAt: res?.frozenAt ?? new Date().toISOString(),
              frozenReason: res?.frozenReason !== undefined ? res.frozenReason : reason || null,
            }
          : { frozenAt: null, frozenReason: null },
      );
      setNotice({
        kind: "success",
        text: frozen ? "Conversation gelée : plus aucun nouveau message ne sera accepté." : "Conversation dégelée.",
      });
      setFreezeOpen(false);
      setFreezeReason("");
    } catch (e) {
      setFreezeOpen(false);
      setNotice({ kind: "danger", text: errMsg(e, frozen ? "Impossible de geler la conversation." : "Impossible de dégeler la conversation.") });
    } finally {
      setFreezeBusy(false);
    }
  }

  async function deleteMessage() {
    if (!token || !deleteTarget) return;
    const target = deleteTarget;
    const reason = deleteReason.trim();
    setDeleteBusy(true);
    try {
      await adminApi(`/moderation/messages/${target.id}`, token, {
        method: "DELETE",
        body: reason ? { reason } : {},
      });
      const now = new Date().toISOString();
      setMessages((prev) =>
        prev ? prev.map((m) => (m.id === target.id ? { ...m, deletedAt: now, deleteReason: reason || null } : m)) : prev,
      );
      setNotice({ kind: "success", text: "Message supprimé." });
      setDeleteTarget(null);
      setDeleteReason("");
    } catch (e) {
      setDeleteTarget(null);
      setNotice({ kind: "danger", text: errMsg(e, "Impossible de supprimer le message.") });
    } finally {
      setDeleteBusy(false);
    }
  }

  function pickUser(u: UserRow) {
    setSelectedUser(u);
    setSelectedThread(null);
    setMessages(null);
    setThreadPage(0);
  }

  /** The other people in a thread, from the selected user's point of view. */
  const others = (t: Thread) =>
    selectedUser ? t.participants.filter((p) => p.id !== selectedUser.id) : t.participants;

  /* ---- render ----------------------------------------------------- */

  return (
    <>
      <Topbar
        title="Conversations"
        pill={threads ? `${threads.total.toLocaleString("fr-FR")} conversation${threads.total > 1 ? "s" : ""}` : undefined}
        actions={
          <div className="flex items-center gap-1 bg-card border border-line rounded-xl p-1">
            <ModeBtn active={mode === "byUser"} onClick={() => setMode("byUser")}>Par utilisateur</ModeBtn>
            <ModeBtn active={mode === "all"} onClick={() => setMode("all")}>Toutes</ModeBtn>
          </div>
        }
      />

      <div className="mb-5">
        <input
          type="text"
          placeholder={mode === "byUser" ? "Rechercher un utilisateur (nom, email, téléphone)…" : "Rechercher (annonce, participant, téléphone)…"}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-96 max-w-full px-4 py-2.5 rounded-xl border border-line bg-card text-sm text-fg placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      <div
        className={`grid gap-5 grid-cols-1 ${
          mode === "byUser"
            ? selectedThread
              ? "lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_380px]"
              : "lg:grid-cols-[300px_minmax(0,1fr)]"
            : selectedThread
              ? "xl:grid-cols-[minmax(0,1fr)_380px]"
              : ""
        }`}
      >
        {/* ---- users column ------------------------------------------- */}
        {mode === "byUser" && (
          <Column title="Utilisateurs" meta={users ? `${users.total}` : undefined}>
            {usersError ? (
              <p className="text-[12px] text-danger px-4 py-6">{usersError}</p>
            ) : !users ? (
              <Empty>Chargement…</Empty>
            ) : users.items.length === 0 ? (
              <Empty>Aucun utilisateur avec une conversation.</Empty>
            ) : (
              <ul className="divide-y divide-line">
                {users.items.map((u) => {
                  const active = selectedUser?.id === u.id;
                  const rb = roleBadge(u);
                  return (
                    <li key={u.id}>
                      <button
                        onClick={() => pickUser(u)}
                        className={`w-full text-left px-4 py-3 flex items-center gap-3 transition cursor-pointer ${
                          active ? "bg-primary-light" : "hover:bg-line/40"
                        }`}
                      >
                        <Avatar p={u} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className={`text-[13px] font-semibold truncate ${active ? "text-primary-text" : "text-fg"}`}>
                              {u.fullName}
                            </span>
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md shrink-0 ${rb.c}`}>{rb.t}</span>
                          </span>
                          <span className="block text-[11px] text-muted truncate">{u.email || u.phone}</span>
                        </span>
                        <span className="text-right shrink-0">
                          <span className="block text-[12px] font-semibold text-fg tabular-nums">{u.threadCount}</span>
                          <span className="block text-[10px] text-muted">{timeAgo(u.lastActivity)}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {users && users.total > users.pageSize && (
              <div className="px-3 pb-2">
                <Pagination page={users.page} pageSize={users.pageSize} total={users.total} onPageChange={setUserPage} />
              </div>
            )}
          </Column>
        )}

        {/* ---- threads column ----------------------------------------- */}
        <Column
          title={
            mode === "byUser"
              ? selectedUser
                ? `Conversations de ${selectedUser.fullName}`
                : "Conversations"
              : "Toutes les conversations"
          }
          meta={threads ? `${threads.total}` : undefined}
        >
          {mode === "byUser" && !selectedUser ? (
            <Empty>Choisissez un utilisateur pour voir ses conversations.</Empty>
          ) : !threads ? (
            <Empty>Chargement…</Empty>
          ) : threads.items.length === 0 ? (
            <Empty>Aucune conversation.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {threads.items.map((t) => {
                const active = selectedThread?.id === t.id;
                const peers = others(t);
                return (
                  <li key={t.id}>
                    <button
                      onClick={() => openThread(t)}
                      className={`w-full text-left px-4 py-3.5 transition cursor-pointer ${
                        active ? "bg-primary-light" : "hover:bg-line/40"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex -space-x-2 shrink-0 mt-0.5">
                          {(peers.length ? peers : t.participants).slice(0, 2).map((p) => (
                            <span key={p.id} className="ring-2 ring-card rounded-full"><Avatar p={p} size={8} /></span>
                          ))}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <p className={`text-[13px] font-semibold truncate ${active ? "text-primary-text" : "text-fg"}`}>
                              {peers.length ? peers.map((p) => p.fullName).join(", ") : t.participants.map((p) => p.fullName).join(", ")}
                            </p>
                            {t.frozenAt && (
                              <span
                                title={t.frozenReason ? `Gelée : ${t.frozenReason}` : "Conversation gelée"}
                                className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md shrink-0 self-center bg-warning/15 text-warning"
                              >
                                <LockIcon className="w-2.5 h-2.5" />
                                Gelée
                              </span>
                            )}
                            <span className="ml-auto text-[11px] text-muted shrink-0">{timeAgo(t.updatedAt)}</span>
                          </div>
                          <p className="text-[11.5px] text-muted truncate">
                            {t.listing ? <span className="text-fg/80">{t.listing.title}</span> : <span className="italic">Sans annonce</span>}
                            {mode === "all" && (
                              <span> · {t.participants.map((p) => p.fullName).join(" ↔ ")}</span>
                            )}
                          </p>
                          {t.lastMessage && (
                            <p className="text-[12px] text-muted truncate mt-1">
                              {t.lastMessage.kind !== "TEXT" && t.lastMessage.kind ? `[${t.lastMessage.kind.toLowerCase()}] ` : ""}
                              {t.lastMessage.text}
                            </p>
                          )}
                          <span className="text-[10.5px] text-muted/80 mt-1 block">{t.messageCount} message{t.messageCount > 1 ? "s" : ""}</span>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {threads && threads.total > threads.pageSize && (
            <div className="px-3 pb-2">
              <Pagination page={threads.page} pageSize={threads.pageSize} total={threads.total} onPageChange={setThreadPage} />
            </div>
          )}
        </Column>

        {/* ---- messages column ---------------------------------------- */}
        {selectedThread && (
          <Column
            title="Messages"
            meta={selectedThread.participants.map((p) => p.fullName).join(" ↔ ")}
            right={
              <span className="flex items-center gap-3">
                {selectedThread.frozenAt ? (
                  <button
                    onClick={() => setFrozen(false)}
                    disabled={freezeBusy}
                    className="inline-flex items-center gap-1 text-[12px] font-semibold px-2 py-1 rounded-lg bg-success/12 text-success hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition"
                  >
                    {freezeBusy ? "…" : "Dégeler"}
                  </button>
                ) : (
                  <button
                    onClick={() => { setFreezeReason(""); setFreezeOpen(true); }}
                    disabled={freezeBusy}
                    className="inline-flex items-center gap-1 text-[12px] font-semibold px-2 py-1 rounded-lg bg-warning/15 text-warning hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition"
                  >
                    <LockIcon className="w-3 h-3" />
                    Geler
                  </button>
                )}
                <button onClick={closeThread} className="text-[12px] text-muted hover:text-fg cursor-pointer">
                  Fermer
                </button>
              </span>
            }
            className="max-h-[calc(100vh-11rem)]"
          >
            {notice && (
              <div className="px-4 pt-3 shrink-0">
                <Notice kind={notice.kind}>{notice.text}</Notice>
              </div>
            )}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {selectedThread.frozenAt && (
                <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 bg-warning/15 text-warning">
                  <LockIcon className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold">Conversation gelée</p>
                    <p className="text-[11.5px] opacity-90 break-words">
                      {selectedThread.frozenReason || "Aucune raison indiquée."}
                      <span className="opacity-75"> · depuis le {new Date(selectedThread.frozenAt).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                    </p>
                  </div>
                </div>
              )}
              {messages === null ? (
                <Empty>Chargement…</Empty>
              ) : messages.length === 0 ? (
                <Empty>Aucun message.</Empty>
              ) : (
                messages.map((m) => {
                  const deleted = !!m.deletedAt;
                  return (
                    <div key={m.id} className="group relative">
                      <div className="flex items-center gap-2 mb-0.5">
                        <Avatar p={{ id: m.sender.id, fullName: m.sender.fullName, avatarColor: m.sender.avatarColor }} size={7} />
                        <span className="text-[12px] font-semibold text-fg">{m.sender.fullName}</span>
                        <span className="text-[10px] text-muted">
                          {new Date(m.createdAt).toLocaleString("fr-FR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })}
                        </span>
                        {!deleted && (
                          <button
                            onClick={() => { setDeleteReason(""); setDeleteTarget(m); }}
                            title="Supprimer ce message"
                            aria-label="Supprimer ce message"
                            className="ml-auto p-1 rounded-md text-muted hover:text-danger hover:bg-danger/12 opacity-0 group-hover:opacity-100 focus:opacity-100 transition cursor-pointer"
                          >
                            <TrashIcon className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <div className={`ml-9 ${deleted ? "opacity-50 line-through" : ""}`}>
                        <MessageBody m={m} />
                      </div>
                      {deleted && (
                        <p className="ml-9 mt-0.5 text-[11px] text-danger">
                          Supprimé par un modérateur{m.deleteReason ? ` — ${m.deleteReason}` : ""}
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </Column>
        )}
      </div>

      {/* ---- freeze dialog -------------------------------------------- */}
      <Modal open={freezeOpen} onClose={() => !freezeBusy && setFreezeOpen(false)} title="Geler la conversation">
        <p className="text-[13px] text-muted mb-4">
          Les participants ne pourront plus envoyer de nouveaux messages tant que la conversation reste gelée.
        </p>
        <Field label="Raison (facultatif)">
          <textarea
            value={freezeReason}
            onChange={(e) => setFreezeReason(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Ex. : signalement pour arnaque"
            className={`${inputClass} text-fg resize-none`}
          />
        </Field>
        <div className="flex gap-2 mt-5">
          <Btn variant="warning" onClick={() => setFrozen(true, freezeReason.trim())} disabled={freezeBusy}>
            {freezeBusy ? "…" : "Geler"}
          </Btn>
          <CancelBtn onClick={() => setFreezeOpen(false)} disabled={freezeBusy} />
        </div>
      </Modal>

      {/* ---- delete-message dialog ------------------------------------ */}
      <Modal
        open={!!deleteTarget}
        onClose={() => !deleteBusy && setDeleteTarget(null)}
        title="Supprimer le message"
      >
        {deleteTarget && (
          <div className="rounded-xl border border-line bg-line/40 px-3 py-2 mb-4">
            <p className="text-[11px] text-muted mb-0.5">{deleteTarget.sender.fullName}</p>
            <p className="text-[13px] text-fg whitespace-pre-wrap break-words line-clamp-4">
              {deleteTarget.text || <span className="italic text-muted">[{deleteTarget.kind?.toLowerCase()}]</span>}
            </p>
          </div>
        )}
        <Field label="Raison (facultatif)">
          <textarea
            value={deleteReason}
            onChange={(e) => setDeleteReason(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Ex. : contenu injurieux"
            className={`${inputClass} text-fg resize-none`}
          />
        </Field>
        <div className="flex gap-2 mt-5">
          <Btn variant="danger" onClick={deleteMessage} disabled={deleteBusy}>
            {deleteBusy ? "…" : "Supprimer le message"}
          </Btn>
          <CancelBtn onClick={() => setDeleteTarget(null)} disabled={deleteBusy} />
        </div>
      </Modal>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Local building blocks                                               */
/* ------------------------------------------------------------------ */

function Column({
  title,
  meta,
  right,
  className = "",
  children,
}: {
  title: string;
  meta?: string;
  right?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`bg-card rounded-2xl border border-line shadow-[var(--shadow-card)] overflow-hidden flex flex-col min-h-[16rem] ${className}`}>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-line shrink-0">
        <h2 className="text-[13px] font-semibold text-fg truncate">{title}</h2>
        {meta && <span className="text-[11px] text-muted truncate">{meta}</span>}
        <span className="ml-auto shrink-0">{right}</span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">{children}</div>
    </div>
  );
}

function ModeBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition cursor-pointer ${
        active ? "bg-primary text-white" : "text-muted hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[12px] text-muted text-center px-4 py-10">{children}</p>;
}

/** Message content: text as-is, image thumbnail, compact voice player, or `[kind]`. */
function MessageBody({ m }: { m: Message }) {
  const caption = m.text ? (
    <p className="text-[13px] text-fg whitespace-pre-wrap break-words">{m.text}</p>
  ) : null;

  if (m.kind === "IMAGE" && m.mediaUrl) {
    return (
      <div className="space-y-1">
        <a href={m.mediaUrl} target="_blank" rel="noopener noreferrer" className="inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={m.mediaUrl}
            alt="Image envoyée"
            loading="lazy"
            className="max-h-40 max-w-[220px] rounded-lg border border-line object-cover bg-line/40 hover:opacity-90 transition"
          />
        </a>
        {caption}
      </div>
    );
  }

  if (m.kind === "VOICE" && m.mediaUrl) {
    return (
      <div className="space-y-1">
        <audio controls preload="none" src={m.mediaUrl} className="h-9 w-full max-w-[260px]" />
        {caption}
      </div>
    );
  }

  return caption ?? (
    <p className="text-[13px] italic text-muted">[{m.kind?.toLowerCase()}]</p>
  );
}

function CancelBtn({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="ml-auto px-4 py-2 text-sm rounded-xl border border-line text-fg hover:bg-line/40 font-medium transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
    >
      Annuler
    </button>
  );
}

function LockIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function TrashIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}
