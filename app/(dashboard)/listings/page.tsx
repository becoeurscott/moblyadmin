"use client";

import { useAuth } from "@/lib/auth";
import { adminApi } from "@/lib/api";
import { useEffect, useState, useCallback } from "react";
import Pagination from "@/components/Pagination";

interface Listing {
  id: string;
  title: string;
  category: string;
  status: string;
  available: boolean;
  verified: boolean;
  city: string;
  neighborhood?: string;
  priceFcfa: number;
  priceUnit: string;
  coverUrl?: string;
  views: number;
  contacts: number;
  favorites: number;
  createdAt: string;
  owner: { id: string; fullName: string };
}

interface ListingsPage {
  total: number;
  page: number;
  pageSize: number;
  items: Listing[];
}

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: "Active", cls: "bg-success/10 text-success" },
  PENDING: { label: "En attente", cls: "bg-warning/10 text-warning" },
  BOOSTED: { label: "Boostée", cls: "bg-accent/10 text-accent" },
  DRAFT: { label: "Brouillon", cls: "bg-surface text-text" },
  PAUSED: { label: "Pausée", cls: "bg-surface text-text" },
  REJECTED: { label: "Rejetée", cls: "bg-danger/10 text-danger" },
  ARCHIVED: { label: "Archivée", cls: "bg-surface text-text" },
};

function fmt(n: number) {
  return new Intl.NumberFormat("fr-FR").format(n);
}

export default function ListingsPage() {
  const { token } = useAuth();
  const [data, setData] = useState<ListingsPage | null>(null);
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");

  const load = useCallback(() => {
    if (!token) return;
    adminApi<ListingsPage>("/listings", token, {
      params: { page, query, status, pageSize: 20 },
    })
      .then(setData)
      .catch(console.error);
  }, [token, page, query, status]);

  useEffect(() => { load(); }, [load]);

  async function patchListing(id: string, body: Record<string, unknown>) {
    if (!token) return;
    await adminApi(`/listings/${id}`, token, { method: "PATCH", body });
    load();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-dark mb-6">Annonces</h1>

      <div className="flex flex-wrap gap-3 mb-6">
        <input
          type="text"
          placeholder="Rechercher (titre, quartier, ville)..."
          value={query}
          onChange={(e) => { setQuery(e.target.value); setPage(0); }}
          className="px-4 py-2 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 w-72"
        />
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(0); }}
          className="px-3 py-2 rounded-xl border border-border bg-white text-sm cursor-pointer"
        >
          <option value="all">Tous statuts</option>
          <option value="ACTIVE">Active</option>
          <option value="PENDING">En attente</option>
          <option value="BOOSTED">Boostée</option>
          <option value="DRAFT">Brouillon</option>
          <option value="REJECTED">Rejetée</option>
          <option value="ARCHIVED">Archivée</option>
        </select>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-border/50 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface/50">
              <th className="text-left px-5 py-3 font-medium text-text">Annonce</th>
              <th className="text-left px-5 py-3 font-medium text-text">Propriétaire</th>
              <th className="text-left px-5 py-3 font-medium text-text">Prix</th>
              <th className="text-left px-5 py-3 font-medium text-text">Statut</th>
              <th className="text-left px-5 py-3 font-medium text-text">Stats</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {data?.items.map((l) => {
              const st = STATUS_LABELS[l.status] || { label: l.status, cls: "bg-surface text-text" };
              return (
                <tr key={l.id} className="border-b border-border/30 hover:bg-surface/30 transition">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      {l.coverUrl ? (
                        <img
                          src={l.coverUrl}
                          alt=""
                          className="w-12 h-9 rounded-lg object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-9 rounded-lg bg-surface shrink-0" />
                      )}
                      <div>
                        <p className="font-medium text-dark line-clamp-1">{l.title}</p>
                        <p className="text-xs text-text">{l.neighborhood || l.city} · {l.category}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-text">{l.owner.fullName}</td>
                  <td className="px-5 py-3 font-medium text-dark">
                    {fmt(l.priceFcfa)} FCFA
                    <span className="text-xs text-text font-normal">/{l.priceUnit === "jour" ? "j" : l.priceUnit}</span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.cls}`}>
                      {st.label}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-text text-xs">
                    {l.views} vues · {l.contacts} contacts · {l.favorites} favs
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex gap-2">
                      {l.status === "PENDING" && (
                        <>
                          <button
                            onClick={() => patchListing(l.id, { status: "ACTIVE" })}
                            className="text-xs px-2.5 py-1 rounded-lg bg-success/10 text-success hover:bg-success/20 font-medium cursor-pointer"
                          >
                            Approuver
                          </button>
                          <button
                            onClick={() => patchListing(l.id, { status: "REJECTED" })}
                            className="text-xs px-2.5 py-1 rounded-lg bg-danger/10 text-danger hover:bg-danger/20 font-medium cursor-pointer"
                          >
                            Rejeter
                          </button>
                        </>
                      )}
                      {l.status === "ACTIVE" && !l.verified && (
                        <button
                          onClick={() => patchListing(l.id, { verified: true })}
                          className="text-xs px-2.5 py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 font-medium cursor-pointer"
                        >
                          Vérifier
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {data && (
          <div className="px-5 pb-4">
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} />
          </div>
        )}
      </div>
    </div>
  );
}
