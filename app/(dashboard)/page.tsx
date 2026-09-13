"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { adminApi } from "@/lib/api";
import Topbar from "@/components/Topbar";
import StatCard from "@/components/StatCard";
import { BarChart, LineChart, Donut, DonutLegend, type Point } from "@/components/charts";

/* ------------------------------------------------------------------ */
/* Data                                                                */
/* ------------------------------------------------------------------ */

interface Overview {
  users: number;
  owners: number;
  newUsers30d: number;
  listings: number;
  pendingListings: number;
  boostedListings: number;
  newListings30d: number;
  activeSessions24h: number;
  openReports: number;
  pendingVisits: number;
  confirmedVisits: number;
  threads: number;
  messagesLast24h: number;
}

interface Bucket {
  day: string; // "YYYY-MM-DD"
  sessions: number;
  events: number;
}

interface AnalyticsSummary {
  dailyBuckets: Bucket[];
  dau: number;
  mau: number;
  topEvents: { name: string; count: number }[];
}

interface Listing {
  id: string;
  title: string;
  category: string;
  status: string;
  city: string;
  neighborhood?: string;
  priceFcfa: number;
  priceUnit: string;
  coverUrl?: string;
  createdAt: string;
  owner: { id: string; fullName: string };
}

interface ListingsPage {
  total: number;
  items: Listing[];
}

const STATUS: Record<string, { label: string; cls: string }> = {
  ACTIVE:   { label: "Active",     cls: "bg-success/12 text-success" },
  BOOSTED:  { label: "Boostée",    cls: "bg-accent/12 text-accent" },
  PENDING:  { label: "En attente", cls: "bg-warning/15 text-warning" },
  DRAFT:    { label: "Brouillon",  cls: "bg-line/60 text-muted" },
  PAUSED:   { label: "En pause",   cls: "bg-line/60 text-muted" },
  REJECTED: { label: "Refusée",    cls: "bg-danger/12 text-danger" },
  ARCHIVED: { label: "Archivée",   cls: "bg-line/60 text-muted" },
};

const n = (v: number) => v.toLocaleString("fr-FR");
const fcfa = (v: number) => `${n(v)} FCFA`;
const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });

/** "YYYY-MM-DD" → "12 sept." style label for chart axes. */
const dayLabel = (day: string) => {
  const d = new Date(day + "T00:00:00");
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }).replace(".", "");
};

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function OverviewPage() {
  const { token } = useAuth();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [recent, setRecent] = useState<Listing[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    adminApi<Overview>("/overview", token).then(setOverview).catch((e) => setError(String(e.message ?? e)));
    adminApi<AnalyticsSummary>("/analytics/summary", token).then(setAnalytics).catch(() => setAnalytics({ dailyBuckets: [], dau: 0, mau: 0, topEvents: [] }));
    adminApi<ListingsPage>("/listings", token, { params: { pageSize: 6 } })
      .then((p) => setRecent(p.items))
      .catch(() => setRecent([]));
  }, [token]);

  const today = new Date();
  const from = new Date(today.getTime() - 29 * 86400000);
  const range = `${from.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" })} – ${today.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" })}`;

  if (error) {
    return (
      <>
        <Topbar title="Vue d'ensemble" />
        <div className="rounded-2xl border border-danger/30 bg-danger/8 text-danger text-sm px-5 py-4">
          Impossible de charger le tableau de bord : {error}
        </div>
      </>
    );
  }

  const o = overview;
  const buckets = analytics?.dailyBuckets ?? [];
  const sessions: Point[] = buckets.map((b) => ({ label: dayLabel(b.day), value: b.sessions }));
  const events: Point[] = buckets.map((b) => ({ label: dayLabel(b.day), value: b.events }));
  const sessions30d = buckets.reduce((s, b) => s + b.sessions, 0);
  const events30d = buckets.reduce((s, b) => s + b.events, 0);

  const visitors = o ? Math.max(o.users - o.owners, 0) : 0;
  const activeListings = o ? Math.max(o.listings - o.pendingListings - o.boostedListings, 0) : 0;

  return (
    <>
      <Topbar
        title="Vue d'ensemble"
        pill={
          <>
            <CalendarIcon />
            {range}
          </>
        }
      />

      {/* ---- top stats -------------------------------------------------- */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
        <StatCard
          label="Utilisateurs"
          value={o ? o.users : "…"}
          delta={o ? `+${n(o.newUsers30d)}` : undefined}
          icon={<UsersIcon />}
          tone="primary"
        />
        <StatCard
          label="Annonces"
          value={o ? o.listings : "…"}
          delta={o ? `+${n(o.newListings30d)}` : undefined}
          icon={<BuildingIcon />}
          tone="accent"
        />
        <StatCard
          label="Comptes"
          value={o ? o.users : "…"}
          tone="primary"
          aside={
            o && (
              <>
                <DonutLegend
                  segments={[
                    { label: "Visiteurs", value: visitors, color: "var(--color-primary)" },
                    { label: "Propriétaires", value: o.owners, color: "#F5B400" },
                  ]}
                />
                <Donut
                  segments={[
                    { label: "Visiteurs", value: visitors, color: "var(--color-primary)" },
                    { label: "Propriétaires", value: o.owners, color: "#F5B400" },
                  ]}
                />
              </>
            )
          }
        />
        <StatCard
          label="Statut des annonces"
          value={o ? o.listings : "…"}
          tone="accent"
          aside={
            o && (
              <>
                <DonutLegend
                  segments={[
                    { label: "Actives", value: activeListings, color: "var(--color-primary)" },
                    { label: "Boostées", value: o.boostedListings, color: "var(--color-accent)" },
                    { label: "En attente", value: o.pendingListings, color: "var(--color-warning)" },
                  ]}
                />
                <Donut
                  segments={[
                    { label: "Actives", value: activeListings, color: "var(--color-primary)" },
                    { label: "Boostées", value: o.boostedListings, color: "var(--color-accent)" },
                    { label: "En attente", value: o.pendingListings, color: "var(--color-warning)" },
                  ]}
                />
              </>
            )
          }
        />
      </section>

      {/* ---- main grid --------------------------------------------------- */}
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* left 2/3 */}
        <div className="xl:col-span-2 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <StatCard
              label="Sessions actives"
              value={o ? o.activeSessions24h : "…"}
              deltaLabel="dernières 24 h"
              icon={<PulseIcon />}
              tone="success"
            />
            <StatCard
              label="Messages"
              value={o ? o.messagesLast24h : "…"}
              deltaLabel="dernières 24 h"
              icon={<ChatIcon />}
              tone="primary"
            />
          </div>

          <Panel
            title="Sessions quotidiennes"
            meta={analytics ? `${n(sessions30d)} · 30 j` : undefined}
            right={<RangeChip />}
          >
            {sessions.length ? (
              <BarChart data={sessions} height={190} />
            ) : (
              <Empty text={analytics ? "Aucune session sur la période." : "Chargement…"} />
            )}
          </Panel>

          <Panel
            title="Activité globale"
            meta={analytics ? `${n(events30d)} événements · DAU ${n(analytics.dau)} · MAU ${n(analytics.mau)}` : undefined}
            right={<RangeChip />}
          >
            {events.length ? (
              <LineChart data={events} height={170} />
            ) : (
              <Empty text={analytics ? "Aucun événement sur la période." : "Chargement…"} />
            )}
          </Panel>
        </div>

        {/* right 1/3 */}
        <div className="space-y-5">
          <div className="grid grid-cols-2 xl:grid-cols-1 gap-4">
            <BadgeCard
              icon={<CalendarCheckIcon />}
              badge={o ? `${n(o.pendingVisits)} en attente` : undefined}
              badgeTone={o && o.pendingVisits > 0 ? "warning" : "success"}
              label="Visites confirmées"
              value={o ? n(o.confirmedVisits) : "…"}
              hint="à venir"
              href="/visits"
            />
            <BadgeCard
              icon={<FlagIcon />}
              badge={o ? `${n(o.threads)} conv.` : undefined}
              badgeTone={o && o.openReports > 0 ? "danger" : "success"}
              label="Signalements ouverts"
              value={o ? n(o.openReports) : "…"}
              hint="à traiter"
              href="/reports"
            />
          </div>

          <Panel
            title="Dernières annonces"
            right={
              <Link href="/listings" className="text-[12px] font-semibold text-primary-text hover:underline">
                Tout voir
              </Link>
            }
            padded={false}
          >
            {recent === null ? (
              <div className="p-5"><Empty text="Chargement…" /></div>
            ) : recent.length === 0 ? (
              <div className="p-5"><Empty text="Aucune annonce." /></div>
            ) : (
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-muted">
                    <th className="font-medium px-5 py-2.5">Annonce</th>
                    <th className="font-medium px-3 py-2.5 hidden md:table-cell">Ville</th>
                    <th className="font-medium px-3 py-2.5">Statut</th>
                    <th className="font-medium px-5 py-2.5 text-right">Prix</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {recent.map((l) => {
                    const st = STATUS[l.status] ?? { label: l.status, cls: "bg-line/60 text-muted" };
                    return (
                      <tr key={l.id} className="hover:bg-line/30 transition">
                        <td className="px-5 py-3">
                          <Link href={`/listings?query=${encodeURIComponent(l.title)}`} className="flex items-center gap-3 min-w-0">
                            {l.coverUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={l.coverUrl} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0 bg-line" />
                            ) : (
                              <span className="w-9 h-9 rounded-lg bg-line shrink-0" />
                            )}
                            <span className="min-w-0">
                              <span className="block font-semibold text-fg truncate max-w-[11rem]">{l.title}</span>
                              <span className="block text-[11px] text-muted truncate">
                                {l.owner?.fullName} · {shortDate(l.createdAt)}
                              </span>
                            </span>
                          </Link>
                        </td>
                        <td className="px-3 py-3 text-muted hidden md:table-cell">{l.city}</td>
                        <td className="px-3 py-3">
                          <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-md whitespace-nowrap ${st.cls}`}>
                            {st.label}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right font-semibold text-fg tabular-nums whitespace-nowrap">
                          {fcfa(l.priceFcfa)}
                          <span className="text-muted font-normal">{l.priceUnit === "PER_DAY" ? "/j" : "/mois"}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Panel>
        </div>
      </section>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Local building blocks                                               */
/* ------------------------------------------------------------------ */

function Panel({
  title,
  meta,
  right,
  padded = true,
  children,
}: {
  title: string;
  meta?: string;
  right?: React.ReactNode;
  padded?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card rounded-2xl border border-line shadow-[var(--shadow-card)] overflow-hidden">
      <div className="flex items-center gap-3 px-5 pt-5 pb-4">
        <div className="min-w-0">
          <h2 className="text-[14px] font-semibold text-fg">{title}</h2>
          {meta && <p className="text-[11px] text-muted mt-0.5 truncate">{meta}</p>}
        </div>
        <div className="ml-auto shrink-0">{right}</div>
      </div>
      <div className={padded ? "px-5 pb-5" : ""}>{children}</div>
    </div>
  );
}

function RangeChip() {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted bg-line/50 rounded-md px-2 py-1">
      30 jours
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </span>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-[12px] text-muted py-8 text-center">{text}</p>;
}

function BadgeCard({
  icon,
  badge,
  badgeTone = "success",
  label,
  value,
  hint,
  href,
}: {
  icon: React.ReactNode;
  badge?: string;
  badgeTone?: "success" | "warning" | "danger";
  label: string;
  value: string;
  hint?: string;
  href: string;
}) {
  const tone = {
    success: "bg-success text-white",
    warning: "bg-warning text-white",
    danger: "bg-danger text-white",
  }[badgeTone];
  return (
    <Link
      href={href}
      className="block bg-card rounded-2xl border border-line p-5 shadow-[var(--shadow-card)] hover:border-primary/40 transition"
    >
      <div className="flex items-start justify-between">
        <span className="w-9 h-9 rounded-lg bg-line/60 text-fg grid place-items-center">{icon}</span>
        {badge && (
          <span className={`text-[10.5px] font-bold rounded-full px-2.5 py-1 leading-none ${tone}`}>
            {badge}
          </span>
        )}
      </div>
      <p className="text-[12.5px] text-muted mt-4">{label}</p>
      <p className="text-[24px] leading-none font-bold text-fg tabular-nums mt-1.5">{value}</p>
      {hint && <p className="text-[11px] text-muted mt-2">{hint}</p>}
    </Link>
  );
}

/* icons ------------------------------------------------------------- */

const I = ({ d }: { d: string }) => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);
const UsersIcon = () => <I d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0z" />;
const BuildingIcon = () => <I d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />;
const PulseIcon = () => <I d="M3 12h4l3-8 4 16 3-8h4" />;
const ChatIcon = () => <I d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm3.75 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm3.75 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />;
const CalendarCheckIcon = () => <I d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5M9 15l2 2 4-4" />;
const FlagIcon = () => <I d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" />;
const CalendarIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
  </svg>
);
