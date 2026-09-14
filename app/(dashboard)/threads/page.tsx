"use client";

import { useAuth } from "@/lib/auth";
import { adminApi } from "@/lib/api";
import { useEffect, useState, useCallback } from "react";
import Pagination from "@/components/Pagination";
import Topbar from "@/components/Topbar";

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
  text: string;
  kind: string;
  createdAt: string;
  sender: { id: string; fullName: string; avatarColor?: string | null };
}

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
    setUserPage(0);
    setThreadPage(0);
  }, [mode, query]);

  async function openThread(t: Thread) {
    if (!token) return;
    setSelectedThread(t);
    setMessages(null);
    const res = await adminApi<{ items: Message[] }>(`/threads/${t.id}/messages`, token);
    setMessages(res.items);
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
              <button onClick={() => { setSelectedThread(null); setMessages(null); }} className="text-[12px] text-muted hover:text-fg cursor-pointer">
                Fermer
              </button>
            }
            className="max-h-[calc(100vh-11rem)]"
          >
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages === null ? (
                <Empty>Chargement…</Empty>
              ) : messages.length === 0 ? (
                <Empty>Aucun message.</Empty>
              ) : (
                messages.map((m) => (
                  <div key={m.id}>
                    <div className="flex items-center gap-2 mb-0.5">
                      <Avatar p={{ id: m.sender.id, fullName: m.sender.fullName, avatarColor: m.sender.avatarColor }} size={7} />
                      <span className="text-[12px] font-semibold text-fg">{m.sender.fullName}</span>
                      <span className="text-[10px] text-muted">
                        {new Date(m.createdAt).toLocaleString("fr-FR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })}
                      </span>
                    </div>
                    <p className="text-[13px] text-fg ml-9 whitespace-pre-wrap break-words">
                      {m.text || <span className="italic text-muted">[{m.kind?.toLowerCase()}]</span>}
                    </p>
                  </div>
                ))
              )}
            </div>
          </Column>
        )}
      </div>
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
