"use client";

import { useCallback, useEffect, useState } from "react";
import { adminApi, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  Badge, Btn, Card, Field, Notice, Spinner, Tabs, Toggle, inputClass,
} from "@/components/ui";

/**
 * The remote control itself: feature switches, numeric limits, editable copy,
 * boost plans, versions, geo and the security policy.
 *
 * Changes are batched — an operator toggles several things and saves once —
 * because each save is a version bump broadcast to every connected app.
 */

interface Flag { enabled: boolean; message?: string | null }
type Config = Record<string, unknown> & {
  flags: Record<string, Flag>;
  limits: Record<string, unknown>;
  copy: Record<string, unknown>;
  versions: { ios: Record<string, string> };
  geo: Record<string, unknown>;
  boost: { plans: { id: string; days: number; priceFcfa: number; label: string; popular: boolean }[] };
  security?: Record<string, unknown>;
  moderation?: { blockedWords: string[]; autoPauseListingAfterReports: number };
};

/** French labels, grouped so the page reads as areas of the product. */
const FLAG_GROUPS: { title: string; flags: [string, string][] }[] = [
  {
    title: "Messagerie et appels",
    flags: [
      ["chat.enabled", "Ouvrir des conversations"],
      ["chat.send", "Envoyer des messages"],
      ["chat.media", "Photos dans le chat"],
      ["chat.voice", "Messages vocaux"],
      ["chat.location", "Partage de position"],
      ["calls.audio", "Appels audio"],
      ["calls.video", "Appels vidéo"],
    ],
  },
  {
    title: "Annonces et propriétaires",
    flags: [
      ["listings.publish", "Publier une annonce"],
      ["listings.edit", "Modifier une annonce"],
      ["owners.signup", "Devenir propriétaire"],
      ["owners.identityRequired", "Vérification d'identité obligatoire pour publier"],
      ["identity.verification", "Vérification d'identité disponible"],
      ["boost.enabled", "Boosts"],
    ],
  },
  {
    title: "Visites et avis",
    flags: [
      ["visits.request", "Demander une visite"],
      ["visits.invite", "Inviter à une visite"],
      ["reviews.post", "Publier un avis"],
      ["reports.file", "Signalements"],
    ],
  },
  {
    title: "Inscription et connexion",
    flags: [
      ["signup.enabled", "Inscriptions ouvertes"],
      ["signup.method.otp", "Connexion par SMS"],
      ["signup.method.password", "Connexion par mot de passe"],
      ["signup.method.apple", "Sign in with Apple"],
      ["signup.method.google", "Google Sign-In"],
      ["password.reset", "Mot de passe oublié"],
    ],
  },
  {
    title: "Découverte et divers",
    flags: [
      ["favorites", "Favoris"],
      ["maps", "Cartes"],
      ["share", "Partage d'annonce"],
      ["search.savedSearches", "Recherches enregistrées"],
      ["home.carousel", "Carrousel d'accueil"],
      ["notifications.push", "Notifications push"],
      ["analytics", "Analytique"],
      ["ads.banner", "Bannière publicitaire"],
      ["account.delete", "Suppression de compte"],
    ],
  },
];

const LIMIT_LABELS: Record<string, string> = {
  maxPhotosPerListing: "Photos max par annonce",
  maxListingsPerOwner: "Annonces max par propriétaire",
  priceMinFcfa: "Prix minimum (FCFA)",
  priceMaxFcfa: "Prix maximum (FCFA)",
  titleMaxLength: "Longueur max du titre",
  aboutMaxLength: "Longueur max de la description",
  messageMaxLength: "Longueur max d'un message",
  reviewMinChars: "Longueur min d'un avis",
  reviewMaxChars: "Longueur max d'un avis",
  visitNoteMaxLength: "Longueur max de la note de visite",
  visitsPerDayPerUser: "Visites par jour et par utilisateur",
  visitMinHoursAhead: "Délai minimum avant une visite (h)",
  threadsPerDayPerUser: "Conversations par jour",
  reportsPerDay: "Signalements par jour",
  favoritesMax: "Favoris max",
  searchResultsMax: "Résultats de recherche max",
  listingCacheTtlSec: "Cache des annonces (s)",
};

const RATE_LABELS: Record<string, string> = {
  global: "Global (toutes requêtes)",
  auth: "Authentification",
  otpRequest: "Demandes de code SMS",
  smsSend: "Envois de SMS",
  otpVerify: "Vérifications de code",
  write: "Écritures",
  adminWrite: "Écritures admin",
};

export default function ConfigPage() {
  const { token, user } = useAuth();
  const [cfg, setCfg] = useState<Config | null>(null);
  const [version, setVersion] = useState(0);
  const [patch, setPatch] = useState<Record<string, unknown>>({});
  const [tab, setTab] = useState("fonctionnalites");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const isSuper = user?.adminRole === "SUPER_ADMIN";

  const load = useCallback(() => {
    if (!token) return;
    adminApi<{ config: Config; version: number }>("/config", token)
      .then((d) => { setCfg(d.config); setVersion(d.version); setPatch({}); })
      .catch((e) => setError(String(e.message)));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const dirty = Object.keys(patch).length > 0;

  /** Stage a change in the pending patch without writing to the server yet. */
  function stage(section: string, updater: (current: Record<string, unknown>) => Record<string, unknown>) {
    setPatch((p) => {
      const existing = (p[section] as Record<string, unknown>) ?? {};
      return { ...p, [section]: updater(existing) };
    });
  }

  /** Effective value: the pending edit if there is one, else what is stored. */
  function flagValue(key: string): Flag {
    const staged = (patch.flags as Record<string, Flag> | undefined)?.[key];
    return staged ?? cfg!.flags[key] ?? { enabled: true, message: null };
  }

  function limitValue(key: string): number {
    const staged = (patch.limits as Record<string, number> | undefined)?.[key];
    return (staged ?? (cfg!.limits[key] as number)) ?? 0;
  }

  function rateValue(key: string): number {
    const stagedSection = (patch.limits as { rateLimits?: Record<string, number> } | undefined)?.rateLimits;
    const stored = (cfg!.limits.rateLimits as Record<string, number>) ?? {};
    return stagedSection?.[key] ?? stored[key] ?? 0;
  }

  async function save() {
    if (!token || !dirty) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const res = await adminApi<{ config: Config; version: number }>("/config", token, {
        method: "PUT",
        body: patch,
      });
      setCfg(res.config);
      setVersion(res.version);
      setPatch({});
      setNotice(`Configuration enregistrée (v${res.version}) — appliquée immédiatement dans l'application.`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (!cfg) return <div className="flex items-center justify-center py-24"><Spinner /></div>;

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-3 mb-1">
        <h1 className="text-2xl font-bold text-dark">Configuration</h1>
        <Badge variant="neutral">v{version}</Badge>
      </div>
      <p className="text-sm text-text mb-6">
        Contrôle l&apos;application à distance. Chaque enregistrement est diffusé aux
        appareils connectés en quelques secondes.
      </p>

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "fonctionnalites", label: "Fonctionnalités" },
          { id: "limites", label: "Limites" },
          { id: "boost", label: "Boosts" },
          { id: "contenu", label: "Contenu" },
          { id: "versions", label: "Versions" },
          ...(isSuper ? [{ id: "securite", label: "Sécurité" }] : []),
        ]}
      />

      <div className="mt-5 space-y-4">
        {tab === "fonctionnalites" &&
          FLAG_GROUPS.map((group) => (
            <Card key={group.title} className="p-5">
              <h3 className="font-semibold text-dark mb-3">{group.title}</h3>
              <div className="divide-y divide-border/40">
                {group.flags.map(([key, label]) => {
                  const f = flagValue(key);
                  return (
                    <div key={key} className="py-3">
                      <div className="flex items-center gap-4">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-dark">{label}</p>
                          <code className="text-xs text-text">{key}</code>
                        </div>
                        {!f.enabled && <Badge variant="danger">Désactivé</Badge>}
                        <Toggle
                          checked={f.enabled}
                          label={label}
                          onChange={(enabled) =>
                            stage("flags", (cur) => ({
                              ...cur,
                              [key]: { ...f, enabled },
                            }))
                          }
                        />
                      </div>
                      {!f.enabled && (
                        <input
                          value={f.message ?? ""}
                          placeholder="Message affiché à l'utilisateur (optionnel)"
                          onChange={(e) =>
                            stage("flags", (cur) => ({
                              ...cur,
                              [key]: { ...f, message: e.target.value || null },
                            }))
                          }
                          className={`${inputClass} mt-2`}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}

        {tab === "limites" && (
          <>
            <Card className="p-5">
              <h3 className="font-semibold text-dark mb-4">Limites produit</h3>
              <div className="grid grid-cols-2 gap-4">
                {Object.entries(LIMIT_LABELS).map(([key, label]) => (
                  <Field key={key} label={label}>
                    <input
                      type="number"
                      value={limitValue(key)}
                      onChange={(e) =>
                        stage("limits", (cur) => ({ ...cur, [key]: Number(e.target.value) || 0 }))
                      }
                      className={inputClass}
                    />
                  </Field>
                ))}
              </div>
            </Card>
            <Card className="p-5">
              <h3 className="font-semibold text-dark mb-1">Limites de débit</h3>
              <p className="text-xs text-text mb-4">
                Requêtes autorisées par fenêtre de 15 minutes et par adresse IP.
              </p>
              <div className="grid grid-cols-2 gap-4">
                {Object.entries(RATE_LABELS).map(([key, label]) => (
                  <Field key={key} label={label}>
                    <input
                      type="number"
                      value={rateValue(key)}
                      onChange={(e) => {
                        const n = Number(e.target.value) || 1;
                        stage("limits", (cur) => ({
                          ...cur,
                          rateLimits: { ...((cur.rateLimits as object) ?? {}), [key]: n },
                        }));
                      }}
                      className={inputClass}
                    />
                  </Field>
                ))}
              </div>
            </Card>
          </>
        )}

        {tab === "boost" && (
          <Card className="p-5">
            <h3 className="font-semibold text-dark mb-4">Forfaits de boost</h3>
            <div className="space-y-3">
              {((patch.boost as Config["boost"])?.plans ?? cfg.boost.plans).map((plan, i) => (
                <div key={plan.id} className="grid grid-cols-4 gap-3 items-end">
                  <Field label="Libellé">
                    <input
                      value={plan.label}
                      onChange={(e) => {
                        const plans = [...((patch.boost as Config["boost"])?.plans ?? cfg.boost.plans)];
                        plans[i] = { ...plan, label: e.target.value };
                        setPatch((p) => ({ ...p, boost: { plans } }));
                      }}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Jours">
                    <input
                      type="number"
                      value={plan.days}
                      onChange={(e) => {
                        const plans = [...((patch.boost as Config["boost"])?.plans ?? cfg.boost.plans)];
                        plans[i] = { ...plan, days: Number(e.target.value) || 1 };
                        setPatch((p) => ({ ...p, boost: { plans } }));
                      }}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Prix (FCFA)">
                    <input
                      type="number"
                      value={plan.priceFcfa}
                      onChange={(e) => {
                        const plans = [...((patch.boost as Config["boost"])?.plans ?? cfg.boost.plans)];
                        plans[i] = { ...plan, priceFcfa: Number(e.target.value) || 0 };
                        setPatch((p) => ({ ...p, boost: { plans } }));
                      }}
                      className={inputClass}
                    />
                  </Field>
                  <div className="flex items-center gap-2 pb-2">
                    <Toggle
                      checked={plan.popular}
                      label="Populaire"
                      onChange={(popular) => {
                        const plans = [...((patch.boost as Config["boost"])?.plans ?? cfg.boost.plans)];
                        plans[i] = { ...plan, popular };
                        setPatch((p) => ({ ...p, boost: { plans } }));
                      }}
                    />
                    <span className="text-xs text-text">Populaire</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {tab === "contenu" && (
          <Card className="p-5 space-y-4">
            <h3 className="font-semibold text-dark">Textes de l&apos;application</h3>
            {([
              ["featureDisabledMessage", "Message par défaut « fonctionnalité indisponible »"],
              ["suspendedMessage", "Message « compte suspendu »"],
              ["signupClosedMessage", "Message « inscriptions fermées »"],
              ["supportEmail", "E-mail du support"],
              ["supportWhatsapp", "WhatsApp du support"],
            ] as const).map(([key, label]) => (
              <Field key={key} label={label}>
                <input
                  value={
                    ((patch.copy as Record<string, string>)?.[key] ??
                      (cfg.copy[key] as string)) ?? ""
                  }
                  onChange={(e) => stage("copy", (cur) => ({ ...cur, [key]: e.target.value }))}
                  className={inputClass}
                />
              </Field>
            ))}
          </Card>
        )}

        {tab === "versions" && (
          <Card className="p-5 space-y-4">
            <h3 className="font-semibold text-dark">Versions iOS</h3>
            <Notice kind="danger">
              Une version minimale supérieure à la version installée bloque
              l&apos;application derrière un écran de mise à jour. « 0.0.0 » désactive le contrôle.
            </Notice>
            {([
              ["min", "Version minimale supportée"],
              ["latest", "Dernière version publiée"],
              ["storeUrl", "Lien App Store"],
              ["forceMessage", "Message de mise à jour"],
            ] as const).map(([key, label]) => (
              <Field key={key} label={label}>
                <input
                  value={
                    ((patch.versions as { ios?: Record<string, string> })?.ios?.[key] ??
                      cfg.versions.ios[key]) ?? ""
                  }
                  onChange={(e) =>
                    setPatch((p) => ({
                      ...p,
                      versions: {
                        ios: {
                          ...((p.versions as { ios?: object })?.ios ?? {}),
                          [key]: e.target.value,
                        },
                      },
                    }))
                  }
                  className={inputClass}
                />
              </Field>
            ))}
          </Card>
        )}

        {tab === "securite" && isSuper && cfg.security && (
          <Card className="p-5 space-y-4">
            <h3 className="font-semibold text-dark">Politique de sécurité</h3>
            <Notice kind="danger">
              Réservé au super administrateur. Une liste blanche d&apos;IP qui exclut
              votre propre adresse est refusée — impossible de vous enfermer dehors.
            </Notice>
            <Field
              label="Liste blanche d'IP admin"
              hint="Une par ligne. Vide = aucune restriction d'adresse."
            >
              <textarea
                value={
                  (((patch.security as { adminIpAllowlist?: string[] })?.adminIpAllowlist ??
                    (cfg.security.adminIpAllowlist as string[])) ?? []).join("\n")
                }
                onChange={(e) =>
                  stage("security", (cur) => ({
                    ...cur,
                    adminIpAllowlist: e.target.value
                      .split("\n")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  }))
                }
                className={`${inputClass} h-24 font-mono resize-none`}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Échecs avant verrouillage" hint="0 désactive le verrouillage.">
                <input
                  type="number"
                  value={
                    ((patch.security as { lockout?: { maxFails?: number } })?.lockout?.maxFails ??
                      (cfg.security.lockout as { maxFails: number }).maxFails) ?? 0
                  }
                  onChange={(e) =>
                    stage("security", (cur) => ({
                      ...cur,
                      lockout: {
                        ...((cur.lockout as object) ??
                          (cfg.security!.lockout as object)),
                        maxFails: Number(e.target.value) || 0,
                      },
                    }))
                  }
                  className={inputClass}
                />
              </Field>
              <Field label="Durée du verrouillage (min)">
                <input
                  type="number"
                  value={
                    ((patch.security as { lockout?: { lockMinutes?: number } })?.lockout?.lockMinutes ??
                      (cfg.security.lockout as { lockMinutes: number }).lockMinutes) ?? 15
                  }
                  onChange={(e) =>
                    stage("security", (cur) => ({
                      ...cur,
                      lockout: {
                        ...((cur.lockout as object) ??
                          (cfg.security!.lockout as object)),
                        lockMinutes: Number(e.target.value) || 1,
                      },
                    }))
                  }
                  className={inputClass}
                />
              </Field>
            </div>
            <Field
              label="Mots bloqués"
              hint="Un par ligne. Un message qui en contient un est refusé."
            >
              <textarea
                value={
                  (((patch.moderation as { blockedWords?: string[] })?.blockedWords ??
                    cfg.moderation?.blockedWords) ?? []).join("\n")
                }
                onChange={(e) =>
                  stage("moderation", (cur) => ({
                    ...cur,
                    blockedWords: e.target.value
                      .split("\n")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  }))
                }
                className={`${inputClass} h-24 resize-none`}
              />
            </Field>
          </Card>
        )}
      </div>

      {/* Sticky save bar — a batched save is one version bump for the fleet. */}
      <div className="sticky bottom-0 mt-6 -mx-8 px-8 py-4 bg-surface/95 backdrop-blur border-t border-border">
        <div className="flex items-center gap-3">
          <Btn variant="primary" onClick={save} disabled={!dirty || saving}>
            {saving ? "Enregistrement…" : dirty ? "Enregistrer les modifications" : "Aucune modification"}
          </Btn>
          {dirty && (
            <Btn variant="neutral" onClick={() => setPatch({})}>Annuler</Btn>
          )}
          <div className="ml-auto flex-1 max-w-lg">
            {notice && <Notice kind="success">{notice}</Notice>}
            {error && <Notice kind="danger">{error}</Notice>}
          </div>
        </div>
      </div>
    </div>
  );
}
