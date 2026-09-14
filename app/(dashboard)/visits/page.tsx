"use client";

import { useAuth } from "@/lib/auth";
import { adminApi, ApiError } from "@/lib/api";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Pagination from "@/components/Pagination";
import Topbar from "@/components/Topbar";
import { Modal, ConfirmDialog, Tabs, Field, inputClass, Btn, Notice, Spinner, fmtDate } from "@/components/ui";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type VisitStatus = "REQUESTED" | "CONFIRMED" | "CANCELLED" | "COMPLETED" | "NO_SHOW";

interface Person {
  id: string;
  fullName: string;
  avatarColor?: string | null;
}

interface Visit {
  id: string;
  listingId: string;
  visitorId: string;
  ownerId: string;
  scheduledAt: string;
  status: VisitStatus;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  listing: { id: string; title: string; city: string; imageName?: string | null; coverUrl?: string | null } | null;
  visitor: Person | null;
  owner: Person | null;
}

interface VisitsPage {
  total: number;
  page: number;
  pageSize: number;
  items: Visit[];
}

type VisitPatch = { status?: VisitStatus; scheduledAt?: string; note?: string | null };

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const PAGE_SIZE = 30;

const STATUSES: VisitStatus[] = ["REQUESTED", "CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"];

const STATUS_META: Record<VisitStatus, { label: string; tab: string; cls: string }> = {
  REQUESTED: { label: "Demandée", tab: "Demandées", cls: "bg-warning/15 text-warning" },
  CONFIRMED: { label: "Confirmée", tab: "Confirmées", cls: "bg-primary-light text-primary-text" },
  CANCELLED: { label: "Annulée", tab: "Annulées", cls: "bg-line/60 text-muted" },
  COMPLETED: { label: "Terminée", tab: "Terminées", cls: "bg-success/12 text-success" },
  NO_SHOW: { label: "Absent", tab: "Absents", cls: "bg-danger/12 text-danger" },
};

const TABS = [
  { id: "all", label: "Toutes" },
  ...STATUSES.map((s) => ({ id: s, label: STATUS_META[s].tab })),
];

const errMsg = (e: unknown, fallback: string) =>
  e instanceof ApiError
    ? e.status === 403
      ? "Vous n'avez pas la permission de modifier les visites."
      : e.message || fallback
    : e instanceof Error
      ? e.message || fallback
      : fallback;

/** ISO string → value for `<input type="datetime-local">`, in the browser's local time. */
function isoToLocalInput(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** `datetime-local` value (local wall-clock time) → ISO string, or null if invalid. */
function localInputToIso(v: string) {
  if (!v) return null;
  // A date-time string without an offset is parsed as local time.
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const fmtScheduled = (iso: string) => {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }),
    time: d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
  };
};

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function VisitsPage() {
  const { token } = useAuth();
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<VisitsPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [notice, setNotice] = useState<{ kind: "success" | "danger"; text: string } | null>(null);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());

  const [editing, setEditing] = useState<Visit | null>(null);
  const [deleting, setDeleting] = useState<Visit | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  /* ---- loading ---------------------------------------------------- */

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const res = await adminApi<VisitsPage>("/visits", token, {
        params: { status, page, pageSize: PAGE_SIZE },
      });
      setData(res);
    } catch (e) {
      setLoadError(errMsg(e, "Impossible de charger les visites."));
    } finally {
      setLoading(false);
    }
  }, [token, status, page]);

  useEffect(() => {
    load();
  }, [load]);

  // Auto-dismiss success notices.
  useEffect(() => {
    if (notice?.kind !== "success") return;
    const t = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  const replaceVisit = (id: string, patch: Partial<Visit>) =>
    setData((d) => (d ? { ...d, items: d.items.map((v) => (v.id === id ? { ...v, ...patch } : v)) } : d));

  const markSaving = (id: string, on: boolean) =>
    setSavingIds((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  /** Merge only the scalar fields the PATCH response carries (it has no relations). */
  const mergeUpdated = (id: string, updated: Partial<Visit>) =>
    replaceVisit(id, {
      ...(updated.status ? { status: updated.status } : {}),
      ...(updated.scheduledAt ? { scheduledAt: updated.scheduledAt } : {}),
      ...(updated.note !== undefined ? { note: updated.note } : {}),
    });

  /* ---- writes ----------------------------------------------------- */

  async function patchVisit(id: string, body: VisitPatch) {
    const res = await adminApi<{ visit: Partial<Visit> }>(`/visits/${id}`, token!, { method: "PATCH", body });
    return res.visit ?? {};
  }

  /** Inline status change: optimistic, reverted on failure. */
  async function changeStatus(v: Visit, next: VisitStatus) {
    if (!token || next === v.status) return;
    const prev = v.status;
    replaceVisit(v.id, { status: next });
    markSaving(v.id, true);
    setNotice(null);
    try {
      mergeUpdated(v.id, await patchVisit(v.id, { status: next }));
      setNotice({ kind: "success", text: `Statut mis à jour : ${STATUS_META[next].label}.` });
      // The visit may no longer match the active filter.
      if (status !== "all" && status !== next) load();
    } catch (e) {
      replaceVisit(v.id, { status: prev });
      setNotice({ kind: "danger", text: errMsg(e, "La mise à jour du statut a échoué.") });
    } finally {
      markSaving(v.id, false);
    }
  }

  async function confirmDelete() {
    if (!token || !deleting) return;
    setDeleteBusy(true);
    try {
      await adminApi(`/visits/${deleting.id}`, token, { method: "DELETE" });
      setDeleting(null);
      setNotice({ kind: "success", text: "Visite supprimée." });
      // Step back a page if we just emptied the last one.
      if (data && data.items.length === 1 && page > 0) setPage(page - 1);
      else load();
    } catch (e) {
      setDeleting(null);
      setNotice({ kind: "danger", text: errMsg(e, "La suppression a échoué.") });
    } finally {
      setDeleteBusy(false);
    }
  }

  /* ---- render ----------------------------------------------------- */

  const total = data?.total ?? 0;

  return (
    <>
      <Topbar
        title="Visites"
        pill={data ? `${total.toLocaleString("fr-FR")} visite${total > 1 ? "s" : ""}` : undefined}
      />

      <div className="mb-5">
        <Tabs
          tabs={TABS}
          active={status}
          onChange={(id) => {
            setStatus(id);
            setPage(0);
          }}
        />
      </div>

      {notice && (
        <div className="mb-4">
          <Notice kind={notice.kind}>{notice.text}</Notice>
        </div>
      )}

      <div className="bg-card rounded-2xl border border-line shadow-[var(--shadow-card)] overflow-hidden">
        {loadError ? (
          <div className="p-5 space-y-3">
            <Notice kind="danger">{loadError}</Notice>
            <Btn size="sm" variant="primary" onClick={load}>Réessayer</Btn>
          </div>
        ) : loading && !data ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : !data || data.items.length === 0 ? (
          <p className="text-[13px] text-muted text-center px-4 py-16">
            {status === "all"
              ? "Aucune demande de visite pour le moment."
              : `Aucune visite « ${STATUS_META[status as VisitStatus]?.label ?? status} ».`}
          </p>
        ) : (
          <div className={`overflow-x-auto transition-opacity ${loading ? "opacity-60" : ""}`}>
            <table className="w-full text-sm min-w-[1100px]">
              <thead>
                <tr className="border-b border-line">
                  <Th>Annonce</Th>
                  <Th>Visiteur</Th>
                  <Th>Propriétaire</Th>
                  <Th>Date prévue</Th>
                  <Th>Statut</Th>
                  <Th>Note</Th>
                  <Th>Créée le</Th>
                  <Th right>Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.items.map((v) => {
                  const when = fmtScheduled(v.scheduledAt);
                  const saving = savingIds.has(v.id);
                  return (
                    <tr key={v.id} className="hover:bg-line/40 transition align-top">
                      <td className="px-4 py-3">
                        {v.listing ? (
                          <Link href="/listings" className="flex items-center gap-3 group min-w-0">
                            <Cover url={v.listing.coverUrl} />
                            <span className="min-w-0">
                              <span className="block text-[13px] font-semibold text-fg line-clamp-1 group-hover:text-primary transition">
                                {v.listing.title}
                              </span>
                              <span className="block text-[11.5px] text-muted">{v.listing.city}</span>
                            </span>
                          </Link>
                        ) : (
                          <span className="text-[12px] italic text-muted">Annonce supprimée</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <PersonLink p={v.visitor} fallbackId={v.visitorId} />
                      </td>
                      <td className="px-4 py-3">
                        <PersonLink p={v.owner} fallbackId={v.ownerId} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="block text-[13px] text-fg capitalize">{when.date}</span>
                        <span className="block text-[11.5px] text-muted tabular-nums">{when.time}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-start gap-1.5">
                          <StatusPill status={v.status} />
                          <select
                            aria-label="Changer le statut"
                            value={v.status}
                            disabled={saving}
                            onChange={(e) => changeStatus(v, e.target.value as VisitStatus)}
                            className="text-[12px] px-2 py-1 rounded-lg border border-line bg-card text-fg cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50 disabled:cursor-wait"
                          >
                            {STATUSES.map((s) => (
                              <option key={s} value={s}>{STATUS_META[s].label}</option>
                            ))}
                          </select>
                        </div>
                      </td>
                      <td className="px-4 py-3 max-w-[220px]">
                        {v.note ? (
                          <p className="text-[12px] text-fg/80 line-clamp-2 break-words" title={v.note}>{v.note}</p>
                        ) : (
                          <span className="text-[12px] text-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[12px] text-muted whitespace-nowrap tabular-nums">
                        {fmtDate(v.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={() => setEditing(v)}
                            className="px-2.5 py-1 text-[12px] font-medium rounded-lg border border-line text-fg hover:bg-line/40 transition cursor-pointer"
                          >
                            Modifier
                          </button>
                          <button
                            onClick={() => setDeleting(v)}
                            className="px-2.5 py-1 text-[12px] font-medium rounded-lg bg-danger/12 text-danger hover:opacity-80 transition cursor-pointer"
                          >
                            Supprimer
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {data && !loadError && data.total > data.pageSize && (
          <div className="px-5 pb-4 border-t border-line">
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} />
          </div>
        )}
      </div>

      <EditVisitModal
        visit={editing}
        onClose={() => setEditing(null)}
        onSave={async (v, body) => {
          mergeUpdated(v.id, await patchVisit(v.id, body));
          setEditing(null);
          setNotice({ kind: "success", text: "Visite mise à jour." });
          // Status/date changes can move the row out of the filter or reorder the list.
          if (body.status !== undefined || body.scheduledAt !== undefined) load();
        }}
      />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => {
          if (!deleteBusy) setDeleting(null);
        }}
        onConfirm={confirmDelete}
        busy={deleteBusy}
        title="Supprimer la visite"
        phrase="SUPPRIMER"
        confirmLabel="Supprimer"
        body={
          deleting && (
            <>
              <p>
                La demande de visite de <strong>{deleting.visitor?.fullName ?? "ce visiteur"}</strong> pour{" "}
                <strong>{deleting.listing?.title ?? "cette annonce"}</strong>, prévue le{" "}
                {fmtDate(deleting.scheduledAt)}, sera définitivement supprimée.
              </p>
              <p>Cette action est irréversible.</p>
            </>
          )
        }
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Edit modal                                                          */
/* ------------------------------------------------------------------ */

function EditVisitModal({
  visit,
  onClose,
  onSave,
}: {
  visit: Visit | null;
  onClose: () => void;
  onSave: (v: Visit, body: VisitPatch) => Promise<void>;
}) {
  const [status, setStatus] = useState<VisitStatus>("REQUESTED");
  const [when, setWhen] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visit) return;
    setStatus(visit.status);
    setWhen(isoToLocalInput(visit.scheduledAt));
    setNote(visit.note ?? "");
    setError(null);
    setBusy(false);
  }, [visit]);

  if (!visit) return null;

  const buildPatch = (): VisitPatch | string => {
    const body: VisitPatch = {};
    if (status !== visit.status) body.status = status;

    // Compare at minute precision — the input cannot express seconds.
    if (when !== isoToLocalInput(visit.scheduledAt)) {
      const iso = localInputToIso(when);
      if (!iso) return "Date et heure invalides.";
      body.scheduledAt = iso;
    }

    const trimmed = note.trim();
    const nextNote = trimmed === "" ? null : trimmed;
    if (nextNote !== (visit.note ?? null)) {
      if (nextNote && nextNote.length > 1000) return "La note ne peut pas dépasser 1000 caractères.";
      body.note = nextNote;
    }
    return body;
  };

  async function submit() {
    if (!visit) return;
    const body = buildPatch();
    if (typeof body === "string") {
      setError(body);
      return;
    }
    if (Object.keys(body).length === 0) {
      onClose();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave(visit, body);
    } catch (e) {
      setError(errMsg(e, "L'enregistrement a échoué."));
      setBusy(false);
    }
  }

  return (
    <Modal
      open={!!visit}
      onClose={() => {
        if (!busy) onClose();
      }}
      title="Modifier la visite"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="space-y-4"
      >
        <p className="text-[12px] text-muted -mt-2">
          {visit.listing?.title ?? "Annonce supprimée"}
          {visit.visitor ? ` · ${visit.visitor.fullName}` : ""}
        </p>

        <Field label="Statut">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as VisitStatus)}
            className={`${inputClass} cursor-pointer`}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_META[s].label}</option>
            ))}
          </select>
        </Field>

        <Field label="Date et heure" hint="Heure locale de votre navigateur.">
          <input
            type="datetime-local"
            required
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="Note" hint="Laisser vide pour supprimer la note.">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            maxLength={1000}
            className={`${inputClass} resize-y`}
            placeholder="Aucune note"
          />
        </Field>

        {error && <Notice kind="danger">{error}</Notice>}

        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={busy}
            className="px-4 py-2 text-sm rounded-xl bg-primary text-white font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
          >
            {busy ? "Enregistrement…" : "Enregistrer"}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 text-sm rounded-xl border border-line text-fg hover:bg-line/40 font-medium transition cursor-pointer ml-auto disabled:opacity-40"
          >
            Annuler
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Local building blocks                                               */
/* ------------------------------------------------------------------ */

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

function StatusPill({ status }: { status: VisitStatus }) {
  const m = STATUS_META[status] ?? { label: status, cls: "bg-line/60 text-muted" };
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold whitespace-nowrap ${m.cls}`}>
      {m.label}
    </span>
  );
}

function Cover({ url }: { url?: string | null }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="w-12 h-12 rounded-xl object-cover shrink-0 bg-line" />;
  }
  return (
    <span className="w-12 h-12 rounded-xl bg-line/60 grid place-items-center shrink-0 text-muted">
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1v-9.5z" />
      </svg>
    </span>
  );
}

function PersonLink({ p, fallbackId }: { p: Person | null; fallbackId: string }) {
  if (!p) {
    return (
      <Link href={`/users/${fallbackId}`} className="text-[12px] italic text-muted hover:text-fg">
        Utilisateur inconnu
      </Link>
    );
  }
  return (
    <Link href={`/users/${p.id}`} className="flex items-center gap-2 group min-w-0">
      <span
        className="w-7 h-7 rounded-full grid place-items-center text-white text-[10px] font-bold shrink-0"
        style={{ background: p.avatarColor || "#3A4FF0" }}
      >
        {p.fullName?.slice(0, 2).toUpperCase()}
      </span>
      <span className="text-[13px] text-fg truncate group-hover:text-primary transition">{p.fullName}</span>
    </Link>
  );
}
