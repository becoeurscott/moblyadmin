"use client";

import { useAuth } from "@/lib/auth";
import { adminApi } from "@/lib/api";
import { useCallback, useEffect, useState, type FormEvent } from "react";

interface Maintenance {
  enabled: boolean;
  message: string | null;
  endsAt: string | null;
  startedAt: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  serverTime: string;
}

interface Duration {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

const ZERO: Duration = { days: 0, hours: 0, minutes: 0, seconds: 0 };

const PRESETS: { label: string; d: Duration }[] = [
  { label: "15 min", d: { ...ZERO, minutes: 15 } },
  { label: "30 min", d: { ...ZERO, minutes: 30 } },
  { label: "1 h", d: { ...ZERO, hours: 1 } },
  { label: "2 h", d: { ...ZERO, hours: 2 } },
  { label: "6 h", d: { ...ZERO, hours: 6 } },
  { label: "1 jour", d: { ...ZERO, days: 1 } },
];

function totalSeconds(d: Duration) {
  return d.days * 86400 + d.hours * 3600 + d.minutes * 60 + d.seconds;
}

/** "2 j 04:30:09" — the same shape the app's countdown renders. */
function formatRemaining(ms: number) {
  if (ms <= 0) return "terminé";
  const s = Math.floor(ms / 1000);
  const days = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const clock = [h, m, sec].map((n) => String(n).padStart(2, "0")).join(":");
  return days > 0 ? `${days} j ${clock}` : clock;
}

export default function MaintenancePage() {
  const { token } = useAuth();
  const [state, setState] = useState<Maintenance | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [message, setMessage] = useState("");
  const [duration, setDuration] = useState<Duration>({ ...ZERO, hours: 1 });

  // Ticks once a second purely to re-render the live countdown.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const res = await adminApi<Maintenance>("/maintenance", token);
      setState(res);
      setMessage(res.message ?? "");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function save(enabled: boolean) {
    if (!token) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const res = await adminApi<Maintenance>("/maintenance", token, {
        method: "PUT",
        body: {
          enabled,
          message: message.trim() || null,
          duration: enabled ? duration : null,
        },
      });
      setState(res);
      setNotice(
        enabled
          ? "Maintenance activée — l'application est bloquée pour tous les utilisateurs."
          : "Maintenance levée — l'application est de nouveau accessible.",
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    save(true);
  }

  const active = state?.enabled === true;
  const endsAt = state?.endsAt ? new Date(state.endsAt) : null;
  const remaining = endsAt ? endsAt.getTime() - Date.now() : null;
  const previewSecs = totalSeconds(duration);

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-dark mb-6">Maintenance</h1>
        <div className="h-40 bg-white rounded-2xl border border-border/50 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-dark mb-1">Maintenance</h1>
      <p className="text-sm text-text mb-6">
        Bloque l&apos;application pour tous les utilisateurs et affiche un écran
        d&apos;attente avec un compte à rebours. Les comptes administrateurs ne
        sont jamais bloqués.
      </p>

      {/* ── Current status ─────────────────────────────────────── */}
      <div
        className={`rounded-2xl border p-6 mb-6 ${
          active
            ? "bg-danger/5 border-danger/30"
            : "bg-white border-border/50 shadow-sm"
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  active ? "bg-danger animate-pulse" : "bg-success"
                }`}
              />
              <h2 className="text-lg font-semibold text-dark">
                {active ? "Application bloquée" : "Application en ligne"}
              </h2>
            </div>
            <p className="text-sm text-text mt-1.5">
              {active
                ? "Les utilisateurs voient l'écran de maintenance."
                : "Tout le trafic est servi normalement."}
            </p>
          </div>

          {active && (
            <button
              onClick={() => save(false)}
              disabled={saving}
              className="shrink-0 px-4 py-2.5 rounded-xl bg-success text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition cursor-pointer"
            >
              {saving ? "…" : "Lever la maintenance"}
            </button>
          )}
        </div>

        {active && (
          <dl className="grid grid-cols-3 gap-4 mt-5 pt-5 border-t border-danger/15">
            <div>
              <dt className="text-xs text-text mb-1">Temps restant</dt>
              <dd className="text-lg font-bold text-dark tabular-nums">
                {remaining === null ? "Indéfini" : formatRemaining(remaining)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text mb-1">Retour prévu</dt>
              <dd className="text-sm font-medium text-dark">
                {endsAt
                  ? endsAt.toLocaleString("fr-FR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text mb-1">Depuis</dt>
              <dd className="text-sm font-medium text-dark">
                {state?.startedAt
                  ? new Date(state.startedAt).toLocaleString("fr-FR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })
                  : "—"}
              </dd>
            </div>
          </dl>
        )}

        {active && remaining !== null && remaining <= 0 && (
          <p className="text-xs text-warning mt-4">
            Le compte à rebours est écoulé mais la maintenance est toujours
            active — l&apos;application reste bloquée tant qu&apos;elle
            n&apos;est pas levée ici.
          </p>
        )}
      </div>

      {/* ── Configure / start ──────────────────────────────────── */}
      <form
        onSubmit={onSubmit}
        className="bg-white rounded-2xl shadow-sm border border-border/50 p-6"
      >
        <h2 className="text-lg font-semibold text-dark mb-4">
          {active ? "Modifier la fenêtre" : "Programmer une maintenance"}
        </h2>

        <label className="block text-sm font-medium text-dark mb-1.5">
          Message affiché aux utilisateurs
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          maxLength={300}
          placeholder="Nous améliorons Mobly. L'application sera de nouveau disponible très bientôt."
          className="w-full px-4 py-2.5 rounded-xl border border-border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
        />
        <p className="text-xs text-text mt-1 mb-5">
          Laisser vide pour utiliser le texte par défaut de l&apos;application.
        </p>

        <label className="block text-sm font-medium text-dark mb-1.5">
          Durée
        </label>
        <div className="grid grid-cols-4 gap-3">
          {(
            [
              ["days", "Jours", 365],
              ["hours", "Heures", 23],
              ["minutes", "Minutes", 59],
              ["seconds", "Secondes", 59],
            ] as const
          ).map(([key, label, max]) => (
            <div key={key}>
              <input
                type="number"
                min={0}
                max={max}
                value={duration[key]}
                onChange={(e) =>
                  setDuration((d) => ({
                    ...d,
                    [key]: Math.max(
                      0,
                      Math.min(max, Number(e.target.value) || 0),
                    ),
                  }))
                }
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-surface text-lg font-semibold text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <p className="text-xs text-text text-center mt-1">{label}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 mt-3">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setDuration(p.d)}
              className="px-3 py-1.5 rounded-full border border-border text-xs font-medium text-text hover:border-primary hover:text-primary transition cursor-pointer"
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setDuration({ ...ZERO })}
            className="px-3 py-1.5 rounded-full border border-border text-xs font-medium text-text hover:border-primary hover:text-primary transition cursor-pointer"
          >
            Indéfini
          </button>
        </div>

        <p className="text-xs text-text mt-3">
          {previewSecs > 0 ? (
            <>
              Retour prévu le{" "}
              <span className="font-semibold text-dark">
                {new Date(Date.now() + previewSecs * 1000).toLocaleString(
                  "fr-FR",
                  { dateStyle: "short", timeStyle: "short" },
                )}
              </span>
              .
            </>
          ) : (
            "Aucun compte à rebours ne sera affiché — la maintenance sera présentée comme indéfinie."
          )}
        </p>

        {error && <p className="text-sm text-danger mt-4">{error}</p>}
        {notice && <p className="text-sm text-success mt-4">{notice}</p>}

        <button
          type="submit"
          disabled={saving}
          className="mt-6 w-full py-3 rounded-xl bg-danger text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition cursor-pointer"
        >
          {saving
            ? "…"
            : active
              ? "Mettre à jour la maintenance"
              : "Bloquer l'application maintenant"}
        </button>
        {!active && (
          <p className="text-xs text-text text-center mt-2.5">
            Effet immédiat : toutes les requêtes des utilisateurs seront
            refusées.
          </p>
        )}
      </form>
    </div>
  );
}
