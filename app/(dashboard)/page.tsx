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
  // Present once the backend supports ?days=; falls back to the 30-day fields.
  rangeDays?: number;
  newUsersRange?: number;
  newListingsRange?: number;
}

interface Bucket {
  day: string; // "YYYY-MM-DD" (UTC)
  sessions: number;
  events: number;
}

interface AnalyticsSummary {
  rangeDays?: number;
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

const RANGES = [
  { days: 7,   label: "1 sem" },
  { days: 30,  label: "1 mois" },
  { days: 90,  label: "3 mois" },
  { days: 180, label: "6 mois" },
  { days: 365, label: "1 an" },
] as const;
type Days = (typeof RANGES)[number]["days"];

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
const fmtDate = (d: Date, opts: Intl.DateTimeFormatOptions) =>
  d.toLocaleDateString("fr-FR", { timeZone: "UTC", ...opts }).replace(".", "");
const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
const utc = (day: string) => new Date(day + "T00:00:00Z");

/**
 * Turn daily buckets into a chart series sized to the range: days for a week
 * or a month, ISO weeks (Mon–Sun) for 3–6 months, calendar months for a year.
 * Values are summed, so totals stay exact whatever the grouping.
 */
function bucketize(buckets: Bucket[], days: number): { sessions: Point[]; events: Point[]; unit: string } {
  const groups = new Map<string, { label: string; sessions: number; events: number }>();
  for (const b of buckets) {
    const d = utc(b.day);
    let key: string;
    let label: string;
    if (days <= 30) {
      key = b.day;
      label = fmtDate(d, { day: "numeric", month: "short" });
    } else if (days <= 180) {
      const monday = new Date(d);
      monday.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      key = monday.toISOString().slice(0, 10);
      label = fmtDate(monday, { day: "numeric", month: "short" });
    } else {
      key = b.day.slice(0, 7);
      label = fmtDate(d, { month: "short", year: "2-digit" });
    }
    const g = groups.get(key) ?? { label, sessions: 0, events: 0 };
    g.sessions += b.sessions;
    g.events += b.events;
    groups.set(key, g);
  }
  const ordered = [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([, g]) => g);
  return {
    sessions: ordered.map((g) => ({ label: g.label, value: g.sessions })),
    events: ordered.map((g) => ({ label: g.label, value: g.events })),
    unit: days <= 30 ? "par jour" : days <= 180 ? "par semaine" : "par mois",
  };
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function OverviewPage() {
  const { token } = useAuth();
  const [days, setDays] = useState<Days>(30);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [recent, setRecent] = useState<Listing[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    adminApi<ListingsPage>("/listings", token, { params: { pageSize: 25 } })
      .then((p) => setRecent(p.items))
      .catch(() => setRecent([]));
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setAnalytics(null);
    adminApi<Overview>("/overview", token, { params: { days } })
      .then((d) => { if (!cancelled) setOverview(d); })
      .catch((e) => { if (!cancelled) setError(String(e.message ?? e)); });
    adminApi<AnalyticsSummary>("/analytics/summary", token, { params: { days } })
      .then((d) => { if (!cancelled) setAnalytics(d); })
      .catch(() => { if (!cancelled) setAnalytics({ dailyBuckets: [], dau: 0, mau: 0, topEvents: [] }); });
    return () => { cancelled = true; };
  }, [token, days]);

  const today = new Date();
  const from = new Date(today.getTime() - (days - 1) * 86400000);
  const rangeText = `${from.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" })} – ${today.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" })}`;
  const rangeLabel = RANGES.find((r) => r.days === days)!.label;
  const rangeSelect = (
    <div role="group" aria-label="Période" className="flex items-center gap-0.5 bg-card border border-line rounded-xl p-1">
      {RANGES.map((r) => (
        <button
          key={r.days}
          type="button"
          onClick={() => setDays(r.days)}
          aria-pressed={days === r.days}
          className={`px-2.5 py-1.5 rounded-lg text-[12px] font-semibold transition cursor-pointer ${
            days === r.days ? "bg-primary text-white" : "text-muted hover:text-fg"
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );

  if (error) {
    return (
      <>
        <Topbar title="Vue d'ensemble" actions={rangeSelect} />
        <div className="rounded-2xl border border-danger/30 bg-danger/8 text-danger text-sm px-5 py-4">
          Impossible de charger le tableau de bord : {error}
        </div>
      </>
    );
  }

  const o = overview;
  const series = bucketize(analytics?.dailyBuckets ?? [], days);
  const sessionsTotal = series.sessions.reduce((s, p) => s + p.value, 0);
  const eventsTotal = series.events.reduce((s, p) => s + p.value, 0);
  const newUsers = o ? o.newUsersRange ?? o.newUsers30d : 0;
  const newListings = o ? o.newListingsRange ?? o.newListings30d : 0;
  const deltaLabel = o?.newUsersRange !== undefined ? rangeLabel : "30 derniers jours";

  const visitors = o ? Math.max(o.users - o.owners, 0) : 0;
  const activeListings = o ? Math.max(o.listings - o.pendingListings - o.boostedListings, 0) : 0;
  const comptesSeg = [
    { label: "Visiteurs", value: visitors, color: "var(--color-primary)" },
    { label: "Propriétaires", value: o?.owners ?? 0, color: "#F5B400" },
  ];
  const statutSeg = [
    { label: "Actives", value: activeListings, color: "var(--color-primary)" },
    { label: "Boostées", value: o?.boostedListings ?? 0, color: "var(--color-accent)" },
    { label: "En attente", value: o?.pendingListings ?? 0, color: "var(--color-warning)" },
  ];

  return (
    <>
      <Topbar
        title="Vue d'ensemble"
        pill={<><CalendarIcon />{rangeText}</>}
        actions={rangeSelect}
      />

      {/* ---- KPI tiles (compact) ---------------------------------------- */}
      <section className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
        <StatCard compact label="Utilisateurs" value={o ? o.users : "…"} delta={o ? `+${n(newUsers)}` : undefined} deltaLabel={deltaLabel} icon={<UsersIcon />} tone="primary" />
        <StatCard compact label="Annonces" value={o ? o.listings : "…"} delta={o ? `+${n(newListings)}` : undefined} deltaLabel={deltaLabel} icon={<BuildingIcon />} tone="accent" />
        <StatCard compact label="Comptes" value={o ? o.users : "…"} tone="primary"
          aside={o && <Donut segments={comptesSeg} size={56} thickness={9} />}
          footer={o && <DonutLegend segments={comptesSeg} inline />} />
        <StatCard compact label="Statut des annonces" value={o ? o.listings : "…"} tone="accent"
          aside={o && <Donut segments={statutSeg} size={56} thickness={9} />}
          footer={o && <DonutLegend segments={statutSeg} inline />} />
      </section>

      {/* ---- charts: the focus ------------------------------------------ */}
      <section className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-5">
        <Panel
          title="Sessions"
          meta={analytics ? `${n(sessionsTotal)} sessions · ${rangeLabel} · ${series.unit}` : "Chargement…"}
          right={<Chip>{rangeLabel}</Chip>}
        >
          {series.sessions.length ? (
            <BarChart data={series.sessions} height={260} />
          ) : (
            <Empty text={analytics ? "Aucune session sur la période." : "Chargement…"} />
          )}
        </Panel>
        <Panel
          title="Activité"
          meta={analytics ? `${n(eventsTotal)} événements · ${rangeLabel} · ${series.unit} · DAU ${n(analytics.dau)} · MAU ${n(analytics.mau)}` : "Chargement…"}
          right={<Chip>{rangeLabel}</Chip>}
        >
          {series.events.length ? (
            <LineChart data={series.events} height={260} />
          ) : (
            <Empty text={analytics ? "Aucun événement sur la période." : "Chargement…"} />
          )}
        </Panel>
      </section>

      {/* ---- secondary tiles (compact) ---------------------------------- */}
      <section className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
        <StatCard compact label="Sessions actives" value={o ? o.activeSessions24h : "…"} deltaLabel="dernières 24 h" icon={<PulseIcon />} tone="success" />
        <StatCard compact label="Messages" value={o ? o.messagesLast24h : "…"} deltaLabel="dernières 24 h" icon={<ChatIcon />} tone="primary" />
        <BadgeCard icon={<CalendarCheckIcon />} label="Visites confirmées" value={o ? n(o.confirmedVisits) : "…"}
          badge={o ? `${n(o.pendingVisits)} en attente` : undefined} badgeTone={o && o.pendingVisits > 0 ? "warning" : "success"} href="/visits" />
        <BadgeCard icon={<FlagIcon />} label="Signalements ouverts" value={o ? n(o.openReports) : "…"}
          badge={o ? `${n(o.threads)} conv.` : undefined} badgeTone={o && o.openReports > 0 ? "danger" : "success"} href="/reports" />
      </section>

      {/* ---- recent listings (scrollable) -------------------------------- */}
      <Panel
        title="Dernières annonces"
        meta={recent ? `${recent.length} plus récentes` : undefined}
        right={<Link href="/listings" className="text-[12px] font-semibold text-primary-text hover:underline">Tout voir</Link>}
        padded={false}
      >
        {recent === null ? (
          <div className="p-5"><Empty text="Chargement…" /></div>
        ) : recent.length === 0 ? (
          <div className="p-5"><Empty text="Aucune annonce." /></div>
        ) : (
          <div className="max-h-[420px] overflow-y-auto">
            <table className="w-full text-[12.5px]">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted border-b border-line">
                  <th className="font-medium px-5 py-2.5">Annonce</th>
                  <th className="font-medium px-3 py-2.5 hidden md:table-cell">Propriétaire</th>
                  <th className="font-medium px-3 py-2.5 hidden md:table-cell">Ville</th>
                  <th className="font-medium px-3 py-2.5">Statut</th>
                  <th className="font-medium px-3 py-2.5 hidden lg:table-cell">Créée le</th>
                  <th className="font-medium px-5 py-2.5 text-right">Prix</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {recent.map((l) => {
                  const st = STATUS[l.status] ?? { label: l.status, cls: "bg-line/60 text-muted" };
                  return (
                    <tr key={l.id} className="hover:bg-line/30 transition">
                      <td className="px-5 py-2.5">
                        <Link href={`/listings?query=${encodeURIComponent(l.title)}`} className="flex items-center gap-3 min-w-0">
                          {l.coverUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={l.coverUrl} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0 bg-line" />
                          ) : (
                            <span className="w-8 h-8 rounded-lg bg-line shrink-0" />
                          )}
                          <span className="block font-semibold text-fg truncate max-w-[16rem]">{l.title}</span>
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-muted hidden md:table-cell truncate max-w-[10rem]">{l.owner?.fullName}</td>
                      <td className="px-3 py-2.5 text-muted hidden md:table-cell">{l.city}</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-md whitespace-nowrap ${st.cls}`}>{st.label}</span>
                      </td>
                      <td className="px-3 py-2.5 text-muted hidden lg:table-cell whitespace-nowrap">{shortDate(l.createdAt)}</td>
                      <td className="px-5 py-2.5 text-right font-semibold text-fg tabular-nums whitespace-nowrap">
                        {fcfa(l.priceFcfa)}<span className="text-muted font-normal">{l.priceUnit === "PER_DAY" ? "/j" : "/mois"}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Local building blocks                                               */
/* ------------------------------------------------------------------ */

function Panel({ title, meta, right, padded = true, children }: {
  title: string; meta?: string; right?: React.ReactNode; padded?: boolean; children: React.ReactNode;
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

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center text-[11px] font-medium text-muted bg-line/50 rounded-md px-2 py-1">{children}</span>;
}

function Empty({ text }: { text: string }) {
  return <p className="text-[12px] text-muted py-10 text-center">{text}</p>;
}

function BadgeCard({ icon, badge, badgeTone = "success", label, value, href }: {
  icon: React.ReactNode; badge?: string; badgeTone?: "success" | "warning" | "danger"; label: string; value: string; href: string;
}) {
  const tone = { success: "bg-success text-white", warning: "bg-warning text-white", danger: "bg-danger text-white" }[badgeTone];
  return (
    <Link href={href} className="block bg-card rounded-2xl border border-line p-4 shadow-[var(--shadow-card)] hover:border-primary/40 transition">
      <div className="flex items-start justify-between gap-2">
        <span className="w-7 h-7 rounded-lg bg-line/60 text-fg grid place-items-center">{icon}</span>
        {badge && <span className={`text-[10px] font-bold rounded-full px-2 py-1 leading-none whitespace-nowrap ${tone}`}>{badge}</span>}
      </div>
      <p className="text-[12px] text-muted mt-3">{label}</p>
      <p className="text-[22px] leading-none font-bold text-fg tabular-nums mt-1.5">{value}</p>
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
