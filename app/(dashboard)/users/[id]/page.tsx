"use client";

import { useCallback, useEffect, useState } from "react";
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
  membershipTier?: string | null; moblyScore?: number | null; adminNote?: string | null;
  failedLoginCount: number; lockedUntil?: string | null;
  createdAt: string; lastSeenAt?: string | null;
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
  const [edit, setEdit] = useState<Partial<UserFull> | null>(null);

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
        <Btn variant="neutral" onClick={() => setEdit({ ...u })}>Modifier</Btn>
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
          <Card className="p-5">
            <dl className="grid grid-cols-2 gap-4 text-sm">
              {([
                ["Ville", u.city], ["Région", u.region], ["Quartier", u.neighborhood],
                ["Langue", u.locale], ["Abonnement", u.membershipTier],
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

      {/* Edit profile */}
      <Modal open={!!edit} onClose={() => setEdit(null)} title="Modifier le profil" wide>
        {edit && (
          <div className="grid grid-cols-2 gap-4">
            {([
              ["fullName", "Nom complet"], ["email", "E-mail"], ["phone", "Téléphone"],
              ["city", "Ville"], ["region", "Région"], ["membershipTier", "Abonnement"],
            ] as const).map(([key, label]) => (
              <Field key={key} label={label}>
                <input
                  value={(edit[key] as string) ?? ""}
                  onChange={(e) => setEdit({ ...edit, [key]: e.target.value })}
                  className={inputClass}
                />
              </Field>
            ))}
            <div className="col-span-2">
              <Field label="Note interne" hint="Jamais visible par l'utilisateur.">
                <textarea
                  value={edit.adminNote ?? ""}
                  onChange={(e) => setEdit({ ...edit, adminNote: e.target.value })}
                  className={`${inputClass} resize-none h-20`}
                />
              </Field>
            </div>
            <div className="col-span-2 flex gap-2">
              <Btn
                variant="primary"
                disabled={busy}
                onClick={() => {
                  const body = {
                    fullName: edit.fullName, email: edit.email || null, phone: edit.phone,
                    city: edit.city || null, region: edit.region || null,
                    membershipTier: edit.membershipTier || null, adminNote: edit.adminNote || null,
                  };
                  run(() => adminApi(`/users/${id}`, token!, { method: "PATCH", body }), "Profil mis à jour.");
                  setEdit(null);
                }}
              >
                Enregistrer
              </Btn>
              <Btn variant="neutral" onClick={() => setEdit(null)}>Annuler</Btn>
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
