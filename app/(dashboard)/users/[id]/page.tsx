"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { adminApi, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  Badge, Btn, Card, ConfirmDialog, Field, JsonDiff, Modal, Notice,
  Spinner, Tabs, Toggle, fmtDate, inputClass,
} from "@/components/ui";

/**
 * Everything an operator can do to one account.
 *
 * The Restrictions tab is the answer to "block a user from sending messages":
 * one switch per capability, each with a reason the user will read in the app
 * and an optional expiry so a sanction can lapse on its own.
 */

interface UserFull {
  id: string; fullName: string; email?: string | null; phone: string;
  isOwner: boolean; isAdmin: boolean; adminRole?: string | null; isActive: boolean;
  verified: boolean; identityVerified: boolean; verifiedAt?: string | null;
  city?: string | null; region?: string | null; neighborhood?: string | null;
  bio?: string | null; locale?: string; avatarUrl?: string | null; avatarColor?: string | null;
  membershipTier?: string | null; membershipExpires?: string | null;
  moblyScore?: number | null; rating?: number | null; adminNote?: string | null;
  failedLoginCount: number; lockedUntil?: string | null;
  createdAt: string; lastSeenAt?: string | null;
  /** Only present when the backend ships the owner-trial feature — feature-detect with `in`. */
  ownerPaid?: boolean; ownerTrialStartedAt?: string | null;
}

/** String-typed mirror of the PATCH-able fields, as the edit form holds them. */
interface EditForm {
  fullName: string; email: string; phone: string;
  bio: string; locale: "fr" | "en"; avatarUrl: string; avatarColor: string;
  city: string; region: string; neighborhood: string;
  membershipTier: string; membershipExpires: string; moblyScore: string;
  isOwner: boolean; verified: boolean; identityVerified: boolean;
  adminNote: string;
}

const TRIAL_DAYS = 7;
const DAY_MS = 86_400_000;
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

const pad2 = (n: number) => String(n).padStart(2, "0");

/** ISO → `YYYY-MM-DD` in local time, for `<input type="date">`. */
function toDateInput(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** ISO → `YYYY-MM-DDTHH:mm` in local time, for `<input type="datetime-local">`. */
function toDateTimeInput(iso?: string | null) {
  const day = toDateInput(iso);
  if (!day) return "";
  const d = new Date(iso!);
  return `${day}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function toForm(u: UserFull): EditForm {
  return {
    fullName: u.fullName ?? "", email: u.email ?? "", phone: u.phone ?? "",
    bio: u.bio ?? "", locale: u.locale === "en" ? "en" : "fr",
    avatarUrl: u.avatarUrl ?? "", avatarColor: u.avatarColor ?? "",
    city: u.city ?? "", region: u.region ?? "", neighborhood: u.neighborhood ?? "",
    membershipTier: u.membershipTier ?? "", membershipExpires: toDateInput(u.membershipExpires),
    moblyScore: u.moblyScore == null ? "" : String(u.moblyScore),
    isOwner: !!u.isOwner, verified: !!u.verified, identityVerified: !!u.identityVerified,
    adminNote: u.adminNote ?? "",
  };
}

/**
 * Diff the form against the loaded user and return only what changed, so a
 * save never rewrites fields the operator did not touch (and the audit log
 * stays readable). Empty strings become `null` for nullable fields.
 */
function buildPatch(u: UserFull, f: EditForm): { body: Record<string, unknown> } | { error: string } {
  const init = toForm(u);
  const body: Record<string, unknown> = {};

  for (const [k, label] of [["fullName", "Le nom complet"], ["phone", "Le téléphone"]] as const) {
    const v = f[k].trim();
    if (v === init[k].trim()) continue;
    if (!v) return { error: `${label} est obligatoire.` };
    body[k] = v;
  }

  const nullable = [
    "email", "city", "region", "neighborhood", "bio", "avatarUrl", "membershipTier", "adminNote",
  ] as const;
  for (const k of nullable) {
    const v = f[k].trim();
    if (v !== init[k].trim()) body[k] = v === "" ? null : v;
  }

  if (typeof body.email === "string" && !/^\S+@\S+\.\S+$/.test(body.email)) {
    return { error: "Adresse e-mail invalide." };
  }
  if (typeof body.avatarUrl === "string" && !/^https?:\/\/\S+$/.test(body.avatarUrl)) {
    return { error: "L'URL de l'avatar doit commencer par http:// ou https://." };
  }
  if (typeof body.bio === "string" && body.bio.length > 1000) {
    return { error: "La bio ne peut pas dépasser 1000 caractères." };
  }
  if (typeof body.adminNote === "string" && body.adminNote.length > 2000) {
    return { error: "La note interne ne peut pas dépasser 2000 caractères." };
  }

  const color = f.avatarColor.trim();
  if (color !== init.avatarColor.trim()) {
    if (color && !HEX_COLOR.test(color)) return { error: "La couleur doit être au format #RRGGBB." };
    body.avatarColor = color || null;
  }

  if (f.locale !== init.locale) body.locale = f.locale;

  if (f.membershipExpires !== init.membershipExpires) {
    // A date-only expiry means "valid through that day", so end of day local time.
    body.membershipExpires = f.membershipExpires
      ? new Date(`${f.membershipExpires}T23:59:59`).toISOString()
      : null;
  }

  const scoreRaw = f.moblyScore.trim().replace(",", ".");
  const score = scoreRaw === "" ? null : Number(scoreRaw);
  if (score !== null && (Number.isNaN(score) || score < 0 || score > 5)) {
    return { error: "Le score Mobly doit être compris entre 0 et 5." };
  }
  if (score !== (u.moblyScore ?? null)) body.moblyScore = score;

  for (const k of ["isOwner", "verified", "identityVerified"] as const) {
    if (f[k] !== !!u[k]) body[k] = f[k];
  }

  return { body };
}

function trialStatus(u: UserFull, now: number) {
  const start = u.ownerTrialStartedAt ? new Date(u.ownerTrialStartedAt).getTime() : null;
  const end = start !== null ? start + TRIAL_DAYS * DAY_MS : null;
  let label: string;
  let variant: "success" | "warning" | "danger" | "neutral";
  if (u.ownerPaid) {
    label = "Payé"; variant = "success";
  } else if (start === null || end === null) {
    label = "Ancien propriétaire (sans essai)"; variant = "neutral";
  } else if (now < end) {
    const n = Math.ceil((end - now) / DAY_MS);
    label = `Essai en cours · ${n} j restant${n > 1 ? "s" : ""}`; variant = "warning";
  } else {
    label = "Essai expiré — compte verrouillé"; variant = "danger";
  }
  return { label, variant, start, end };
}

/** A titled group inside the edit form. */
function FormSection({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="border-t border-line pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-sm font-semibold text-fg">{title}</h3>
      {hint && <p className="text-xs text-muted mt-0.5">{hint}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">{children}</div>
    </section>
  );
}

/** Label + hint + switch on one row, for boolean fields. */
function ToggleRow({
  label, hint, checked, onChange, disabled,
}: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-line px-3 py-2.5">
      <div className="flex-1">
        <p className="text-sm font-medium text-fg">{label}</p>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} label={label} />
    </div>
  );
}

interface Restriction {
  id: string; kind: string; reason?: string | null; message?: string;
  expiresAt?: string | null; createdAt: string; revokedAt?: string | null; active: boolean;
}

interface Detail {
  user: UserFull;
  online: boolean;
  counts: Record<string, number>;
  restrictions: Restriction[];
  devices: { id: string; platform: string; appVersion?: string; lastSeenAt: string; hasPush: boolean }[];
  sessions: { familyId: string; ip?: string | null; userAgent?: string | null; createdAt: string }[];
  identityChecks: { id: string; status: string; reason?: string | null; createdAt: string; decidedAt?: string | null }[];
  audit: { id: string; action: string; createdAt: string; before?: unknown; after?: unknown; actor?: { fullName: string } }[];
}

/** Every capability, with the French label an operator reads. */
const KINDS: { kind: string; label: string; hint: string }[] = [
  { kind: "LOGIN", label: "Connexion (bannissement)", hint: "Bloque totalement l'accès au compte" },
  { kind: "MESSAGE_SEND", label: "Envoyer des messages", hint: "Ne peut plus écrire dans les conversations" },
  { kind: "MESSAGE_MEDIA", label: "Photos et vocaux", hint: "Texte autorisé, médias bloqués" },
  { kind: "CALL", label: "Appels", hint: "Ne peut ni passer ni recevoir d'appel" },
  { kind: "CONTACT_OWNER", label: "Contacter un propriétaire", hint: "Ne peut plus ouvrir de conversation" },
  { kind: "VISIT_REQUEST", label: "Demander une visite", hint: "" },
  { kind: "REVIEW_POST", label: "Publier un avis", hint: "" },
  { kind: "LISTING_PUBLISH", label: "Publier une annonce", hint: "" },
  { kind: "LISTING_EDIT", label: "Modifier ses annonces", hint: "Inclut les photos" },
  { kind: "BOOST", label: "Booster une annonce", hint: "" },
  { kind: "FAVORITE", label: "Ajouter aux favoris", hint: "" },
  { kind: "PROFILE_EDIT", label: "Modifier son profil", hint: "" },
  { kind: "AVATAR_UPLOAD", label: "Changer sa photo", hint: "" },
  { kind: "BECOME_OWNER", label: "Devenir propriétaire", hint: "" },
  { kind: "IDENTITY_VERIFY", label: "Vérifier son identité", hint: "" },
  { kind: "REPORT_FILE", label: "Signaler", hint: "Contre les signalements abusifs" },
  { kind: "PUSH_RECEIVE", label: "Notifications push", hint: "" },
  { kind: "SHADOW_BAN", label: "Shadow ban", hint: "Contenu invisible aux autres, sans le lui dire" },
];

const DURATIONS = [
  { label: "1 heure", minutes: 60 },
  { label: "24 heures", minutes: 1440 },
  { label: "7 jours", minutes: 10080 },
  { label: "30 jours", minutes: 43200 },
  { label: "Permanent", minutes: 0 },
];

export default function UserDetailPage() {
  const { token } = useAuth();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [data, setData] = useState<Detail | null>(null);
  const [tab, setTab] = useState("profil");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const [restrictTarget, setRestrictTarget] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [minutes, setMinutes] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [form, setForm] = useState<EditForm | null>(null);
  const [formError, setFormError] = useState("");
  const [brokenAvatar, setBrokenAvatar] = useState("");
  const [trialConfirm, setTrialConfirm] = useState<
    { title: string; body: string; label: string; patch: () => Record<string, unknown>; ok: string } | null
  >(null);
  const [trialStartInput, setTrialStartInput] = useState("");

  const load = useCallback(() => {
    if (!token) return;
    adminApi<Detail>(`/users/${id}/full`, token).then(setData).catch((e) => setError(String(e.message)));
  }, [token, id]);

  useEffect(() => { load(); }, [load]);

  async function run(fn: () => Promise<unknown>, ok: string) {
    if (!token) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await fn();
      setNotice(ok);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return <div className="flex items-center justify-center py-24"><Spinner /></div>;
  }

  const u = data.user;
  const activeByKind = new Map(data.restrictions.filter((r) => r.active).map((r) => [r.kind, r]));

  function grant(kind: string) {
    run(
      () =>
        adminApi(`/users/${id}/restrictions`, token!, {
          method: "POST",
          body: {
            kind,
            reason: reason.trim() || undefined,
            // 0 = permanent: omit the duration entirely rather than sending 0,
            // which the server would read as "expires immediately".
            durationMinutes: minutes > 0 ? minutes : undefined,
          },
        }),
      "Restriction appliquée — effet immédiat dans l'app.",
    );
    setRestrictTarget(null);
    setReason("");
  }

  function openEdit() {
    setForm(toForm(u));
    setFormError("");
    setBrokenAvatar("");
  }

  function setF<K extends keyof EditForm>(key: K, value: EditForm[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }

  async function saveEdit() {
    if (!form || !token) return;
    const result = buildPatch(u, form);
    if ("error" in result) {
      setFormError(result.error);
      return;
    }
    const changed = Object.keys(result.body);
    if (changed.length === 0) {
      setForm(null);
      setError("");
      setNotice("Aucune modification à enregistrer.");
      return;
    }
    setBusy(true); setFormError(""); setError(""); setNotice("");
    try {
      await adminApi<{ user: UserFull }>(`/users/${id}`, token, { method: "PATCH", body: result.body });
      setForm(null);
      setNotice(`Profil mis à jour (${changed.length} champ${changed.length > 1 ? "s" : ""}).`);
      load();
    } catch (e) {
      if (e instanceof ApiError && (e.code === "ROLE_REQUIRED" || e.status === 403)) {
        setFormError("Votre rôle ne permet pas de modifier ce compte.");
      } else {
        setFormError(e instanceof ApiError ? e.message : String(e));
      }
    } finally {
      setBusy(false);
    }
  }

  /** Owner-trial writes go through the same PATCH as the profile form. */
  function patchOwner(patch: Record<string, unknown>, ok: string) {
    run(() => adminApi(`/users/${id}`, token!, { method: "PATCH", body: patch }), ok);
  }

  const hasOwnerTrial = "ownerPaid" in u;
  const trial = hasOwnerTrial ? trialStatus(u, Date.now()) : null;

  return (
    <div className="max-w-5xl">
      <Link href="/users" className="text-sm text-text hover:text-dark">← Utilisateurs</Link>

      {/* Header */}
      <div className="flex items-start gap-4 mt-3 mb-5">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center text-white text-lg font-bold shrink-0"
          style={{ background: u.avatarColor || "#3A4FF0" }}
        >
          {u.fullName?.slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-dark">{u.fullName}</h1>
          <p className="text-sm text-text">{u.phone}{u.email ? ` · ${u.email}` : ""}</p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {data.online && <Badge variant="success">En ligne</Badge>}
            {u.isActive ? <Badge variant="success">Actif</Badge> : <Badge variant="danger">Suspendu</Badge>}
            {u.identityVerified
              ? <Badge variant="success">Identité vérifiée</Badge>
              : <Badge variant="warning">Identité non vérifiée</Badge>}
            {u.isOwner && <Badge variant="primary">Propriétaire</Badge>}
            {u.adminRole && <Badge variant="accent">{u.adminRole}</Badge>}
            {u.membershipTier && u.membershipTier !== "FREE" && <Badge variant="accent">{u.membershipTier}</Badge>}
            {activeByKind.size > 0 && (
              <Badge variant="danger">{activeByKind.size} restriction{activeByKind.size > 1 ? "s" : ""}</Badge>
            )}
            {u.lockedUntil && new Date(u.lockedUntil) > new Date() && (
              <Badge variant="warning">Verrouillé jusqu&apos;à {fmtDate(u.lockedUntil)}</Badge>
            )}
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2 mb-5">
        {u.isActive ? (
          <Btn variant="danger" disabled={busy}
            onClick={() => run(() => adminApi(`/users/${id}/suspend`, token!, { method: "POST", body: { reason: "Suspendu par un administrateur" } }), "Compte suspendu — sessions fermées.")}>
            Suspendre
          </Btn>
        ) : (
          <Btn variant="success" disabled={busy}
            onClick={() => run(() => adminApi(`/users/${id}/unsuspend`, token!, { method: "POST" }), "Compte réactivé.")}>
            Réactiver
          </Btn>
        )}
        <Btn variant="warning" disabled={busy}
          onClick={() => run(() => adminApi(`/users/${id}/force-logout`, token!, { method: "POST" }), "Sessions fermées.")}>
          Forcer la déconnexion
        </Btn>
        {u.identityVerified ? (
          <Btn variant="neutral" disabled={busy}
            onClick={() => run(() => adminApi(`/users/${id}/identity`, token!, { method: "POST", body: { decision: "DECLINE", reason: "Vérification révoquée" } }), "Vérification révoquée.")}>
            Révoquer l&apos;identité
          </Btn>
        ) : (
          <Btn variant="success" disabled={busy}
            onClick={() => run(() => adminApi(`/users/${id}/identity`, token!, { method: "POST", body: { decision: "APPROVE" } }), "Identité vérifiée — le badge apparaît immédiatement dans l'app.")}>
            Vérifier l&apos;identité
          </Btn>
        )}
        {u.lockedUntil && (
          <Btn variant="primary" disabled={busy}
            onClick={() => run(() => adminApi(`/users/${id}/unlock`, token!, { method: "POST" }), "Compte déverrouillé.")}>
            Déverrouiller
          </Btn>
        )}
        <Btn variant="neutral" onClick={openEdit}>Modifier</Btn>
        <a
          href={`/api/proxy/admin/users/${id}/export`}
          className="px-4 py-2 text-sm rounded-xl font-medium bg-surface text-text hover:opacity-80 transition cursor-pointer"
        >
          Exporter
        </a>
        <Btn variant="danger" onClick={() => setConfirmDelete(true)}>Anonymiser</Btn>
      </div>

      {(notice || error) && (
        <div className="mb-4 space-y-2">
          {notice && <Notice kind="success">{notice}</Notice>}
          {error && <Notice kind="danger">{error}</Notice>}
        </div>
      )}

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "profil", label: "Profil" },
          { id: "restrictions", label: "Restrictions", count: activeByKind.size },
          { id: "identite", label: "Identité", count: data.identityChecks.length },
          { id: "sessions", label: "Sessions & appareils", count: data.sessions.length + data.devices.length },
          { id: "audit", label: "Journal", count: data.audit.length },
        ]}
      />

      <div className="mt-5">
        {tab === "profil" && (
          <div className="space-y-4">
          {hasOwnerTrial && trial && (
            <section className="bg-card rounded-2xl border border-line p-5">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h3 className="font-semibold text-fg">Propriétaire — essai &amp; inscription</h3>
                <Badge variant={trial.variant}>{trial.label}</Badge>
              </div>
              <p className="text-xs text-muted mb-4">
                Essai gratuit de {TRIAL_DAYS} jours, puis frais d&apos;inscription pour garder le compte
                propriétaire actif.
                {!u.isOwner && " Ce compte n'est pas marqué propriétaire : ces réglages n'ont d'effet que s'il le devient."}
              </p>

              <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm mb-4">
                <div>
                  <dt className="text-xs text-muted mb-0.5">Début de l&apos;essai</dt>
                  <dd className="text-fg font-medium">
                    {trial.start !== null ? fmtDate(new Date(trial.start).toISOString()) : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted mb-0.5">Fin de l&apos;essai</dt>
                  <dd className="text-fg font-medium">
                    {trial.end !== null ? fmtDate(new Date(trial.end).toISOString()) : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted mb-0.5">Frais d&apos;inscription</dt>
                  <dd className="text-fg font-medium">{u.ownerPaid ? "Payés" : "Non payés"}</dd>
                </div>
              </dl>

              <div className="border-t border-line pt-4 space-y-4">
                <ToggleRow
                  label="Frais d'inscription payés"
                  hint="Activé : le compte propriétaire reste actif quel que soit l'état de l'essai."
                  checked={!!u.ownerPaid}
                  disabled={busy}
                  onChange={(next) => {
                    if (next) {
                      patchOwner({ ownerPaid: true }, "Frais d'inscription marqués comme payés.");
                    } else {
                      setTrialConfirm({
                        title: "Retirer le paiement",
                        body: "Le compte repasse sous le régime de l'essai. Si l'essai est terminé, le compte propriétaire sera verrouillé immédiatement.",
                        label: "Retirer le paiement",
                        patch: () => ({ ownerPaid: false }),
                        ok: "Paiement retiré.",
                      });
                    }
                  }}
                />

                <div className="flex flex-wrap gap-2">
                  <Btn variant="primary" disabled={busy}
                    onClick={() => setTrialConfirm({
                      title: `Redémarrer l'essai (${TRIAL_DAYS} j)`,
                      body: `Un nouvel essai de ${TRIAL_DAYS} jours démarre maintenant et le paiement est remis à « non payé ».`,
                      label: "Redémarrer",
                      patch: () => ({ ownerTrialStartedAt: new Date().toISOString(), ownerPaid: false }),
                      ok: `Essai redémarré — ${TRIAL_DAYS} jours restants.`,
                    })}>
                    Redémarrer l&apos;essai ({TRIAL_DAYS} j)
                  </Btn>
                  <Btn variant="danger" disabled={busy}
                    onClick={() => setTrialConfirm({
                      title: "Faire expirer l'essai",
                      body: "L'essai est daté d'il y a 8 jours et le paiement remis à « non payé » : le compte propriétaire sera verrouillé jusqu'au paiement.",
                      label: "Faire expirer",
                      patch: () => ({ ownerTrialStartedAt: new Date(Date.now() - 8 * DAY_MS).toISOString(), ownerPaid: false }),
                      ok: "Essai expiré — compte propriétaire verrouillé.",
                    })}>
                    Faire expirer l&apos;essai
                  </Btn>
                  <Btn variant="neutral" disabled={busy}
                    onClick={() => setTrialConfirm({
                      title: "Sans essai (ancien propriétaire)",
                      body: "La date d'essai est effacée : le compte est traité comme un propriétaire antérieur à l'essai.",
                      label: "Effacer l'essai",
                      patch: () => ({ ownerTrialStartedAt: null }),
                      ok: "Essai effacé — ancien propriétaire.",
                    })}>
                    Sans essai (ancien)
                  </Btn>
                </div>

                <div className="flex flex-wrap items-end gap-2">
                  <div className="w-full sm:w-64">
                    <Field label="Début d'essai personnalisé">
                      <input
                        type="datetime-local"
                        value={trialStartInput || toDateTimeInput(u.ownerTrialStartedAt)}
                        onChange={(e) => setTrialStartInput(e.target.value)}
                        className={inputClass}
                      />
                    </Field>
                  </div>
                  <Btn variant="neutral" disabled={busy || !trialStartInput}
                    onClick={() => {
                      const d = new Date(trialStartInput);
                      if (Number.isNaN(d.getTime())) {
                        setError("Date de début d'essai invalide.");
                        return;
                      }
                      patchOwner({ ownerTrialStartedAt: d.toISOString() }, "Date de début d'essai mise à jour.");
                      setTrialStartInput("");
                    }}>
                    Appliquer la date
                  </Btn>
                </div>
              </div>
            </section>
          )}
          <Card className="p-5">
            <dl className="grid grid-cols-2 gap-4 text-sm">
              {([
                ["Ville", u.city], ["Région", u.region], ["Quartier", u.neighborhood],
                ["Langue", u.locale], ["Abonnement", u.membershipTier],
                ["Expiration abonnement", u.membershipExpires ? fmtDate(u.membershipExpires) : null],
                ["Score Mobly", u.moblyScore?.toFixed(1)],
                ["Inscrit le", fmtDate(u.createdAt)], ["Dernière activité", fmtDate(u.lastSeenAt)],
                ["Vérifié le", fmtDate(u.verifiedAt)], ["Échecs de connexion", String(u.failedLoginCount)],
              ] as [string, string | null | undefined][]).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-text mb-0.5">{k}</dt>
                  <dd className="text-dark font-medium">{v || "—"}</dd>
                </div>
              ))}
            </dl>
            {u.bio && (
              <div className="mt-4 pt-4 border-t border-line">
                <p className="text-xs text-muted mb-1">Bio</p>
                <p className="text-sm text-fg whitespace-pre-line">{u.bio}</p>
              </div>
            )}
            {u.adminNote && (
              <div className="mt-4 pt-4 border-t border-border">
                <p className="text-xs text-text mb-1">Note interne</p>
                <p className="text-sm text-dark">{u.adminNote}</p>
              </div>
            )}
            <div className="mt-4 pt-4 border-t border-border grid grid-cols-3 gap-3">
              {Object.entries(data.counts).map(([k, v]) => (
                <div key={k}>
                  <p className="text-lg font-bold text-dark tabular-nums">{v}</p>
                  <p className="text-xs text-text">{k}</p>
                </div>
              ))}
            </div>
          </Card>
          </div>
        )}

        {tab === "restrictions" && (
          <Card className="p-5">
            <p className="text-sm text-text mb-4">
              Chaque interrupteur retire une capacité à ce compte. Le motif est affiché
              à l&apos;utilisateur dans l&apos;application, et la restriction prend effet immédiatement.
            </p>
            <div className="divide-y divide-border/40">
              {KINDS.map((k) => {
                const active = activeByKind.get(k.kind);
                return (
                  <div key={k.kind} className="flex items-start gap-4 py-3">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-dark">{k.label}</p>
                      {k.hint && <p className="text-xs text-text">{k.hint}</p>}
                      {active && (
                        <p className="text-xs text-danger mt-1">
                          {active.reason || active.message}
                          {active.expiresAt ? ` · jusqu'au ${fmtDate(active.expiresAt)}` : " · permanent"}
                        </p>
                      )}
                    </div>
                    <Toggle
                      checked={!!active}
                      disabled={busy}
                      label={k.label}
                      onChange={(next) => {
                        if (next) setRestrictTarget(k.kind);
                        else
                          run(
                            () => adminApi(`/users/${id}/restrictions/${active!.id}`, token!, { method: "DELETE" }),
                            "Restriction levée.",
                          );
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {tab === "identite" && (
          <Card className="p-5">
            {data.identityChecks.length === 0 ? (
              <p className="text-sm text-text">Aucune vérification engagée.</p>
            ) : (
              <div className="space-y-3">
                {data.identityChecks.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 text-sm">
                    <Badge
                      variant={
                        c.status === "APPROVED" ? "success"
                        : c.status === "DECLINED" ? "danger"
                        : c.status === "PENDING" || c.status === "IN_REVIEW" ? "warning"
                        : "neutral"
                      }
                    >
                      {c.status}
                    </Badge>
                    <span className="text-text">{fmtDate(c.createdAt)}</span>
                    {c.reason && <span className="text-danger text-xs">{c.reason}</span>}
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2 mt-5 pt-4 border-t border-border">
              <Btn variant="success" disabled={busy}
                onClick={() => run(() => adminApi(`/users/${id}/identity`, token!, { method: "POST", body: { decision: "APPROVE" } }), "Identité approuvée.")}>
                Approuver
              </Btn>
              <Btn variant="danger" disabled={busy}
                onClick={() => run(() => adminApi(`/users/${id}/identity`, token!, { method: "POST", body: { decision: "DECLINE", reason: "Document non conforme" } }), "Vérification refusée.")}>
                Refuser
              </Btn>
              <Btn variant="neutral" disabled={busy}
                onClick={() => run(() => adminApi(`/users/${id}/identity`, token!, { method: "POST", body: { decision: "RESET" } }), "Vérification réinitialisée.")}>
                Réinitialiser
              </Btn>
            </div>
          </Card>
        )}

        {tab === "sessions" && (
          <div className="space-y-4">
            <Card className="p-5">
              <h3 className="font-semibold text-dark mb-3">Sessions actives</h3>
              {data.sessions.length === 0 ? (
                <p className="text-sm text-text">Aucune session.</p>
              ) : (
                data.sessions.map((s) => (
                  <div key={s.familyId} className="flex items-center gap-3 py-2 text-sm border-b border-border/30 last:border-0">
                    <div className="flex-1">
                      <p className="text-dark">{s.ip || "IP inconnue"}</p>
                      <p className="text-xs text-text truncate max-w-lg">{s.userAgent || "—"}</p>
                    </div>
                    <span className="text-xs text-text">{fmtDate(s.createdAt)}</span>
                    <Btn size="sm" variant="danger" disabled={busy}
                      onClick={() => run(() => adminApi(`/users/${id}/sessions/${s.familyId}`, token!, { method: "DELETE" }), "Session révoquée.")}>
                      Révoquer
                    </Btn>
                  </div>
                ))
              )}
            </Card>
            <Card className="p-5">
              <h3 className="font-semibold text-dark mb-3">Appareils</h3>
              {data.devices.length === 0 ? (
                <p className="text-sm text-text">Aucun appareil enregistré.</p>
              ) : (
                data.devices.map((d) => (
                  <div key={d.id} className="flex items-center gap-3 py-2 text-sm border-b border-border/30 last:border-0">
                    <div className="flex-1">
                      <p className="text-dark">{d.platform} {d.appVersion ? `· v${d.appVersion}` : ""}</p>
                      <p className="text-xs text-text">Vu {fmtDate(d.lastSeenAt)}</p>
                    </div>
                    {d.hasPush && <Badge variant="primary">Push</Badge>}
                    <Btn size="sm" variant="danger" disabled={busy}
                      onClick={() => run(() => adminApi(`/users/${id}/devices/${d.id}`, token!, { method: "DELETE" }), "Appareil retiré.")}>
                      Retirer
                    </Btn>
                  </div>
                ))
              )}
            </Card>
          </div>
        )}

        {tab === "audit" && (
          <Card className="p-5 space-y-4">
            {data.audit.length === 0 ? (
              <p className="text-sm text-text">Aucune action enregistrée.</p>
            ) : (
              data.audit.map((a) => (
                <div key={a.id} className="border-b border-border/30 pb-4 last:border-0 last:pb-0">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="primary">{a.action}</Badge>
                    <span className="text-xs text-text">
                      {a.actor?.fullName} · {fmtDate(a.createdAt)}
                    </span>
                  </div>
                  {Boolean(a.before || a.after) && <JsonDiff before={a.before} after={a.after} />}
                </div>
              ))
            )}
          </Card>
        )}
      </div>

      {/* Grant a restriction */}
      <Modal
        open={!!restrictTarget}
        onClose={() => setRestrictTarget(null)}
        title={`Restreindre : ${KINDS.find((k) => k.kind === restrictTarget)?.label ?? ""}`}
      >
        <div className="space-y-4">
          <Field label="Motif" hint="Affiché à l'utilisateur dans l'application.">
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex. Spam répété dans les conversations"
              className={inputClass}
            />
          </Field>
          <Field label="Durée">
            <div className="flex flex-wrap gap-2">
              {DURATIONS.map((d) => (
                <button
                  key={d.label}
                  type="button"
                  onClick={() => setMinutes(d.minutes)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition cursor-pointer ${
                    minutes === d.minutes
                      ? "border-primary text-primary bg-primary/5"
                      : "border-border text-text hover:border-primary"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </Field>
          {restrictTarget === "LOGIN" && (
            <Notice kind="danger">
              Un bannissement ferme toutes les sessions et empêche toute reconnexion.
            </Notice>
          )}
          <div className="flex gap-2">
            <Btn variant="danger" disabled={busy} onClick={() => grant(restrictTarget!)}>
              Appliquer
            </Btn>
            <Btn variant="neutral" onClick={() => setRestrictTarget(null)}>Annuler</Btn>
          </div>
        </div>
      </Modal>

      {/* Edit profile — every field PATCH /admin/users/:id accepts */}
      <Modal open={!!form} onClose={() => setForm(null)} title="Modifier le profil" wide>
        {form && (
          <div className="space-y-5">
            <FormSection title="Profil">
              <Field label="Nom complet">
                <input value={form.fullName} maxLength={120}
                  onChange={(e) => setF("fullName", e.target.value)} className={inputClass} />
              </Field>
              <Field label="Langue">
                <select value={form.locale}
                  onChange={(e) => setF("locale", e.target.value === "en" ? "en" : "fr")} className={inputClass}>
                  <option value="fr">Français</option>
                  <option value="en">English</option>
                </select>
              </Field>
              <Field label="E-mail" hint="Laisser vide pour retirer l'adresse.">
                <input type="email" value={form.email} placeholder="nom@exemple.com"
                  onChange={(e) => setF("email", e.target.value)} className={inputClass} />
              </Field>
              <Field label="Téléphone">
                <input type="tel" value={form.phone} maxLength={20} placeholder="+237 6XX XX XX XX"
                  onChange={(e) => setF("phone", e.target.value)} className={inputClass} />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Bio" hint={`${form.bio.length} / 1000`}>
                  <textarea value={form.bio} maxLength={1000}
                    onChange={(e) => setF("bio", e.target.value)} className={`${inputClass} resize-y h-24`} />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="URL de l'avatar" hint="Laisser vide pour revenir aux initiales.">
                  <div className="flex items-center gap-3">
                    {form.avatarUrl.trim() && brokenAvatar !== form.avatarUrl.trim() ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={form.avatarUrl.trim()}
                        alt="Aperçu de l'avatar"
                        onError={() => setBrokenAvatar(form.avatarUrl.trim())}
                        className="w-10 h-10 rounded-full object-cover border border-line shrink-0"
                      />
                    ) : (
                      <span
                        title={form.avatarUrl.trim() ? "Image introuvable" : "Aucune image"}
                        className={`w-10 h-10 rounded-full border border-dashed shrink-0 flex items-center justify-center text-[10px] ${
                          form.avatarUrl.trim() ? "border-danger text-danger" : "border-line text-muted"
                        }`}
                      >
                        {form.avatarUrl.trim() ? "!" : "—"}
                      </span>
                    )}
                    <input type="url" value={form.avatarUrl} placeholder="https://…"
                      onChange={(e) => setF("avatarUrl", e.target.value)} className={inputClass} />
                  </div>
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Couleur de l'avatar" hint="Format #RRGGBB — utilisée derrière les initiales.">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-white text-xs font-bold ${
                        HEX_COLOR.test(form.avatarColor.trim()) ? "" : "border border-dashed border-line"
                      }`}
                      style={HEX_COLOR.test(form.avatarColor.trim()) ? { background: form.avatarColor.trim() } : undefined}
                    >
                      {HEX_COLOR.test(form.avatarColor.trim()) ? (form.fullName || u.fullName).slice(0, 2).toUpperCase() : ""}
                    </span>
                    <input
                      type="color"
                      aria-label="Choisir la couleur"
                      value={HEX_COLOR.test(form.avatarColor.trim()) ? form.avatarColor.trim().toLowerCase() : "#3a4ff0"}
                      onChange={(e) => setF("avatarColor", e.target.value.toUpperCase())}
                      className="h-10 w-12 shrink-0 rounded-lg border border-line bg-transparent p-0.5 cursor-pointer"
                    />
                    <input value={form.avatarColor} maxLength={7} placeholder="#3A4FF0"
                      onChange={(e) => setF("avatarColor", e.target.value)}
                      className={`${inputClass} font-mono ${
                        form.avatarColor.trim() && !HEX_COLOR.test(form.avatarColor.trim()) ? "border-danger" : ""
                      }`} />
                    <Btn size="sm" variant="neutral" disabled={!form.avatarColor} onClick={() => setF("avatarColor", "")}>
                      Effacer
                    </Btn>
                  </div>
                </Field>
              </div>
            </FormSection>

            <FormSection title="Localisation">
              <Field label="Ville">
                <input value={form.city} maxLength={80}
                  onChange={(e) => setF("city", e.target.value)} className={inputClass} />
              </Field>
              <Field label="Région">
                <input value={form.region} maxLength={80}
                  onChange={(e) => setF("region", e.target.value)} className={inputClass} />
              </Field>
              <Field label="Quartier">
                <input value={form.neighborhood} maxLength={80}
                  onChange={(e) => setF("neighborhood", e.target.value)} className={inputClass} />
              </Field>
            </FormSection>

            <FormSection title="Adhésion">
              <Field label="Abonnement" hint="Ex. FREE, PREMIUM — vide pour aucun.">
                <input value={form.membershipTier} maxLength={40} list="membership-tiers"
                  onChange={(e) => setF("membershipTier", e.target.value)} className={inputClass} />
                <datalist id="membership-tiers">
                  <option value="FREE" />
                  <option value="PREMIUM" />
                </datalist>
              </Field>
              <Field label="Expiration de l'abonnement" hint="Valable jusqu'à la fin de ce jour.">
                <div className="flex items-center gap-2">
                  <input type="date" value={form.membershipExpires}
                    onChange={(e) => setF("membershipExpires", e.target.value)} className={inputClass} />
                  {form.membershipExpires && (
                    <Btn size="sm" variant="neutral" onClick={() => setF("membershipExpires", "")}>Effacer</Btn>
                  )}
                </div>
              </Field>
              <Field label="Score Mobly" hint="Entre 0 et 5 — vide pour aucun score.">
                <input type="number" inputMode="decimal" min={0} max={5} step={0.1} value={form.moblyScore}
                  onChange={(e) => setF("moblyScore", e.target.value)} className={inputClass} />
              </Field>
            </FormSection>

            <FormSection title="Statut">
              <ToggleRow label="Propriétaire" hint="Peut publier des annonces."
                checked={form.isOwner} onChange={(v) => setF("isOwner", v)} />
              <ToggleRow label="Compte vérifié" hint="Téléphone / e-mail confirmé."
                checked={form.verified} onChange={(v) => setF("verified", v)} />
              <ToggleRow label="Identité vérifiée" hint="Badge visible dans l'app ; date de vérification mise à jour."
                checked={form.identityVerified} onChange={(v) => setF("identityVerified", v)} />
            </FormSection>

            <section className="border-t border-line pt-4">
              <h3 className="text-sm font-semibold text-fg mb-3">Note interne</h3>
              <Field label="Note" hint={`Jamais visible par l'utilisateur · ${form.adminNote.length} / 2000`}>
                <textarea value={form.adminNote} maxLength={2000}
                  onChange={(e) => setF("adminNote", e.target.value)} className={`${inputClass} resize-y h-24`} />
              </Field>
            </section>

            {formError && <Notice kind="danger">{formError}</Notice>}

            <div className="flex gap-2 border-t border-line pt-4">
              <Btn variant="primary" disabled={busy} onClick={saveEdit}>
                {busy ? "Enregistrement…" : "Enregistrer"}
              </Btn>
              <Btn variant="neutral" onClick={() => setForm(null)}>Annuler</Btn>
            </div>
          </div>
        )}
      </Modal>

      {/* Owner-trial confirmation */}
      <Modal open={!!trialConfirm} onClose={() => setTrialConfirm(null)} title={trialConfirm?.title ?? ""}>
        {trialConfirm && (
          <div className="space-y-4">
            <p className="text-sm text-muted">{trialConfirm.body}</p>
            <div className="flex gap-2">
              <Btn variant="danger" disabled={busy}
                onClick={() => {
                  // Timestamps are computed at confirm time, not when the dialog opened.
                  patchOwner(trialConfirm.patch(), trialConfirm.ok);
                  setTrialConfirm(null);
                }}>
                {trialConfirm.label}
              </Btn>
              <Btn variant="neutral" onClick={() => setTrialConfirm(null)}>Annuler</Btn>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          run(
            () => adminApi(`/users/${id}/anonymize`, token!, { method: "POST", confirm: id }),
            "Compte anonymisé.",
          );
          setConfirmDelete(false);
        }}
        title="Anonymiser ce compte"
        phrase={id}
        busy={busy}
        confirmLabel="Anonymiser"
        body={
          <>
            <p>
              Les données personnelles sont effacées et le compte désactivé. Les conversations
              et avis liés sont conservés pour ne pas casser les fils des autres utilisateurs.
            </p>
            <p className="text-danger font-medium">Cette action est irréversible.</p>
          </>
        }
      />
    </div>
  );
}
