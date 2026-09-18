"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { adminApi } from "@/lib/api";
import Topbar from "@/components/Topbar";
import Pagination from "@/components/Pagination";
import {
  Btn,
  ConfirmDialog,
  Field,
  Modal,
  Notice,
  Spinner,
  Tabs,
  fmtDate,
  inputClass,
} from "@/components/ui";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface Review {
  id: string;
  listingId: string;
  userId: string;
  subjectId: string | null;
  rating: number;
  text: string | null;
  hiddenAt: string | null;
  hiddenReason: string | null;
  createdAt: string;
  updatedAt: string;
  user: { id: string; fullName: string } | null;
  listing: { id: string; title: string } | null;
}

interface Paged<T> {
  total: number;
  page: number;
  pageSize: number;
  items: T[];
}

type Filter = "all" | "visible" | "hidden";

/** "all" = every review; "received" / "written" = grouped by owner / author. */
type Mode = "all" | "received" | "written";

interface UserRow {
  id: string;
  fullName: string;
  email: string | null;
  phone: string;
  avatarUrl: string | null;
  avatarColor: string | null;
  isOwner: boolean;
  isAdmin: boolean;
  reviewCount: number;
  averageRating: number | null;
  hiddenCount: number;
  lastReviewAt: string;
}

const PAGE_SIZE = 30;

const STAR_PATH =
  "M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z";

const errMsg = (e: unknown, fallback: string) =>
  (e as { message?: string })?.message || fallback;

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function ReviewsPage() {
  const { token } = useAuth();
  const [mode, setMode] = useState<Mode>("received");
  const [filter, setFilter] = useState<Filter>("all");

  // grouped-by-user mode
  const [users, setUsers] = useState<Paged<UserRow> | null>(null);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [usersPage, setUsersPage] = useState(0);
  const [usersQuery, setUsersQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [page, setPage] = useState(0);
  const [data, setData] = useState<Paged<Review> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "danger"; text: string } | null>(null);

  const [hideTarget, setHideTarget] = useState<Review | null>(null);
  const [editTarget, setEditTarget] = useState<Review | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Review | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    // Grouped modes list reviews only once a person is picked.
    if (mode !== "all" && !selectedUser) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    adminApi<Paged<Review>>("/moderation/reviews", token, {
      params: {
        page,
        pageSize: PAGE_SIZE,
        hidden: filter === "hidden" ? "true" : filter === "visible" ? "false" : undefined,
        ownerId: mode === "received" ? selectedUser?.id : undefined,
        userId: mode === "written" ? selectedUser?.id : undefined,
      },
    })
      .then(setData)
      .catch((e) => setError(errMsg(e, "Impossible de charger les avis.")))
      .finally(() => setLoading(false));
  }, [token, page, filter, mode, selectedUser]);

  const loadUsers = useCallback(() => {
    if (!token || mode === "all") return;
    setUsersError(null);
    adminApi<Paged<UserRow>>("/moderation/reviews/by-user", token, {
      params: { side: mode, query: usersQuery, page: usersPage, pageSize: 30 },
    })
      .then(setUsers)
      .catch((e: { status?: number; message?: string }) =>
        setUsersError(
          e?.status === 404
            ? "Le serveur connecté n'a pas encore la route /reviews/by-user (déployez le backend)."
            : errMsg(e, "Impossible de charger les utilisateurs."),
        ),
      );
  }, [token, mode, usersQuery, usersPage]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // Switching between Tous / Reçus / Écrits starts the drill-down over.
  useEffect(() => {
    setSelectedUser(null);
    setUsers(null);
    setUsersPage(0);
    setPage(0);
  }, [mode]);

  // Debounce the users search so each keystroke doesn't refetch.
  const [usersQueryInput, setUsersQueryInput] = useState("");
  useEffect(() => {
    const t = setTimeout(() => {
      setUsersQuery(usersQueryInput.trim());
      setUsersPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [usersQueryInput]);

  // Auto-dismiss notices.
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  /** Runs a write, then shows feedback, reloads and refreshes the listing's average. */
  async function write(review: Review, fn: () => Promise<unknown>, success: string) {
    if (!token) return false;
    setBusy(true);
    try {
      await fn();
      setNotice({ kind: "success", text: success });
      adminApi(`/moderation/listings/${review.listingId}/recompute-rating`, token, {
        method: "POST",
      }).catch(() => {});
      load();
      loadUsers();
      return true;
    } catch (e) {
      setNotice({ kind: "danger", text: errMsg(e, "L'opération a échoué.") });
      return false;
    } finally {
      setBusy(false);
    }
  }

  const patch = (r: Review, body: Record<string, unknown>) =>
    adminApi(`/moderation/reviews/${r.id}`, token!, { method: "PATCH", body });

  async function unhide(r: Review) {
    await write(r, () => patch(r, { hidden: false, hiddenReason: null }), "Avis de nouveau visible.");
  }

  async function confirmHide(reason: string) {
    if (!hideTarget) return;
    const ok = await write(
      hideTarget,
      () => patch(hideTarget, { hidden: true, hiddenReason: reason.trim() || null }),
      "Avis masqué.",
    );
    if (ok) setHideTarget(null);
  }

  async function confirmEdit(changes: { rating?: number; text?: string | null }) {
    if (!editTarget) return;
    if (Object.keys(changes).length === 0) {
      setEditTarget(null);
      return;
    }
    const ok = await write(editTarget, () => patch(editTarget, changes), "Avis modifié.");
    if (ok) setEditTarget(null);
  }

  async function confirmDelete() {
    if (!deleteTarget || !token) return;
    const r = deleteTarget;
    const ok = await write(
      r,
      () => adminApi(`/moderation/reviews/${r.id}`, token, { method: "DELETE" }),
      "Avis supprimé.",
    );
    if (ok) {
      setDeleteTarget(null);
      // Deleting the last row of a page would otherwise leave an empty page.
      if (data && data.items.length === 1 && page > 0) setPage(page - 1);
    }
  }

  function changeFilter(id: string) {
    setFilter(id as Filter);
    setPage(0);
  }

  return (
    <>
      <Topbar
        title="Avis"
        pill={data ? `${data.total.toLocaleString("fr-FR")} avis` : undefined}
        actions={
          <div role="group" aria-label="Vue" className="flex items-center gap-1 bg-card border border-line rounded-xl p-1">
            {([
              ["received", "Reçus"],
              ["written", "Écrits"],
              ["all", "Tous"],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                aria-pressed={mode === id}
                title={id === "received" ? "Avis reçus par propriétaire" : id === "written" ? "Avis écrits par auteur" : "Tous les avis"}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition cursor-pointer ${
                  mode === id ? "bg-primary text-white" : "text-muted hover:text-fg"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        }
      />

      <div className="mb-5">
        <Tabs
          active={filter}
          onChange={changeFilter}
          tabs={[
            { id: "all", label: "Tous" },
            { id: "visible", label: "Visibles" },
            { id: "hidden", label: "Masqués" },
          ]}
        />
      </div>

      {notice && (
        <div className="mb-4">
          <Notice kind={notice.kind}>{notice.text}</Notice>
        </div>
      )}

      <div className={mode === "all" ? "" : "grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] gap-5 items-start"}>
      {mode !== "all" && (
        <UsersColumn
          mode={mode}
          users={users}
          error={usersError}
          query={usersQueryInput}
          onQuery={setUsersQueryInput}
          selectedId={selectedUser?.id ?? null}
          onPick={(u) => { setSelectedUser(u); setPage(0); }}
          onPage={setUsersPage}
        />
      )}
      <div className="bg-card rounded-2xl border border-line shadow-[var(--shadow-card)] overflow-hidden">
        {mode !== "all" && selectedUser && (
          <div className="flex items-center gap-3 px-5 py-3 border-b border-line">
            <UserAvatar u={selectedUser} />
            <div className="min-w-0">
              <Link href={`/users/${selectedUser.id}`} className="text-[13px] font-semibold text-fg hover:underline truncate block">
                {selectedUser.fullName}
              </Link>
              <p className="text-[11px] text-muted">
                {mode === "received" ? "Avis reçus sur ses annonces" : "Avis écrits"} · {selectedUser.reviewCount}
                {selectedUser.averageRating !== null && ` · moyenne ${selectedUser.averageRating.toFixed(1)}/5`}
              </p>
            </div>
          </div>
        )}
        {mode !== "all" && !selectedUser ? (
          <p className="text-sm text-muted text-center px-4 py-14">
            {mode === "received"
              ? "Choisissez un propriétaire pour voir les avis reçus sur ses annonces."
              : "Choisissez un auteur pour voir les avis qu'il a écrits."}
          </p>
        ) : error ? (
          <div className="px-6 py-10 text-center">
            <p className="text-sm text-danger mb-3">{error}</p>
            <Btn variant="neutral" size="sm" onClick={load}>
              Réessayer
            </Btn>
          </div>
        ) : loading && !data ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : !data || data.items.length === 0 ? (
          <p className="text-sm text-muted text-center px-4 py-14">
            {filter === "hidden"
              ? "Aucun avis masqué."
              : filter === "visible"
                ? "Aucun avis visible."
                : "Aucun avis pour le moment."}
          </p>
        ) : (
          <ul className={`divide-y divide-line transition-opacity ${loading ? "opacity-60" : ""}`}>
            {data.items.map((r) => (
              <ReviewRow
                key={r.id}
                review={r}
                busy={busy}
                onHide={() => setHideTarget(r)}
                onUnhide={() => unhide(r)}
                onEdit={() => setEditTarget(r)}
                onDelete={() => setDeleteTarget(r)}
              />
            ))}
          </ul>
        )}

        {data && data.total > PAGE_SIZE && (mode === "all" || selectedUser) && (
          <div className="px-4 pb-3 border-t border-line">
            <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPageChange={setPage} />
          </div>
        )}
      </div>
      </div>

      <HideModal
        review={hideTarget}
        busy={busy}
        onClose={() => setHideTarget(null)}
        onConfirm={confirmHide}
      />

      <EditModal
        review={editTarget}
        busy={busy}
        onClose={() => setEditTarget(null)}
        onConfirm={confirmEdit}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        busy={busy}
        title="Supprimer cet avis ?"
        phrase="SUPPRIMER"
        confirmLabel="Supprimer"
        body={
          deleteTarget && (
            <>
              <p>
                L&apos;avis de <strong>{deleteTarget.user?.fullName ?? "utilisateur inconnu"}</strong> sur «{" "}
                {deleteTarget.listing?.title ?? "annonce inconnue"} » sera définitivement supprimé.
              </p>
              <p>La note moyenne de l&apos;annonce sera recalculée.</p>
            </>
          )
        }
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Users column (grouped modes)                                        */
/* ------------------------------------------------------------------ */

function UserAvatar({ u }: { u: Pick<UserRow, "fullName" | "avatarUrl" | "avatarColor"> }) {
  if (u.avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={u.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover shrink-0 bg-line" />;
  }
  return (
    <span
      className="w-9 h-9 rounded-full grid place-items-center text-white text-xs font-bold shrink-0"
      style={{ background: u.avatarColor || "#3A4FF0" }}
    >
      {u.fullName?.slice(0, 2).toUpperCase()}
    </span>
  );
}

function UsersColumn({
  mode,
  users,
  error,
  query,
  onQuery,
  selectedId,
  onPick,
  onPage,
}: {
  mode: "received" | "written";
  users: Paged<UserRow> | null;
  error: string | null;
  query: string;
  onQuery: (v: string) => void;
  selectedId: string | null;
  onPick: (u: UserRow) => void;
  onPage: (p: number) => void;
}) {
  return (
    <div className="bg-card rounded-2xl border border-line shadow-[var(--shadow-card)] overflow-hidden flex flex-col lg:max-h-[calc(100vh-10rem)]">
      <div className="px-4 py-3 border-b border-line space-y-2.5 shrink-0">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[13px] font-semibold text-fg">{mode === "received" ? "Propriétaires" : "Auteurs"}</h2>
          {users && <span className="text-[11px] text-muted">{users.total}</span>}
        </div>
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Nom, email ou téléphone…"
          className="w-full px-3 py-2 rounded-xl border border-line bg-bg text-[13px] text-fg placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {error ? (
          <p className="text-[12px] text-danger px-4 py-6">{error}</p>
        ) : !users ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : users.items.length === 0 ? (
          <p className="text-[12px] text-muted text-center px-4 py-10">Aucun utilisateur.</p>
        ) : (
          <ul className="divide-y divide-line">
            {users.items.map((u) => {
              const active = u.id === selectedId;
              return (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => onPick(u)}
                    className={`w-full text-left px-4 py-3 flex items-center gap-3 transition cursor-pointer ${
                      active ? "bg-primary-light" : "hover:bg-line/40"
                    }`}
                  >
                    <UserAvatar u={u} />
                    <span className="min-w-0 flex-1">
                      <span className={`block text-[13px] font-semibold truncate ${active ? "text-primary-text" : "text-fg"}`}>
                        {u.fullName}
                      </span>
                      <span className="flex items-center gap-1.5 text-[11px] text-muted">
                        {u.averageRating !== null && (
                          <>
                            <StarIcon filled className="w-3 h-3 text-warning" />
                            <span className="font-semibold text-fg tabular-nums">{u.averageRating.toFixed(1)}</span>
                            <span>·</span>
                          </>
                        )}
                        <span className="truncate">{u.email || u.phone}</span>
                      </span>
                    </span>
                    <span className="text-right shrink-0">
                      <span className="block text-[12px] font-semibold text-fg tabular-nums">{u.reviewCount}</span>
                      {u.hiddenCount > 0 ? (
                        <span className="block text-[10px] font-semibold text-danger">{u.hiddenCount} masqué{u.hiddenCount > 1 ? "s" : ""}</span>
                      ) : (
                        <span className="block text-[10px] text-muted">{fmtDate(u.lastReviewAt).split(" ")[0]}</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {users && users.total > users.pageSize && (
        <div className="px-3 pb-2 border-t border-line shrink-0">
          <Pagination page={users.page} pageSize={users.pageSize} total={users.total} onPageChange={onPage} />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Row                                                                 */
/* ------------------------------------------------------------------ */

function ReviewRow({
  review: r,
  busy,
  onHide,
  onUnhide,
  onEdit,
  onDelete,
}: {
  review: Review;
  busy: boolean;
  onHide: () => void;
  onUnhide: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const long = (r.text?.length ?? 0) > 220;
  const hidden = !!r.hiddenAt;

  return (
    <li className={`px-5 py-4 hover:bg-line/40 transition ${hidden ? "bg-danger/[0.03]" : ""}`}>
      <div className="flex flex-col md:flex-row md:items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <Stars value={r.rating} />
            <span className="text-[13px] font-semibold text-fg tabular-nums">{r.rating}/5</span>
            {hidden && (
              <span
                className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-danger/12 text-danger"
                title={r.hiddenAt ? `Masqué le ${fmtDate(r.hiddenAt)}` : undefined}
              >
                Masqué{r.hiddenReason ? ` · ${r.hiddenReason}` : ""}
              </span>
            )}
            <span className="text-[11px] text-muted ml-auto md:ml-0">{fmtDate(r.createdAt)}</span>
          </div>

          {r.text ? (
            <div className="mt-2">
              <p
                className={`text-[13px] text-fg whitespace-pre-wrap break-words ${
                  expanded ? "" : "line-clamp-3"
                } ${hidden ? "opacity-70" : ""}`}
              >
                {r.text}
              </p>
              {long && (
                <button
                  onClick={() => setExpanded((v) => !v)}
                  className="text-[12px] font-medium text-primary hover:underline mt-1 cursor-pointer"
                >
                  {expanded ? "Voir moins" : "Voir plus"}
                </button>
              )}
            </div>
          ) : (
            <p className="mt-2 text-[12.5px] italic text-muted">Aucun commentaire, note seule.</p>
          )}

          <p className="mt-2 text-[12px] text-muted truncate">
            Par{" "}
            <Link href={`/users/${r.userId}`} className="font-medium text-fg hover:text-primary hover:underline">
              {r.user?.fullName ?? "Utilisateur supprimé"}
            </Link>
            {" · "}
            <Link href="/listings" className="text-fg/80 hover:text-primary hover:underline">
              {r.listing?.title ?? "Annonce supprimée"}
            </Link>
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5 shrink-0 md:justify-end">
          {hidden ? (
            <Btn size="sm" variant="success" onClick={onUnhide} disabled={busy}>
              Afficher
            </Btn>
          ) : (
            <Btn size="sm" variant="warning" onClick={onHide} disabled={busy}>
              Masquer
            </Btn>
          )}
          <Btn size="sm" variant="primary" onClick={onEdit} disabled={busy}>
            Modifier
          </Btn>
          <Btn size="sm" variant="danger" onClick={onDelete} disabled={busy}>
            Supprimer
          </Btn>
        </div>
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Stars                                                               */
/* ------------------------------------------------------------------ */

function StarIcon({ filled, className = "w-4 h-4" }: { filled: boolean; className?: string }) {
  return (
    <svg
      className={`${className} shrink-0 ${filled ? "text-warning" : "text-line"}`}
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={1.2}
      aria-hidden="true"
    >
      <path strokeLinejoin="round" d={STAR_PATH} />
    </svg>
  );
}

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} sur 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <StarIcon key={i} filled={i <= value} />
      ))}
    </span>
  );
}

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="flex items-center gap-1" role="radiogroup" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={value === i}
          aria-label={`${i} étoile${i > 1 ? "s" : ""}`}
          onClick={() => onChange(i)}
          onMouseEnter={() => setHover(i)}
          className="p-0.5 rounded-md hover:bg-line/40 transition cursor-pointer"
        >
          <StarIcon filled={i <= shown} className="w-7 h-7" />
        </button>
      ))}
      <span className="ml-2 text-sm font-semibold text-fg tabular-nums">{value}/5</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Modals                                                              */
/* ------------------------------------------------------------------ */

function HideModal({
  review,
  busy,
  onClose,
  onConfirm,
}: {
  review: Review | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (review) setReason("");
  }, [review]);

  return (
    <Modal open={!!review} onClose={onClose} title="Masquer cet avis">
      <div className="space-y-4">
        <p className="text-sm text-muted">
          L&apos;avis ne sera plus visible sur l&apos;annonce et ne comptera plus dans sa note moyenne.
        </p>
        <Field label="Raison (optionnelle)" hint="300 caractères maximum.">
          <input
            value={reason}
            maxLength={300}
            autoFocus
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !busy) onConfirm(reason);
            }}
            placeholder="Ex. propos injurieux, hors sujet…"
            className={inputClass}
          />
        </Field>
        <div className="flex gap-2">
          <Btn variant="warning" onClick={() => onConfirm(reason)} disabled={busy}>
            {busy ? "…" : "Masquer"}
          </Btn>
          <span className="ml-auto">
            <Btn variant="neutral" onClick={onClose}>
              Annuler
            </Btn>
          </span>
        </div>
      </div>
    </Modal>
  );
}

function EditModal({
  review,
  busy,
  onClose,
  onConfirm,
}: {
  review: Review | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (changes: { rating?: number; text?: string | null }) => void;
}) {
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");

  useEffect(() => {
    if (review) {
      setRating(review.rating);
      setText(review.text ?? "");
    }
  }, [review]);

  function submit() {
    if (!review) return;
    const changes: { rating?: number; text?: string | null } = {};
    if (rating !== review.rating) changes.rating = rating;
    const nextText = text.trim() === "" ? null : text;
    if (nextText !== (review.text ?? null)) changes.text = nextText;
    onConfirm(changes);
  }

  return (
    <Modal open={!!review} onClose={onClose} title="Modifier l'avis">
      <div className="space-y-4">
        {review && (
          <p className="text-[12px] text-muted">
            {review.user?.fullName ?? "Utilisateur supprimé"} · {review.listing?.title ?? "Annonce supprimée"}
          </p>
        )}
        <Field label="Note">
          <StarPicker value={rating} onChange={setRating} />
        </Field>
        <Field label="Commentaire" hint="Laisser vide pour supprimer le texte (2000 caractères maximum).">
          <textarea
            value={text}
            maxLength={2000}
            rows={6}
            onChange={(e) => setText(e.target.value)}
            className={`${inputClass} resize-y`}
          />
        </Field>
        <div className="flex gap-2">
          <Btn variant="primary" onClick={submit} disabled={busy}>
            {busy ? "…" : "Enregistrer"}
          </Btn>
          <span className="ml-auto">
            <Btn variant="neutral" onClick={onClose}>
              Annuler
            </Btn>
          </span>
        </div>
      </div>
    </Modal>
  );
}
