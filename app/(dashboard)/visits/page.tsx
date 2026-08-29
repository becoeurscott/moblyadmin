"use client";

import { useAuth } from "@/lib/auth";
import { adminApi } from "@/lib/api";
import { useEffect, useState, useCallback } from "react";
import Pagination from "@/components/Pagination";

interface Visit {
  id: string;
  status: string;
  scheduledAt: string;
  message?: string;
  listing: { id: string; title: string; city: string };
  visitor: { id: string; fullName: string };
  owner: { id: string; fullName: string };
  createdAt: string;
}

interface VisitsPage {
  total: number;
  page: number;
  pageSize: number;
  items: Visit[];
}

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  REQUESTED: { label: "Demandée", cls: "bg-warning/10 text-warning" },
  CONFIRMED: { label: "Confirmée", cls: "bg-success/10 text-success" },
  CANCELLED: { label: "Annulée", cls: "bg-danger/10 text-danger" },
  COMPLETED: { label: "Terminée", cls: "bg-primary/10 text-primary" },
  NO_SHOW: { label: "Absent", cls: "bg-surface text-text" },
};

export default function VisitsPage() {
  const { token } = useAuth();
  const [data, setData] = useState<VisitsPage | null>(null);
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState("all");

  const load = useCallback(() => {
    if (!token) return;
    adminApi<VisitsPage>("/visits", token, {
      params: { page, status, pageSize: 30 },
    })
      .then(setData)
      .catch(console.error);
  }, [token, page, status]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-dark mb-6">Visites</h1>

      <div className="flex gap-3 mb-6">
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(0); }}
          className="px-3 py-2 rounded-xl border border-border bg-white text-sm cursor-pointer"
        >
          <option value="all">Tous statuts</option>
          <option value="REQUESTED">Demandée</option>
          <option value="CONFIRMED">Confirmée</option>
          <option value="CANCELLED">Annulée</option>
          <option value="COMPLETED">Terminée</option>
          <option value="NO_SHOW">Absent</option>
        </select>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-border/50 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface/50">
              <th className="text-left px-5 py-3 font-medium text-text">Annonce</th>
              <th className="text-left px-5 py-3 font-medium text-text">Visiteur</th>
              <th className="text-left px-5 py-3 font-medium text-text">Propriétaire</th>
              <th className="text-left px-5 py-3 font-medium text-text">Date prévue</th>
              <th className="text-left px-5 py-3 font-medium text-text">Statut</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((v) => {
              const st = STATUS_STYLE[v.status] || { label: v.status, cls: "bg-surface text-text" };
              return (
                <tr key={v.id} className="border-b border-border/30 hover:bg-surface/30 transition">
                  <td className="px-5 py-3">
                    <p className="font-medium text-dark line-clamp-1">{v.listing.title}</p>
                    <p className="text-xs text-text">{v.listing.city}</p>
                  </td>
                  <td className="px-5 py-3 text-text">{v.visitor.fullName}</td>
                  <td className="px-5 py-3 text-text">{v.owner.fullName}</td>
                  <td className="px-5 py-3 text-text">
                    {new Date(v.scheduledAt).toLocaleDateString("fr-FR", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.cls}`}>
                      {st.label}
                    </span>
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
