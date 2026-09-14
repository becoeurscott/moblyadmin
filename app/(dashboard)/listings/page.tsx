"use client";

import { useAuth } from "@/lib/auth";
import { adminApi, ApiError } from "@/lib/api";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Pagination from "@/components/Pagination";
import Topbar from "@/components/Topbar";
import {
  Btn,
  ConfirmDialog,
  Field,
  Notice,
  SearchInput,
  Spinner,
  Toggle,
  fmtDate,
  inputClass,
} from "@/components/ui";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

const STATUSES = ["DRAFT", "PENDING", "ACTIVE", "BOOSTED", "PAUSED", "REJECTED", "ARCHIVED"] as const;
type Status = (typeof STATUSES)[number];
const DEALS = ["RENT", "BUY", "SHORT"] as const;
type Deal = (typeof DEALS)[number];
const PRICE_UNITS = ["PER_MONTH", "PER_DAY", "TOTAL"] as const;
type PriceUnit = (typeof PRICE_UNITS)[number];

interface Owner {
  id: string;
  fullName: string;
  avatarUrl?: string | null;
  avatarColor?: string | null;
}

interface Row {
  id: string;
  title: string;
  category: string;
  status: string;
  available: boolean;
  verified: boolean;
  city: string;
  neighborhood?: string | null;
  priceFcfa: number;
  priceUnit: string;
  coverUrl?: string | null;
  imageName?: string | null;
  views: number;
  contacts: number;
  favorites: number;
  createdAt: string;
  ownerId: string;
  owner: Owner;
}

interface Detail {
  id: string;
  title: string;
  category: string;
  deal: string;
  status: string;
  region: string | null;
  city: string;
  neighborhood: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  priceFcfa: number;
  priceUnit: string;
  currency: string | null;
  negotiable: boolean;
  furnished: boolean;
  rooms: number | null;
  bathrooms: number | null;
  sizeSqm: number | null;
  minDurationMonths: number | null;
  about: string | null;
  tags: string[] | null;
  coverUrl: string | null;
  imageName: string | null;
  photos: string[] | null;
  verified: boolean;
  rating: number | null;
  reviewCount: number;
  available: boolean;
  availableFrom: string | null;
  views: number;
  contacts: number;
  favorites: number;
  boostDaysLeft: number | null;
  boostExpiresAt: string | null;
  pinnedAt: string | null;
  pinnedUntil: string | null;
  adminNote: string | null;
  publishedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  ownerId: string;
  owner: Owner & { phone: string; email: string | null };
}

interface Paged<T> {
  total: number;
  page: number;
  pageSize: number;
  items: T[];
}

interface UserHit {
  id: string;
  fullName: string;
  phone: string;
  email?: string | null;
}

/** The editor's working copy: every input is a string/bool so partial typing is allowed. */
interface Form {
  title: string;
  category: string;
  deal: string;
  about: string;
  tags: string[];
  priceFcfa: string;
  priceUnit: string;
  negotiable: boolean;
  rooms: string;
  bathrooms: string;
  sizeSqm: string;
  minDurationMonths: string;
  furnished: boolean;
  availableFrom: string;
  available: boolean;
  region: string;
  city: string;
  neighborhood: string;
  address: string;
  lat: string;
  lng: string;
  photos: string[];
  coverUrl: string;
  status: string;
  verified: boolean;
  rating: string;
  adminNote: string;
}

type StringKey = { [K in keyof Form]: Form[K] extends string ? K : never }[keyof Form];

/* ------------------------------------------------------------------ */
/* Labels & helpers                                                    */
/* ------------------------------------------------------------------ */

const STATUS_META: Record<Status, { label: string; cls: string }> = {
  DRAFT: { label: "Brouillon", cls: "bg-line/60 text-muted" },
  PENDING: { label: "En attente", cls: "bg-warning/15 text-warning" },
  ACTIVE: { label: "Active", cls: "bg-success/12 text-success" },
  BOOSTED: { label: "Boostée", cls: "bg-accent/12 text-accent" },
  PAUSED: { label: "En pause", cls: "bg-primary-light text-primary-text" },
  REJECTED: { label: "Refusée", cls: "bg-danger/12 text-danger" },
  ARCHIVED: { label: "Archivée", cls: "bg-line/60 text-muted" },
};

const statusMeta = (s: string) =>
  STATUS_META[s as Status] ?? { label: s, cls: "bg-line/60 text-muted" };

const DEAL_LABELS: Record<Deal, string> = {
  RENT: "Location",
  BUY: "Vente",
  SHORT: "Courte durée",
};

const PRICE_UNIT_LABELS: Record<PriceUnit, string> = {
  PER_MONTH: "Par mois",
  PER_DAY: "Par jour",
  TOTAL: "Prix total",
};

const CATEGORIES = [
  "Chambres",
  "Studios",
  "Appartements",
  "Villas",
  "Bureaux",
  "Boutiques",
  "Coworking",
  "Commercial",
];

const nf = new Intl.NumberFormat("fr-FR");

function fmtPrice(n: number, unit: string) {
  const suffix =
    unit === "PER_MONTH" || unit === "mois" ? "/mois" : unit === "PER_DAY" || unit === "jour" ? "/j" : "";
  return `${nf.format(n)} FCFA${suffix}`;
}

const fmtDay = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const errMsg = (e: unknown, fallback = "Une erreur est survenue.") =>
  e instanceof ApiError ? e.message || fallback : e instanceof Error ? e.message || fallback : fallback;

const field = `${inputClass} text-fg placeholder:text-muted`;

function isHttpUrl(s: string) {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

const numStr = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));

function toForm(l: Detail): Form {
  return {
    title: l.title ?? "",
    category: l.category ?? "",
    deal: l.deal ?? "RENT",
    about: l.about ?? "",
    tags: l.tags ?? [],
    priceFcfa: numStr(l.priceFcfa),
    priceUnit: l.priceUnit ?? "PER_MONTH",
    negotiable: !!l.negotiable,
    rooms: numStr(l.rooms),
    bathrooms: numStr(l.bathrooms),
    sizeSqm: numStr(l.sizeSqm),
    minDurationMonths: numStr(l.minDurationMonths),
    furnished: !!l.furnished,
    availableFrom: l.availableFrom ? l.availableFrom.slice(0, 10) : "",
    available: !!l.available,
    region: l.region ?? "",
    city: l.city ?? "",
    neighborhood: l.neighborhood ?? "",
    address: l.address ?? "",
    lat: numStr(l.lat),
    lng: numStr(l.lng),
    photos: l.photos ?? [],
    coverUrl: l.coverUrl ?? "",
    status: l.status ?? "DRAFT",
    verified: !!l.verified,
    rating: numStr(l.rating),
    adminNote: l.adminNote ?? "",
  };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function dirtyKeys(form: Form, init: Form): (keyof Form)[] {
  return (Object.keys(init) as (keyof Form)[]).filter((k) => !same(form[k], init[k]));
}

/** Parse "12 000" / "3,5" → number; "" → null; garbage → NaN. */
function toNumber(s: string): number | null {
  const t = s.replace(/\s/g, "").replace(",", ".");
  return t === "" ? null : Number(t);
}

/** Diff the working copy against the loaded listing; only changed fields go in the patch. */
function buildPatch(form: Form, init: Form) {
  const patch: Record<string, unknown> = {};
  const errors: string[] = [];
  const changed = (k: keyof Form) => !same(form[k], init[k]);

  const reqText = (k: StringKey, label: string) => {
    if (!changed(k)) return;
    const v = form[k].trim();
    if (!v) errors.push(`${label} est obligatoire.`);
    else patch[k] = v;
  };
  const optText = (k: StringKey) => {
    if (!changed(k)) return;
    const v = form[k].trim();
    patch[k] = v === "" ? null : v;
  };
  const raw = (k: keyof Form) => {
    if (changed(k)) patch[k] = form[k];
  };
  const intField = (k: StringKey, label: string, required: boolean) => {
    if (!changed(k)) return;
    const n = toNumber(form[k]);
    if (n === null) {
      if (required) errors.push(`${label} est obligatoire.`);
      else patch[k] = null;
    } else if (!Number.isInteger(n) || n < 0) {
      errors.push(`${label} doit être un nombre entier positif.`);
    } else patch[k] = n;
  };
  const floatField = (k: StringKey, label: string, min: number, max: number) => {
    if (!changed(k)) return;
    const n = toNumber(form[k]);
    if (n === null) patch[k] = null;
    else if (!Number.isFinite(n) || n < min || n > max)
      errors.push(`${label} doit être un nombre entre ${min} et ${max}.`);
    else patch[k] = n;
  };

  // Contenu
  reqText("title", "Le titre");
  reqText("category", "La catégorie");
  raw("deal");
  optText("about");
  raw("tags");
  // Prix
  intField("priceFcfa", "Le prix", true);
  raw("priceUnit");
  raw("negotiable");
  // Caractéristiques
  intField("rooms", "Le nombre de pièces", true);
  intField("bathrooms", "Le nombre de salles de bain", false);
  intField("sizeSqm", "La surface", false);
  intField("minDurationMonths", "La durée minimale", false);
  raw("furnished");
  raw("available");
  if (changed("availableFrom")) {
    const v = form.availableFrom;
    if (!v) patch.availableFrom = null;
    else if (Number.isNaN(Date.parse(`${v}T00:00:00.000Z`))) errors.push("La date de disponibilité est invalide.");
    else patch.availableFrom = `${v}T00:00:00.000Z`;
  }
  // Localisation
  optText("region");
  reqText("city", "La ville");
  optText("neighborhood");
  optText("address");
  floatField("lat", "La latitude", -90, 90);
  floatField("lng", "La longitude", -180, 180);
  // Photos
  if (changed("photos")) {
    const bad = form.photos.find((p) => !isHttpUrl(p));
    if (bad) errors.push(`URL de photo invalide : ${bad}`);
    else patch.photos = form.photos;
  }
  if (changed("coverUrl")) {
    const v = form.coverUrl.trim();
    if (v && !isHttpUrl(v)) errors.push("L'URL de couverture est invalide.");
    else patch.coverUrl = v || null;
  }
  // Modération
  raw("status");
  raw("verified");
  floatField("rating", "La note", 0, 5);
  optText("adminNote");

  return { patch, errors };
}

const isPinned = (l: Detail) =>
  !!l.pinnedAt && (!l.pinnedUntil || new Date(l.pinnedUntil).getTime() > Date.now());
const isBoosted = (l: Detail) =>
  l.status === "BOOSTED" || (!!l.boostExpiresAt && new Date(l.boostExpiresAt).getTime() > Date.now());

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

const PAGE_SIZE = 20;

/** `useSearchParams` needs a Suspense boundary in Next 15. */
export default function ListingsPage() {
  return (
    <Suspense fallback={null}>
      <ListingsPageInner />
    </Suspense>
  );
}

function ListingsPageInner() {
  const { token } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const linkedId = searchParams.get("id");

  const [data, setData] = useState<Paged<Row> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [categoryInput, setCategoryInput] = useState("");
  const [cityInput, setCityInput] = useState("");
  const category = useDebounced(categoryInput.trim());
  const city = useDebounced(cityInput.trim());

  const [openId, setOpenId] = useState<string | null>(linkedId);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  // Deep link from other pages (e.g. Signalements): /listings?id=<listingId>
  useEffect(() => {
    if (linkedId) setOpenId(linkedId);
  }, [linkedId]);

  const closeEditor = useCallback(() => {
    setOpenId(null);
    if (linkedId) router.replace("/listings");
  }, [linkedId, router]);

  const reqId = useRef(0);

  const load = useCallback(() => {
    if (!token) return;
    const my = ++reqId.current;
    setLoading(true);
    setError(null);
    adminApi<Paged<Row>>("/listings", token, {
      params: {
        page,
        pageSize: PAGE_SIZE,
        query: query.trim() || undefined,
        status: status === "all" ? undefined : status,
        category: category || undefined,
        city: city || undefined,
      },
    })
      .then((res) => {
        if (my === reqId.current) setData(res);
      })
      .catch((e) => {
        if (my === reqId.current) setError(errMsg(e, "Impossible de charger les annonces."));
      })
      .finally(() => {
        if (my === reqId.current) setLoading(false);
      });
  }, [token, page, query, status, category, city]);

  useEffect(() => {
    load();
  }, [load]);

  // Any filter change goes back to the first page.
  useEffect(() => {
    setPage(0);
  }, [query, status, category, city]);

  /** Reflect a server copy of a listing in its table row without refetching the page. */
  const applyToRow = useCallback((l: Detail) => {
    setData((d) =>
      d
        ? {
            ...d,
            items: d.items.map((r) =>
              r.id === l.id
                ? {
                    ...r,
                    title: l.title,
                    category: l.category,
                    status: l.status,
                    available: l.available,
                    verified: l.verified,
                    city: l.city,
                    neighborhood: l.neighborhood,
                    priceFcfa: l.priceFcfa,
                    priceUnit: l.priceUnit,
                    coverUrl: l.coverUrl,
                    imageName: l.imageName,
                    views: l.views,
                    contacts: l.contacts,
                    favorites: l.favorites,
                    ownerId: l.ownerId,
                    owner: l.owner
                      ? { id: l.owner.id, fullName: l.owner.fullName, avatarUrl: l.owner.avatarUrl, avatarColor: l.owner.avatarColor }
                      : r.owner,
                  }
                : r,
            ),
          }
        : d,
    );
  }, []);

  async function quickPatch(id: string, body: Record<string, unknown>) {
    if (!token) return;
    setRowBusy(id);
    setRowError(null);
    try {
      const res = await adminApi<{ listing: Detail }>(`/listings/${id}`, token, { method: "PATCH", body });
      applyToRow(res.listing);
    } catch (e) {
      setRowError(errMsg(e));
    } finally {
      setRowBusy(null);
    }
  }

  const categoryOptions = useMemo(() => {
    const set = new Set(CATEGORIES);
    data?.items.forEach((r) => r.category && set.add(r.category));
    return Array.from(set);
  }, [data]);

  const total = data?.total ?? 0;

  return (
    <>
      <Topbar
        title="Annonces"
        pill={data ? `${total.toLocaleString("fr-FR")} annonce${total > 1 ? "s" : ""}` : undefined}
      />

      <datalist id="listing-categories">
        {categoryOptions.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      {/* ---- filters ------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Rechercher (titre, quartier, ville…)"
          className="w-80 max-w-full text-fg placeholder:text-muted"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="px-3 py-2 rounded-xl border border-line bg-card text-sm text-fg cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="all">Tous les statuts</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_META[s].label}
            </option>
          ))}
        </select>
        <input
          list="listing-categories"
          value={categoryInput}
          onChange={(e) => setCategoryInput(e.target.value)}
          placeholder="Catégorie"
          className="w-44 px-3 py-2 rounded-xl border border-line bg-card text-sm text-fg placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <input
          value={cityInput}
          onChange={(e) => setCityInput(e.target.value)}
          placeholder="Ville"
          className="w-40 px-3 py-2 rounded-xl border border-line bg-card text-sm text-fg placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        {(query || status !== "all" || categoryInput || cityInput) && (
          <button
            onClick={() => {
              setQuery("");
              setStatus("all");
              setCategoryInput("");
              setCityInput("");
            }}
            className="text-[12px] text-muted hover:text-fg cursor-pointer"
          >
            Réinitialiser
          </button>
        )}
        {loading && data && <span className="text-[12px] text-muted">Actualisation…</span>}
      </div>

      {rowError && (
        <div className="mb-4">
          <Notice kind="danger">{rowError}</Notice>
        </div>
      )}

      {/* ---- table --------------------------------------------------- */}
      <div className="bg-card rounded-2xl border border-line shadow-[var(--shadow-card)] overflow-hidden">
        {error && !data ? (
          <div className="px-5 py-12 text-center space-y-3">
            <p className="text-sm text-danger">{error}</p>
            <Btn size="sm" variant="neutral" onClick={load}>
              Réessayer
            </Btn>
          </div>
        ) : !data ? (
          <div className="py-16 grid place-items-center">
            <Spinner />
          </div>
        ) : data.items.length === 0 ? (
          <p className="text-sm text-muted text-center px-5 py-14">Aucune annonce ne correspond à ces filtres.</p>
        ) : (
          <div className={`overflow-x-auto transition-opacity ${loading ? "opacity-60" : ""}`}>
            {error && <p className="text-[12px] text-danger px-5 pt-3">{error}</p>}
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-[11px] uppercase tracking-wide text-muted">
                  <th className="text-left px-5 py-3 font-semibold">Annonce</th>
                  <th className="text-left px-3 py-3 font-semibold">Ville</th>
                  <th className="text-left px-3 py-3 font-semibold">Catégorie</th>
                  <th className="text-left px-3 py-3 font-semibold">Prix</th>
                  <th className="text-left px-3 py-3 font-semibold">Statut</th>
                  <th className="text-left px-3 py-3 font-semibold">Indicateurs</th>
                  <th className="text-left px-3 py-3 font-semibold">Stats</th>
                  <th className="text-left px-5 py-3 font-semibold">Créée</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.items.map((l) => {
                  const st = statusMeta(l.status);
                  return (
                    <tr
                      key={l.id}
                      tabIndex={0}
                      onClick={() => setOpenId(l.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") setOpenId(l.id);
                      }}
                      className="hover:bg-line/40 transition cursor-pointer focus:outline-none focus-visible:bg-line/40"
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3 min-w-[16rem]">
                          <Thumb src={l.coverUrl} className="w-14 h-10" />
                          <div className="min-w-0">
                            <p className="font-semibold text-fg line-clamp-1">{l.title}</p>
                            <p className="text-[11.5px] text-muted truncate">
                              {l.owner?.fullName ?? "—"}
                              {l.neighborhood ? ` · ${l.neighborhood}` : ""}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-fg whitespace-nowrap">{l.city || "—"}</td>
                      <td className="px-3 py-3 text-muted whitespace-nowrap">{l.category || "—"}</td>
                      <td className="px-3 py-3 font-semibold text-fg whitespace-nowrap tabular-nums">
                        {fmtPrice(l.priceFcfa, l.priceUnit)}
                      </td>
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                        <select
                          value={l.status}
                          disabled={rowBusy === l.id}
                          onChange={(e) => quickPatch(l.id, { status: e.target.value })}
                          title="Changer le statut"
                          className={`text-[11.5px] font-semibold rounded-full pl-2.5 pr-1 py-1 border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50 ${st.cls}`}
                        >
                          {!STATUS_META[l.status as Status] && <option value={l.status}>{l.status}</option>}
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {STATUS_META[s].label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5">
                          <Chip
                            on={l.available}
                            disabled={rowBusy === l.id}
                            onClick={() => quickPatch(l.id, { available: !l.available })}
                            title={l.available ? "Disponible — cliquer pour marquer indisponible" : "Indisponible — cliquer pour marquer disponible"}
                            onCls="bg-success/12 text-success"
                          >
                            {l.available ? "Dispo" : "Indispo"}
                          </Chip>
                          <Chip
                            on={l.verified}
                            disabled={rowBusy === l.id}
                            onClick={() => quickPatch(l.id, { verified: !l.verified })}
                            title={l.verified ? "Vérifiée — cliquer pour retirer" : "Non vérifiée — cliquer pour vérifier"}
                            onCls="bg-primary-light text-primary-text"
                          >
                            {l.verified ? "✓ Vérifiée" : "Non vérifiée"}
                          </Chip>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-[12px] text-muted whitespace-nowrap tabular-nums">
                        <span title="Vues">{nf.format(l.views)} vues</span>
                        <span className="mx-1">·</span>
                        <span title="Contacts">{nf.format(l.contacts)} contacts</span>
                        <span className="mx-1">·</span>
                        <span title="Favoris">{nf.format(l.favorites)} fav.</span>
                      </td>
                      <td className="px-5 py-3 text-[12px] text-muted whitespace-nowrap">{fmtDay(l.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {data && data.total > data.pageSize && (
          <div className="px-5 pb-4 border-t border-line">
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} />
          </div>
        )}
      </div>

      {openId && token && (
        <ListingEditor
          key={openId}
          id={openId}
          token={token}
          categories={categoryOptions}
          onClose={closeEditor}
          onChanged={applyToRow}
          onDeleted={() => {
            closeEditor();
            load();
          }}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Editor drawer                                                       */
/* ------------------------------------------------------------------ */

function ListingEditor({
  id,
  token,
  categories,
  onClose,
  onChanged,
  onDeleted,
}: {
  id: string;
  token: string;
  categories: string[];
  onClose: () => void;
  onChanged: (l: Detail) => void;
  onDeleted: () => void;
}) {
  const [listing, setListing] = useState<Detail | null>(null);
  const [init, setInit] = useState<Form | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "danger"; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const initRef = useRef<Form | null>(null);
  const formRef = useRef<Form | null>(null);

  useEffect(() => {
    formRef.current = form;
  }, [form]);

  /** Fetch the listing. With `keepEdits`, fields the operator touched but didn't save survive the refresh. */
  const fetchListing = useCallback(
    async (keepEdits: boolean): Promise<Detail> => {
      const res = await adminApi<{ listing: Detail }>(`/listings/${id}`, token);
      const next = toForm(res.listing);
      const oldInit = initRef.current;
      const current = formRef.current;
      let merged = next;
      if (keepEdits && oldInit && current) {
        merged = { ...next };
        for (const k of dirtyKeys(current, oldInit)) Object.assign(merged, { [k]: current[k] });
      }
      initRef.current = next;
      formRef.current = merged;
      setListing(res.listing);
      setInit(next);
      setForm(merged);
      return res.listing;
    },
    [id, token],
  );

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    fetchListing(false).catch((e) => {
      if (!cancelled) setLoadError(errMsg(e, "Impossible de charger l'annonce."));
    });
    return () => {
      cancelled = true;
    };
  }, [fetchListing]);

  const dirty = form && init ? dirtyKeys(form, init) : [];
  const { patch, errors } = form && init ? buildPatch(form, init) : { patch: {}, errors: [] as string[] };
  const hasChanges = dirty.length > 0;

  const requestClose = useCallback(() => {
    if (hasChanges && !window.confirm("Des modifications ne sont pas enregistrées. Fermer quand même ?")) return;
    onClose();
  }, [hasChanges, onClose]);

  // Escape closes the drawer (unless the delete confirmation is on top of it).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !confirmDelete) requestClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [confirmDelete, requestClose]);

  // The page behind stops scrolling while the drawer is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  function set<K extends keyof Form>(k: K, v: Form[K]) {
    setForm((f) => (f ? { ...f, [k]: v } : f));
    setNotice((n) => (n?.kind === "success" ? null : n));
  }

  async function save() {
    if (!form || !init || !hasChanges) return;
    if (errors.length) {
      setNotice({ kind: "danger", text: errors.join(" ") });
      return;
    }
    const count = Object.keys(patch).length;
    if (count === 0) {
      // Only cosmetic differences (e.g. trailing spaces) — nothing to send.
      setForm(init);
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const res = await adminApi<{ listing: Detail }>(`/listings/${id}`, token, { method: "PATCH", body: patch });
      const next = toForm(res.listing);
      initRef.current = next;
      formRef.current = next;
      setListing(res.listing);
      setInit(next);
      setForm(next);
      onChanged(res.listing);
      setNotice({ kind: "success", text: `Annonce enregistrée (${count} champ${count > 1 ? "s" : ""}).` });
    } catch (e) {
      setNotice({ kind: "danger", text: errMsg(e, "Échec de l'enregistrement.") });
    } finally {
      setSaving(false);
    }
  }

  /** Run a side action (pin, boost, transfer…), then refresh while keeping unsaved edits. */
  async function runAction(key: string, fn: () => Promise<unknown>, success: string) {
    setBusy(key);
    setNotice(null);
    try {
      await fn();
      const fresh = await fetchListing(true);
      onChanged(fresh);
      setNotice({ kind: "success", text: success });
      return true;
    } catch (e) {
      setNotice({ kind: "danger", text: errMsg(e) });
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function doDelete() {
    setBusy("delete");
    try {
      await adminApi(`/listings/${id}`, token, { method: "DELETE" });
      setConfirmDelete(false);
      onDeleted();
    } catch (e) {
      setConfirmDelete(false);
      setNotice({ kind: "danger", text: errMsg(e, "Suppression impossible.") });
    } finally {
      setBusy(null);
    }
  }

  const st = listing ? statusMeta(listing.status) : null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={requestClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Modifier l'annonce"
        className="relative h-full w-full max-w-5xl bg-bg border-l border-line shadow-2xl flex flex-col"
      >
        {/* header */}
        <header className="flex items-center gap-3 px-6 py-4 border-b border-line bg-card shrink-0">
          <Thumb src={listing?.coverUrl} className="w-12 h-9" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-[15px] font-bold text-fg truncate">{listing?.title ?? "Annonce"}</h2>
              {st && <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${st.cls}`}>{st.label}</span>}
              {listing && isPinned(listing) && (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-primary-light text-primary-text shrink-0">Épinglée</span>
              )}
            </div>
            <p className="text-[11.5px] text-muted truncate font-mono">{id}</p>
          </div>
          <button
            onClick={requestClose}
            aria-label="Fermer"
            className="w-8 h-8 grid place-items-center rounded-lg text-muted hover:text-fg hover:bg-line/40 cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        {/* body */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {loadError ? (
            <div className="p-10 text-center space-y-3">
              <p className="text-sm text-danger">{loadError}</p>
              <div className="flex justify-center gap-2">
                <Btn
                  size="sm"
                  variant="neutral"
                  onClick={() => {
                    setLoadError(null);
                    fetchListing(false).catch((e) => setLoadError(errMsg(e, "Impossible de charger l'annonce.")));
                  }}
                >
                  Réessayer
                </Btn>
                <Btn size="sm" variant="neutral" onClick={onClose}>
                  Fermer
                </Btn>
              </div>
            </div>
          ) : !listing || !form ? (
            <div className="py-24 grid place-items-center">
              <Spinner />
            </div>
          ) : (
            <div className="p-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px] items-start">
              {/* ---- form column ---- */}
              <div className="space-y-5 min-w-0">
                <Section title="Contenu">
                  <Field label="Titre">
                    <input className={field} value={form.title} onChange={(e) => set("title", e.target.value)} maxLength={160} />
                  </Field>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Field label="Catégorie">
                      <input
                        className={field}
                        list="listing-categories-editor"
                        value={form.category}
                        onChange={(e) => set("category", e.target.value)}
                        maxLength={60}
                      />
                      <datalist id="listing-categories-editor">
                        {categories.map((c) => (
                          <option key={c} value={c} />
                        ))}
                      </datalist>
                    </Field>
                    <Field label="Type d'offre">
                      <select className={field} value={form.deal} onChange={(e) => set("deal", e.target.value)}>
                        {!DEAL_LABELS[form.deal as Deal] && <option value={form.deal}>{form.deal}</option>}
                        {DEALS.map((d) => (
                          <option key={d} value={d}>
                            {DEAL_LABELS[d]}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <Field label="Description">
                    <textarea
                      className={`${field} min-h-[8rem] resize-y`}
                      value={form.about}
                      onChange={(e) => set("about", e.target.value)}
                      maxLength={5000}
                    />
                  </Field>
                  <Field label="Tags" hint="Entrée ou virgule pour ajouter.">
                    <TagInput value={form.tags} onChange={(t) => set("tags", t)} />
                  </Field>
                </Section>

                <Section title="Prix">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Field
                      label="Prix (FCFA)"
                      hint={(() => {
                        const n = toNumber(form.priceFcfa);
                        return n !== null && Number.isFinite(n) ? fmtPrice(n, form.priceUnit) : undefined;
                      })()}
                    >
                      <input
                        className={field}
                        inputMode="numeric"
                        value={form.priceFcfa}
                        onChange={(e) => set("priceFcfa", e.target.value)}
                      />
                    </Field>
                    <Field label="Unité">
                      <select className={field} value={form.priceUnit} onChange={(e) => set("priceUnit", e.target.value)}>
                        {!PRICE_UNIT_LABELS[form.priceUnit as PriceUnit] && <option value={form.priceUnit}>{form.priceUnit}</option>}
                        {PRICE_UNITS.map((u) => (
                          <option key={u} value={u}>
                            {PRICE_UNIT_LABELS[u]}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <ToggleRow label="Prix négociable" checked={form.negotiable} onChange={(v) => set("negotiable", v)} />
                </Section>

                <Section title="Caractéristiques">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Field label="Pièces">
                      <input className={field} inputMode="numeric" value={form.rooms} onChange={(e) => set("rooms", e.target.value)} />
                    </Field>
                    <Field label="Salles de bain">
                      <input className={field} inputMode="numeric" value={form.bathrooms} onChange={(e) => set("bathrooms", e.target.value)} placeholder="—" />
                    </Field>
                    <Field label="Surface (m²)">
                      <input className={field} inputMode="numeric" value={form.sizeSqm} onChange={(e) => set("sizeSqm", e.target.value)} placeholder="—" />
                    </Field>
                    <Field label="Durée minimale (mois)">
                      <input
                        className={field}
                        inputMode="numeric"
                        value={form.minDurationMonths}
                        onChange={(e) => set("minDurationMonths", e.target.value)}
                        placeholder="—"
                      />
                    </Field>
                    <Field label="Disponible à partir du">
                      <div className="flex gap-2">
                        <input
                          type="date"
                          className={field}
                          value={form.availableFrom}
                          onChange={(e) => set("availableFrom", e.target.value)}
                        />
                        {form.availableFrom && (
                          <Btn size="sm" variant="neutral" onClick={() => set("availableFrom", "")}>
                            Effacer
                          </Btn>
                        )}
                      </div>
                    </Field>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
                    <ToggleRow label="Meublé" checked={form.furnished} onChange={(v) => set("furnished", v)} />
                    <ToggleRow label="Disponible" checked={form.available} onChange={(v) => set("available", v)} />
                  </div>
                </Section>

                <Section title="Localisation">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Field label="Région">
                      <input className={field} value={form.region} onChange={(e) => set("region", e.target.value)} maxLength={80} />
                    </Field>
                    <Field label="Ville">
                      <input className={field} value={form.city} onChange={(e) => set("city", e.target.value)} maxLength={80} />
                    </Field>
                    <Field label="Quartier">
                      <input className={field} value={form.neighborhood} onChange={(e) => set("neighborhood", e.target.value)} maxLength={80} />
                    </Field>
                    <Field label="Adresse">
                      <input className={field} value={form.address} onChange={(e) => set("address", e.target.value)} maxLength={200} />
                    </Field>
                    <Field label="Latitude">
                      <input className={field} inputMode="decimal" value={form.lat} onChange={(e) => set("lat", e.target.value)} placeholder="ex. 4.0511" />
                    </Field>
                    <Field label="Longitude">
                      <input className={field} inputMode="decimal" value={form.lng} onChange={(e) => set("lng", e.target.value)} placeholder="ex. 9.7679" />
                    </Field>
                  </div>
                  {(() => {
                    const la = toNumber(form.lat);
                    const lo = toNumber(form.lng);
                    return la !== null && lo !== null && Number.isFinite(la) && Number.isFinite(lo) ? (
                      <a
                        href={`https://www.google.com/maps?q=${la},${lo}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block text-[12px] text-primary-text hover:underline"
                      >
                        Voir sur la carte ↗
                      </a>
                    ) : null;
                  })()}
                </Section>

                <Section title="Photos" meta={`${form.photos.length}`}>
                  <PhotosEditor
                    photos={form.photos}
                    cover={form.coverUrl}
                    onPhotos={(p) => set("photos", p)}
                    onCover={(c) => set("coverUrl", c)}
                  />
                  <Field label="URL de couverture" hint={listing.imageName ? `Image d'origine : ${listing.imageName}` : undefined}>
                    <input
                      className={field}
                      value={form.coverUrl}
                      onChange={(e) => set("coverUrl", e.target.value)}
                      placeholder="https://…"
                    />
                  </Field>
                </Section>

                <Section title="Modération">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Field label="Statut">
                      <select className={field} value={form.status} onChange={(e) => set("status", e.target.value)}>
                        {!STATUS_META[form.status as Status] && <option value={form.status}>{form.status}</option>}
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {STATUS_META[s].label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Note (0–5)" hint={`${listing.reviewCount} avis`}>
                      <input
                        className={field}
                        inputMode="decimal"
                        value={form.rating}
                        onChange={(e) => set("rating", e.target.value)}
                        placeholder="—"
                      />
                    </Field>
                  </div>
                  <ToggleRow label="Badge « vérifiée »" checked={form.verified} onChange={(v) => set("verified", v)} />
                  <Field label="Note interne (admin)" hint="Visible uniquement par l'équipe.">
                    <textarea
                      className={`${field} min-h-[5rem] resize-y`}
                      value={form.adminNote}
                      onChange={(e) => set("adminNote", e.target.value)}
                      maxLength={2000}
                    />
                  </Field>
                </Section>
              </div>

              {/* ---- side column ---- */}
              <div className="space-y-5">
                <Section title="Propriétaire">
                  <div className="flex items-center gap-3">
                    <Avatar owner={listing.owner} />
                    <div className="min-w-0">
                      <Link href={`/users/${listing.ownerId}`} className="text-[13px] font-semibold text-primary-text hover:underline truncate block">
                        {listing.owner?.fullName ?? "—"}
                      </Link>
                      <p className="text-[11.5px] text-muted truncate">{listing.owner?.phone}</p>
                      {listing.owner?.email && <p className="text-[11.5px] text-muted truncate">{listing.owner.email}</p>}
                    </div>
                  </div>
                  <TransferPanel
                    token={token}
                    currentOwnerId={listing.ownerId}
                    busy={busy === "transfer"}
                    onTransfer={(u) =>
                      runAction(
                        "transfer",
                        () =>
                          adminApi(`/moderation/listings/${id}/transfer`, token, {
                            method: "POST",
                            body: { newOwnerId: u.id },
                          }),
                        `Annonce transférée à ${u.fullName}.`,
                      )
                    }
                  />
                </Section>

                <Section title="Statistiques">
                  <div className="grid grid-cols-2 gap-2">
                    <Stat label="Vues" value={nf.format(listing.views)} />
                    <Stat label="Contacts" value={nf.format(listing.contacts)} />
                    <Stat label="Favoris" value={nf.format(listing.favorites)} />
                    <Stat
                      label="Avis"
                      value={`${listing.reviewCount}${listing.rating != null ? ` · ${listing.rating.toFixed(1)}★` : ""}`}
                    />
                  </div>
                  <dl className="text-[12px] space-y-1.5">
                    <Meta k="Créée" v={fmtDate(listing.createdAt)} />
                    <Meta k="Modifiée" v={fmtDate(listing.updatedAt)} />
                    <Meta k="Publiée" v={fmtDate(listing.publishedAt)} />
                    {listing.archivedAt && <Meta k="Archivée" v={fmtDate(listing.archivedAt)} />}
                    {listing.currency && <Meta k="Devise" v={listing.currency} />}
                  </dl>
                </Section>

                <Section title="Mise en avant">
                  <PinPanel
                    listing={listing}
                    busy={busy === "pin"}
                    onPin={(pinned, until) =>
                      runAction(
                        "pin",
                        () =>
                          adminApi(`/moderation/listings/${id}/pin`, token, {
                            method: "POST",
                            body: until ? { pinned, until } : { pinned },
                          }),
                        pinned ? "Annonce épinglée." : "Annonce désépinglée.",
                      )
                    }
                  />
                  <div className="border-t border-line" />
                  <BoostPanel
                    listing={listing}
                    busy={busy === "boost"}
                    onBoost={(days) =>
                      runAction(
                        "boost",
                        () => adminApi(`/moderation/listings/${id}/boost`, token, { method: "POST", body: { days } }),
                        `Boost de ${days} jour${days > 1 ? "s" : ""} appliqué.`,
                      )
                    }
                    onUnboost={() =>
                      runAction(
                        "boost",
                        () => adminApi(`/moderation/listings/${id}/boost`, token, { method: "DELETE" }),
                        "Boost retiré.",
                      )
                    }
                  />
                  {dirty.includes("status") && (
                    <p className="text-[11.5px] text-warning">
                      Attention : le boost change le statut ; votre statut non enregistré sera conservé dans le formulaire.
                    </p>
                  )}
                </Section>

                <Section title="Zone sensible">
                  <p className="text-[12px] text-muted">
                    La suppression est définitive : l'annonce disparaît de l'application avec ses données liées.
                  </p>
                  <Btn variant="danger" size="sm" onClick={() => setConfirmDelete(true)} disabled={!!busy}>
                    Supprimer l'annonce
                  </Btn>
                </Section>
              </div>
            </div>
          )}
        </div>

        {/* footer */}
        {listing && form && (
          <footer className="shrink-0 border-t border-line bg-card px-6 py-3 space-y-2">
            {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
            {!notice && hasChanges && errors.length > 0 && <Notice kind="danger">{errors[0]}</Notice>}
            <div className="flex items-center gap-3">
              <span className="text-[12px] text-muted">
                {hasChanges
                  ? `${dirty.length} modification${dirty.length > 1 ? "s" : ""} non enregistrée${dirty.length > 1 ? "s" : ""}`
                  : "Aucune modification"}
              </span>
              <div className="ml-auto flex items-center gap-2">
                <Btn variant="neutral" onClick={() => init && setForm(init)} disabled={!hasChanges || saving}>
                  Annuler les modifications
                </Btn>
                <button
                  onClick={save}
                  disabled={!hasChanges || saving || errors.length > 0}
                  className="px-4 py-2 text-sm rounded-xl bg-primary text-white font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                >
                  {saving ? "Enregistrement…" : "Enregistrer"}
                </button>
              </div>
            </div>
          </footer>
        )}
      </aside>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={doDelete}
        busy={busy === "delete"}
        title="Supprimer l'annonce"
        phrase="SUPPRIMER"
        confirmLabel="Supprimer définitivement"
        body={
          <p>
            L'annonce <strong>« {listing?.title} »</strong> de {listing?.owner?.fullName ?? "ce propriétaire"} sera
            supprimée définitivement. Cette action est irréversible.
          </p>
        }
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Editor sub-panels                                                   */
/* ------------------------------------------------------------------ */

function PhotosEditor({
  photos,
  cover,
  onPhotos,
  onCover,
}: {
  photos: string[];
  cover: string;
  onPhotos: (p: string[]) => void;
  onCover: (c: string) => void;
}) {
  const [url, setUrl] = useState("");
  const [err, setErr] = useState<string | null>(null);

  function add() {
    const u = url.trim();
    if (!u) return;
    if (!isHttpUrl(u)) return setErr("URL invalide (http:// ou https://).");
    if (photos.includes(u)) return setErr("Cette photo est déjà dans la galerie.");
    onPhotos([...photos, u]);
    if (!cover) onCover(u);
    setUrl("");
    setErr(null);
  }

  function move(i: number, d: -1 | 1) {
    const j = i + d;
    if (j < 0 || j >= photos.length) return;
    const next = [...photos];
    [next[i], next[j]] = [next[j], next[i]];
    onPhotos(next);
  }

  function remove(i: number) {
    const removed = photos[i];
    const next = photos.filter((_, k) => k !== i);
    onPhotos(next);
    if (removed === cover) onCover(next[0] ?? "");
  }

  const coverOutsideGallery = !!cover && !photos.includes(cover);

  return (
    <div className="space-y-3">
      {coverOutsideGallery && (
        <div className="flex items-center gap-3 rounded-xl border border-warning/40 bg-warning/15 p-2.5">
          <Thumb src={cover} className="w-16 h-12" />
          <p className="text-[12px] text-warning">La couverture actuelle ne fait pas partie de la galerie.</p>
        </div>
      )}
      {photos.length === 0 ? (
        <p className="text-[12px] text-muted">Aucune photo.</p>
      ) : (
        <ul className="space-y-2">
          {photos.map((p, i) => {
            const isCover = p === cover;
            return (
              <li
                key={`${p}-${i}`}
                className={`flex flex-wrap sm:flex-nowrap items-center gap-3 rounded-xl border p-2 ${
                  isCover ? "border-primary/50 bg-primary-light" : "border-line"
                }`}
              >
                <a href={p} target="_blank" rel="noreferrer" className="shrink-0">
                  <Thumb src={p} className="w-20 h-14" />
                </a>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted tabular-nums">#{i + 1}</span>
                    {isCover && (
                      <span className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded-md bg-primary text-white">Couverture</span>
                    )}
                  </div>
                  <p className="text-[11.5px] text-fg truncate" title={p}>
                    {p}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <IconBtn title="Monter" disabled={i === 0} onClick={() => move(i, -1)}>
                    ↑
                  </IconBtn>
                  <IconBtn title="Descendre" disabled={i === photos.length - 1} onClick={() => move(i, 1)}>
                    ↓
                  </IconBtn>
                  {!isCover && (
                    <Btn size="sm" variant="primary" onClick={() => onCover(p)}>
                      Définir comme couverture
                    </Btn>
                  )}
                  <Btn size="sm" variant="danger" onClick={() => remove(i)}>
                    Retirer
                  </Btn>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          className={field}
          value={url}
          placeholder="Ajouter une photo (URL)"
          onChange={(e) => {
            setUrl(e.target.value);
            setErr(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Btn variant="primary" onClick={add} disabled={!url.trim()}>
          Ajouter
        </Btn>
      </div>
      {err && <p className="text-[12px] text-danger">{err}</p>}
    </div>
  );
}

function TagInput({ value, onChange }: { value: string[]; onChange: (t: string[]) => void }) {
  const [draft, setDraft] = useState("");

  function commit(text: string) {
    const parts = text
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => s.slice(0, 40));
    setDraft("");
    if (!parts.length) return;
    const next = [...value];
    for (const p of parts) if (!next.includes(p)) next.push(p);
    if (next.length !== value.length) onChange(next);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 w-full px-2 py-1.5 rounded-xl border border-line bg-bg focus-within:ring-2 focus-within:ring-primary/30">
      {value.map((t) => (
        <span
          key={t}
          className="inline-flex items-center gap-1 text-[12px] font-medium px-2 py-0.5 rounded-lg bg-primary-light text-primary-text"
        >
          {t}
          <button
            type="button"
            onClick={() => onChange(value.filter((x) => x !== t))}
            aria-label={`Retirer ${t}`}
            className="opacity-60 hover:opacity-100 cursor-pointer"
          >
            ×
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => {
          const v = e.target.value;
          if (v.includes(",")) commit(v);
          else setDraft(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(draft);
          } else if (e.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => commit(draft)}
        placeholder={value.length ? "" : "ex. climatisé, parking"}
        className="flex-1 min-w-[8rem] bg-transparent text-sm text-fg placeholder:text-muted px-1 py-0.5 focus:outline-none"
      />
    </div>
  );
}

function PinPanel({
  listing,
  busy,
  onPin,
}: {
  listing: Detail;
  busy: boolean;
  onPin: (pinned: boolean, until?: string) => void;
}) {
  const [until, setUntil] = useState("");
  const pinned = isPinned(listing);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-fg">Épinglage</span>
        <span
          className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
            pinned ? "bg-primary-light text-primary-text" : "bg-line/60 text-muted"
          }`}
        >
          {pinned ? "Épinglée" : "Non épinglée"}
        </span>
      </div>
      {pinned ? (
        <>
          <p className="text-[12px] text-muted">
            Depuis {fmtDate(listing.pinnedAt)}
            {listing.pinnedUntil ? ` · jusqu'au ${fmtDay(listing.pinnedUntil)}` : " · sans limite"}
          </p>
          <Btn size="sm" variant="neutral" disabled={busy} onClick={() => onPin(false)}>
            {busy ? "…" : "Désépingler"}
          </Btn>
        </>
      ) : (
        <>
          <label className="block text-[11.5px] text-muted">Jusqu'au (optionnel)</label>
          <input type="date" className={field} value={until} onChange={(e) => setUntil(e.target.value)} />
          <Btn
            size="sm"
            variant="primary"
            disabled={busy}
            onClick={() => onPin(true, until ? new Date(`${until}T23:59:59`).toISOString() : undefined)}
          >
            {busy ? "…" : "Épingler"}
          </Btn>
        </>
      )}
    </div>
  );
}

function BoostPanel({
  listing,
  busy,
  onBoost,
  onUnboost,
}: {
  listing: Detail;
  busy: boolean;
  onBoost: (days: number) => void;
  onUnboost: () => void;
}) {
  const [days, setDays] = useState("7");
  const boosted = isBoosted(listing);
  const n = Number(days);
  const valid = Number.isInteger(n) && n >= 1 && n <= 365;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-fg">Boost</span>
        <span
          className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
            boosted ? "bg-accent/12 text-accent" : "bg-line/60 text-muted"
          }`}
        >
          {boosted ? "Actif" : "Inactif"}
        </span>
      </div>
      {boosted && (
        <p className="text-[12px] text-muted">
          {listing.boostExpiresAt ? `Expire le ${fmtDate(listing.boostExpiresAt)}` : "Sans date d'expiration"}
          {listing.boostDaysLeft != null
            ? ` · ${listing.boostDaysLeft} j restant${listing.boostDaysLeft > 1 ? "s" : ""}`
            : ""}
        </p>
      )}
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          max={365}
          className={`${field} w-20`}
          value={days}
          onChange={(e) => setDays(e.target.value)}
          aria-label="Nombre de jours"
        />
        <Btn size="sm" variant="accent" disabled={busy || !valid} onClick={() => onBoost(n)}>
          {busy ? "…" : `${boosted ? "Prolonger" : "Booster"}${valid ? ` ${n} j` : ""}`}
        </Btn>
      </div>
      {boosted && (
        <Btn size="sm" variant="neutral" disabled={busy} onClick={onUnboost}>
          Retirer le boost
        </Btn>
      )}
    </div>
  );
}

function TransferPanel({
  token,
  currentOwnerId,
  busy,
  onTransfer,
}: {
  token: string;
  currentOwnerId: string;
  busy: boolean;
  onTransfer: (u: UserHit) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<UserHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [picked, setPicked] = useState<UserHit | null>(null);

  useEffect(() => {
    const term = q.trim();
    if (!open || term.length < 2) {
      setHits(null);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    setErr(null);
    adminApi<Paged<UserHit>>("/users", token, { params: { query: term, pageSize: 8 } })
      .then((res) => {
        if (!cancelled) setHits(res.items);
      })
      .catch((e) => {
        if (!cancelled) setErr(errMsg(e, "Recherche impossible."));
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [q, open, token]);

  function reset() {
    setOpen(false);
    setPicked(null);
    setQ("");
  }

  if (!open) {
    return (
      <Btn size="sm" variant="neutral" onClick={() => setOpen(true)}>
        Transférer à un autre propriétaire
      </Btn>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-line p-3">
      <div className="flex items-center">
        <span className="text-[12px] font-semibold text-fg">Transférer l'annonce</span>
        <button onClick={reset} className="ml-auto text-[11.5px] text-muted hover:text-fg cursor-pointer">
          Fermer
        </button>
      </div>

      {picked ? (
        <div className="space-y-2">
          <p className="text-[12px] text-fg">
            Transférer à <strong>{picked.fullName}</strong>
            <span className="block text-muted">{[picked.phone, picked.email].filter(Boolean).join(" · ")}</span>
          </p>
          <p className="text-[11.5px] text-muted">Le compte recevra le rôle propriétaire si nécessaire.</p>
          <div className="flex gap-2">
            <Btn
              size="sm"
              variant="warning"
              disabled={busy}
              onClick={async () => {
                if (await onTransfer(picked)) reset();
              }}
            >
              {busy ? "…" : "Confirmer le transfert"}
            </Btn>
            <Btn size="sm" variant="neutral" disabled={busy} onClick={() => setPicked(null)}>
              Retour
            </Btn>
          </div>
        </div>
      ) : (
        <>
          <SearchInput
            value={q}
            onChange={setQ}
            placeholder="Nom, téléphone, email…"
            className="w-full text-fg placeholder:text-muted"
          />
          {searching && <p className="text-[11.5px] text-muted">Recherche…</p>}
          {err && <p className="text-[11.5px] text-danger">{err}</p>}
          {hits && !searching && hits.length === 0 && <p className="text-[11.5px] text-muted">Aucun utilisateur trouvé.</p>}
          {hits && hits.length > 0 && (
            <ul className="divide-y divide-line rounded-lg border border-line overflow-hidden">
              {hits.map((u) => {
                const current = u.id === currentOwnerId;
                return (
                  <li key={u.id}>
                    <button
                      disabled={current}
                      onClick={() => setPicked(u)}
                      className="w-full text-left px-3 py-2 hover:bg-line/40 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <span className="block text-[12.5px] font-medium text-fg truncate">
                        {u.fullName} {current && <span className="text-muted font-normal">(actuel)</span>}
                      </span>
                      <span className="block text-[11px] text-muted truncate">
                        {[u.phone, u.email].filter(Boolean).join(" · ")}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Small building blocks                                               */
/* ------------------------------------------------------------------ */

function Section({ title, meta, children }: { title: string; meta?: string; children: ReactNode }) {
  return (
    <section className="bg-card rounded-2xl border border-line shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-line">
        <h3 className="text-[13px] font-semibold text-fg">{title}</h3>
        {meta && <span className="text-[11px] text-muted">{meta}</span>}
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </section>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-fg">{label}</span>
      <Toggle checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-bg border border-line px-3 py-2">
      <p className="text-[10.5px] uppercase tracking-wide text-muted">{label}</p>
      <p className="text-[14px] font-bold text-fg tabular-nums">{value}</p>
    </div>
  );
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{k}</dt>
      <dd className="text-fg text-right">{v}</dd>
    </div>
  );
}

function Thumb({ src, className }: { src?: string | null; className: string }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  if (!src || broken) {
    return (
      <div className={`${className} rounded-lg bg-line/60 shrink-0 grid place-items-center text-muted`}>
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16l5-5 4 4 3-3 6 6M3 5h18v14H3z" />
        </svg>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" onError={() => setBroken(true)} className={`${className} rounded-lg object-cover shrink-0 bg-line`} />
  );
}

function Avatar({ owner }: { owner?: Owner | null }) {
  if (owner?.avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={owner.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover shrink-0 bg-line" />;
  }
  return (
    <span
      className="w-10 h-10 rounded-full grid place-items-center text-white text-xs font-bold shrink-0"
      style={{ background: owner?.avatarColor || "#3A4FF0" }}
    >
      {(owner?.fullName ?? "?").slice(0, 2).toUpperCase()}
    </span>
  );
}

function Chip({
  on,
  onCls,
  disabled,
  onClick,
  title,
  children,
}: {
  on: boolean;
  onCls: string;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap transition cursor-pointer hover:opacity-80 disabled:opacity-40 ${
        on ? onCls : "bg-line/60 text-muted"
      }`}
    >
      {children}
    </button>
  );
}

function IconBtn({
  children,
  onClick,
  disabled,
  title,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className="w-7 h-7 grid place-items-center rounded-lg border border-line text-fg text-sm hover:bg-line/40 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
    >
      {children}
    </button>
  );
}
