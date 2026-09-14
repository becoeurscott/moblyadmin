"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { adminApi } from "@/lib/api";
import { useEffect, useState, useCallback } from "react";
import Pagination from "@/components/Pagination";
import Topbar from "@/components/Topbar";
import { Modal, Notice, Tabs, Field, inputClass } from "@/components/ui";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type Status = "OPEN" | "REVIEWING" | "ACTIONED" | "DISMISSED";
type Target = "LISTING" | "USER" | "MESSAGE" | "REVIEW";
type Action = "RESTRICT_USER" | "SUSPEND_USER" | "PAUSE_LISTING" | "DELETE_MESSAGE" | "HIDE_REVIEW" | "DISMISS";

interface Report {
  id: string;
  target: Target;
  targetId: string;
  reason: string;
  details?: string | null;
  status: Status;
  resolution?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
  reporter: { id: string; fullName: string; email?: string | null; phone: string };
}

interface Paged<T> {
  total: number;
  page: number;
  pageSize: number;
  items: T[];
}

const STATUS: Record<Status, { label: string; cls: string }> = {
  OPEN:      { label: "Ouvert",   cls: "bg-danger/12 text-danger" },
  REVIEWING: { label: "En revue", cls: "bg-warning/15 text-warning" },
  ACTIONED:  { label: "Traité",   cls: "bg-success/12 text-success" },
  DISMISSED: { label: "Rejeté",   cls: "bg-line/60 text-muted" },
};

const TARGET: Record<Target, string> = {
  LISTING: "Annonce",
  USER: "Utilisateur",
  MESSAGE: "Message",
  REVIEW: "Avis",
};

/** The sanction that makes sense for each kind of reported content. */
const SANCTIONS: Record<Target, { action: Action; label: string; tone: "danger" | "warning" }[]> = {
  USER: [
    { action: "RESTRICT_USER", label: "Restreindre", tone: "warning" },
    { action: "SUSPEND_USER", label: "Suspendre le compte", tone: "danger" },
  ],
  LISTING: [{ action: "PAUSE_LISTING", label: "Mettre l'annonce en pause", tone: "warning" }],
  MESSAGE: [{ action: "DELETE_MESSAGE", label: "Supprimer le message", tone: "danger" }],
  REVIEW: [{ action: "HIDE_REVIEW", label: "Masquer l'avis", tone: "warning" }],
};

const RESTRICTION_KINDS: { value: string; label: string }[] = [
  { value: "MESSAGE_SEND", label: "Envoi de messages" },
  { value: "MESSAGE_MEDIA", label: "Envoi de médias" },
  { value: "CONTACT_OWNER", label: "Contacter les propriétaires" },
  { value: "VISIT_REQUEST", label: "Demandes de visite" },
  { value: "REVIEW_POST", label: "Publier des avis" },
  { value: "LISTING_PUBLISH", label: "Publier des annonces" },
  { value: "LISTING_EDIT", label: "Modifier ses annonces" },
  { value: "CALL", label: "Appels" },
  { value: "REPORT_FILE", label: "Faire des signalements" },
  { value: "PROFILE_EDIT", label: "Modifier son profil" },
  { value: "SHADOW_BAN", label: "Masquer ses annonces (shadow ban)" },
  { value: "LOGIN", label: "Connexion" },
];

const DURATIONS: { minutes: number | null; label: string }[] = [
  { minutes: 60, label: "1 heure" },
  { minutes: 60 * 24, label: "24 heures" },
  { minutes: 60 * 24 * 7, label: "7 jours" },
  { minutes: 60 * 24 * 30, label: "30 jours" },
  { minutes: null, label: "Permanent" },
];

const fmt = (d?: string | null) =>
  d ? new Date(d).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—";

function targetHref(r: Report): string | null {
  if (r.target === "USER") return `/users/${r.targetId}`;
  if (r.target === "LISTING") return `/listings?id=${r.targetId}`;
  if (r.target === "REVIEW") return `/reviews`;
  return null;
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function ReportsPage() {
  const { token } = useAuth();
  const [data, setData] = useState<Paged<Report> | null>(null);
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState<"all" | Status>("OPEN");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "danger"; text: string } | null>(null);

  // modal state
  const [pending, setPending] = useState<{ report: Report; action: Action | "RESOLVE" | "REOPEN" } | null>(null);
  const [reason, setReason] = useState("");
  const [kind, setKind] = useState("MESSAGE_SEND");
  const [duration, setDuration] = useState<number | null>(60 * 24 * 7);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!token) return;
    setLoadError(null);
    adminApi<Paged<Report>>("/reports", token, { params: { page, status, pageSize: 25 } })
      .then(setData)
      .catch((e: { message?: string }) => setLoadError(e?.message || "Impossible de charger les signalements."));
  }, [token, page, status]);

  useEffect(() => { load(); }, [load]);

  function open(report: Report, action: Action | "RESOLVE" | "REOPEN") {
    setPending({ report, action });
    setReason(action === "RESOLVE" ? report.resolution ?? "" : "");
    setKind("MESSAGE_SEND");
    setDuration(60 * 24 * 7);
  }

  async function quickStatus(r: Report, next: Status) {
    if (!token) return;
    try {
      await adminApi(`/reports/${r.id}`, token, { method: "PATCH", body: { status: next } });
      setNotice({ kind: "success", text: `Signalement passé en « ${STATUS[next].label} ».` });
      load();
    } catch (e) {
      setNotice({ kind: "danger", text: (e as Error).message });
    }
  }

  async function confirm() {
    if (!token || !pending) return;
    const { report, action } = pending;
    setBusy(true);
    try {
      if (action === "RESOLVE") {
        await adminApi(`/reports/${report.id}`, token, {
          method: "PATCH",
          body: { status: "ACTIONED", resolution: reason.trim() || undefined },
        });
      } else if (action === "REOPEN") {
        await adminApi(`/reports/${report.id}`, token, { method: "PATCH", body: { status: "OPEN" } });
      } else {
        await adminApi(`/moderation/reports/${report.id}/action`, token, {
          method: "POST",
          body: {
            action,
            reason: reason.trim() || undefined,
            ...(action === "RESTRICT_USER" ? { kind, ...(duration ? { durationMinutes: duration } : {}) } : {}),
          },
        });
      }
      setNotice({ kind: "success", text: "Action appliquée." });
      setPending(null);
      load();
    } catch (e) {
      setNotice({ kind: "danger", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const title = (() => {
    if (!pending) return "";
    const a = pending.action;
    if (a === "RESOLVE") return "Marquer comme traité";
    if (a === "REOPEN") return "Rouvrir le signalement";
    if (a === "DISMISS") return "Rejeter le signalement";
    return SANCTIONS[pending.report.target].find((s) => s.action === a)?.label ?? "Action";
  })();

  return (
    <>
      <Topbar
        title="Signalements"
        pill={data ? `${data.total.toLocaleString("fr-FR")} signalement${data.total > 1 ? "s" : ""}` : undefined}
      />

      <div className="mb-5">
        <Tabs
          tabs={[
            { id: "OPEN", label: "Ouverts" },
            { id: "REVIEWING", label: "En revue" },
            { id: "ACTIONED", label: "Traités" },
            { id: "DISMISSED", label: "Rejetés" },
            { id: "all", label: "Tous" },
          ]}
          active={status}
          onChange={(id) => { setStatus(id as "all" | Status); setPage(0); }}
        />
      </div>

      {notice && (
        <div className="mb-4">
          <Notice kind={notice.kind}>{notice.text}</Notice>
        </div>
      )}

      {loadError ? (
        <Notice kind="danger">{loadError}</Notice>
      ) : !data ? (
        <p className="text-sm text-muted py-10 text-center">Chargement…</p>
      ) : data.items.length === 0 ? (
        <p className="text-sm text-muted py-10 text-center">Aucun signalement.</p>
      ) : (
        <div className="space-y-3">
          {data.items.map((r) => {
            const st = STATUS[r.status] ?? { label: r.status, cls: "bg-line/60 text-muted" };
            const href = targetHref(r);
            const openish = r.status === "OPEN" || r.status === "REVIEWING";
            return (
              <div key={r.id} className="bg-card rounded-2xl border border-line shadow-[var(--shadow-card)] p-5">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${st.cls}`}>{st.label}</span>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-primary-light text-primary-text">
                    {TARGET[r.target] ?? r.target}
                  </span>
                  {href ? (
                    <Link href={href} className="text-[12px] text-primary-text hover:underline font-mono truncate max-w-[16rem]">
                      {r.targetId}
                    </Link>
                  ) : (
                    <span className="text-[12px] text-muted font-mono truncate max-w-[16rem]">{r.targetId}</span>
                  )}
                  <span className="ml-auto text-[11px] text-muted">{fmt(r.createdAt)}</span>
                </div>

                <p className="font-semibold text-fg">{r.reason}</p>
                {r.details && <p className="text-[13px] text-muted mt-1 whitespace-pre-wrap">{r.details}</p>}

                {r.resolution && (
                  <p className="text-[12px] mt-2 text-fg/80">
                    <span className="text-muted">Résolution :</span> {r.resolution}
                    {r.resolvedAt && <span className="text-muted"> · {fmt(r.resolvedAt)}</span>}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2 mt-4">
                  <p className="text-[12px] text-muted mr-auto">
                    Par{" "}
                    <Link href={`/users/${r.reporter.id}`} className="text-fg hover:underline font-medium">
                      {r.reporter.fullName}
                    </Link>{" "}
                    ({r.reporter.email || r.reporter.phone})
                  </p>

                  {openish ? (
                    <>
                      {r.status === "OPEN" && (
                        <ActionBtn tone="warning" onClick={() => quickStatus(r, "REVIEWING")}>Examiner</ActionBtn>
                      )}
                      {SANCTIONS[r.target]?.map((s) => (
                        <ActionBtn key={s.action} tone={s.tone} onClick={() => open(r, s.action)}>{s.label}</ActionBtn>
                      ))}
                      <ActionBtn tone="success" onClick={() => open(r, "RESOLVE")}>Traité sans sanction</ActionBtn>
                      <ActionBtn tone="neutral" onClick={() => open(r, "DISMISS")}>Rejeter</ActionBtn>
                    </>
                  ) : (
                    <>
                      <ActionBtn tone="neutral" onClick={() => open(r, "RESOLVE")}>Modifier la résolution</ActionBtn>
                      <ActionBtn tone="warning" onClick={() => open(r, "REOPEN")}>Rouvrir</ActionBtn>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {data && data.total > data.pageSize && (
        <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} />
      )}

      <Modal open={!!pending} onClose={() => !busy && setPending(null)} title={title}>
        {pending && (
          <div className="space-y-4">
            <p className="text-[13px] text-muted">
              {TARGET[pending.report.target]} · <span className="font-mono">{pending.report.targetId}</span>
              <br />
              <span className="text-fg">{pending.report.reason}</span>
            </p>

            {pending.action === "RESTRICT_USER" && (
              <>
                <Field label="Restriction">
                  <select value={kind} onChange={(e) => setKind(e.target.value)} className={inputClass}>
                    {RESTRICTION_KINDS.map((k) => (
                      <option key={k.value} value={k.value}>{k.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Durée">
                  <select
                    value={duration === null ? "perm" : String(duration)}
                    onChange={(e) => setDuration(e.target.value === "perm" ? null : Number(e.target.value))}
                    className={inputClass}
                  >
                    {DURATIONS.map((d) => (
                      <option key={d.label} value={d.minutes === null ? "perm" : String(d.minutes)}>{d.label}</option>
                    ))}
                  </select>
                </Field>
              </>
            )}

            {pending.action === "SUSPEND_USER" && (
              <Notice kind="danger">Le compte sera désactivé et toutes ses sessions déconnectées.</Notice>
            )}

            {pending.action !== "REOPEN" && (
              <Field
                label={pending.action === "RESOLVE" ? "Résolution" : "Raison"}
                hint={pending.action === "RESOLVE" ? "Visible dans l'historique du signalement." : "Facultatif — enregistrée avec l'action."}
              >
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  maxLength={pending.action === "RESOLVE" ? 500 : 300}
                  className={inputClass}
                />
              </Field>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={confirm}
                disabled={busy}
                className="px-4 py-2 text-sm rounded-xl bg-primary text-white font-medium hover:opacity-90 disabled:opacity-40 cursor-pointer"
              >
                {busy ? "…" : "Confirmer"}
              </button>
              <button
                onClick={() => setPending(null)}
                disabled={busy}
                className="px-4 py-2 text-sm rounded-xl border border-line text-fg hover:bg-line/40 font-medium ml-auto cursor-pointer"
              >
                Annuler
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

function ActionBtn({
  tone,
  onClick,
  children,
}: {
  tone: "danger" | "warning" | "success" | "neutral";
  onClick: () => void;
  children: React.ReactNode;
}) {
  const cls = {
    danger: "bg-danger/12 text-danger hover:bg-danger/20",
    warning: "bg-warning/15 text-warning hover:bg-warning/25",
    success: "bg-success/12 text-success hover:bg-success/20",
    neutral: "bg-line/60 text-muted hover:text-fg",
  }[tone];
  return (
    <button onClick={onClick} className={`text-[12px] px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${cls}`}>
      {children}
    </button>
  );
}
