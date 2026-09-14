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
  const [filter, setFilter] = useState<Filter>("all");
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
    setLoading(true);
    setError(null);
    adminApi<Paged<Review>>("/moderation/reviews", token, {
      params: {
        page,
        pageSize: PAGE_SIZE,
        hidden: filter === "hidden" ? "true" : filter === "visible" ? "false" : undefined,
      },
    })
      .then(setData)
      .catch((e) => setError(errMsg(e, "Impossible de charger les avis.")))
      .finally(() => setLoading(false));
  }, [token, page, filter]);

  useEffect(() => {
    load();
  }, [load]);

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

      <div className="bg-card rounded-2xl border border-line shadow-[var(--shadow-card)] overflow-hidden">
        {error ? (
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

        {data && data.total > PAGE_SIZE && (
          <div className="px-4 pb-3 border-t border-line">
            <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPageChange={setPage} />
          </div>
        )}
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
