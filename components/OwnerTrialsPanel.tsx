"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { adminApi } from "@/lib/api";
import TrialCountdown from "@/components/TrialCountdown";

interface TrialRow {
  id: string;
  fullName: string;
  phone: string;
  avatarUrl?: string | null;
  avatarColor?: string | null;
  listings: number;
  trialStartedAt: string;
  trialEndsAt: string;
  expired: boolean;
}

interface TrialsResponse {
  trialDays: number;
  counts: { active: number; expired: number; paid: number };
  active: TrialRow[];
  expired: TrialRow[];
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/**
 * Owners on the free trial with a live countdown, soonest to end first.
 * Refetches every minute so a trial that starts, ends or is paid shows up
 * without reloading. Hidden when the backend predates the owner trial.
 */
export default function OwnerTrialsPanel({ token }: { token: string }) {
  const [data, setData] = useState<TrialsResponse | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  const [tab, setTab] = useState<"active" | "expired">("active");

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      adminApi<TrialsResponse>("/users/owner-trials", token)
        .then((d) => { if (!cancelled) setData(d); })
        .catch(() => { if (!cancelled && !data) setUnsupported(true); });
    load();
    const id = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (unsupported) return null;
  const rows = data ? (tab === "active" ? data.active : data.expired) : [];

  return (
    <div className="bg-card rounded-2xl border border-line shadow-[var(--shadow-card)] overflow-hidden mb-5">
      <div className="flex flex-wrap items-center gap-3 px-5 pt-5 pb-4">
        <div className="min-w-0">
          <h2 className="text-[14px] font-semibold text-fg">Essais propriétaires</h2>
          <p className="text-[11px] text-muted mt-0.5">
            {data
              ? `${data.counts.active} en cours · ${data.counts.expired} expirés non payés (30 j) · ${data.counts.paid} payés · essai de ${data.trialDays} jours`
              : "Chargement…"}
          </p>
        </div>
        <div role="group" className="ml-auto flex items-center gap-0.5 bg-card border border-line rounded-xl p-1">
          {([["active", "En cours"], ["expired", "Expirés"]] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              aria-pressed={tab === id}
              className={`px-2.5 py-1.5 rounded-lg text-[12px] font-semibold transition cursor-pointer ${
                tab === id ? "bg-primary text-white" : "text-muted hover:text-fg"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {data === null ? (
        <p className="text-[12px] text-muted py-10 text-center">Chargement…</p>
      ) : rows.length === 0 ? (
        <p className="text-[12px] text-muted py-10 text-center">
          {tab === "active" ? "Aucun essai en cours." : "Aucun essai expiré récemment."}
        </p>
      ) : (
        <div className="max-h-[420px] overflow-y-auto">
          <table className="w-full text-[12.5px]">
            <thead className="sticky top-0 bg-card z-10">
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted border-b border-line">
                <th className="font-medium px-5 py-2.5">Propriétaire</th>
                <th className="font-medium px-3 py-2.5 hidden md:table-cell">Annonces</th>
                <th className="font-medium px-3 py-2.5 hidden lg:table-cell">Début</th>
                <th className="font-medium px-3 py-2.5 hidden md:table-cell">Fin</th>
                <th className="font-medium px-5 py-2.5">Temps restant</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-line/30 transition">
                  <td className="px-5 py-2.5">
                    <Link href={`/users/${r.id}`} className="flex items-center gap-2.5 min-w-0">
                      {r.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                      ) : (
                        <span
                          className="w-8 h-8 rounded-full grid place-items-center text-white text-[12px] font-semibold shrink-0"
                          style={{ background: r.avatarColor ?? "var(--color-primary)" }}
                        >
                          {r.fullName.trim().charAt(0).toUpperCase() || "?"}
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="block font-semibold text-fg truncate hover:underline">{r.fullName}</span>
                        <span className="block text-[11px] text-muted truncate">{r.phone}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 hidden md:table-cell tabular-nums">{r.listings}</td>
                  <td className="px-3 py-2.5 hidden lg:table-cell text-muted">{fmt(r.trialStartedAt)}</td>
                  <td className="px-3 py-2.5 hidden md:table-cell text-muted">{fmt(r.trialEndsAt)}</td>
                  <td className="px-5 py-2.5">
                    <TrialCountdown compact start={r.trialStartedAt} end={r.trialEndsAt} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
