"use client";

import { useAuth } from "@/lib/auth";
import { adminApi } from "@/lib/api";
import { useEffect, useState, useCallback } from "react";
import Pagination from "@/components/Pagination";

interface Report {
  id: string;
  reason: string;
  description?: string;
  status: string;
  resolution?: string;
  targetType: string;
  targetId: string;
  reporter: { id: string; fullName: string; email?: string; phone: string };
  createdAt: string;
  resolvedAt?: string;
}

interface ReportsPage {
  total: number;
  page: number;
  pageSize: number;
  items: Report[];
}

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  OPEN: { label: "Ouvert", cls: "bg-danger/10 text-danger" },
  REVIEWING: { label: "En revue", cls: "bg-warning/10 text-warning" },
  ACTIONED: { label: "Traité", cls: "bg-success/10 text-success" },
  DISMISSED: { label: "Rejeté", cls: "bg-surface text-text" },
};

export default function ReportsPage() {
  const { token } = useAuth();
  const [data, setData] = useState<ReportsPage | null>(null);
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState("all");

  const load = useCallback(() => {
    if (!token) return;
    adminApi<ReportsPage>("/reports", token, {
      params: { page, status, pageSize: 25 },
    })
      .then(setData)
      .catch(console.error);
  }, [token, page, status]);

  useEffect(() => { load(); }, [load]);

  async function patchReport(id: string, newStatus: string) {
    if (!token) return;
    await adminApi(`/reports/${id}`, token, {
      method: "PATCH",
      body: { status: newStatus },
    });
    load();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-dark mb-6">Signalements</h1>

      <div className="flex gap-3 mb-6">
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(0); }}
          className="px-3 py-2 rounded-xl border border-border bg-white text-sm cursor-pointer"
        >
          <option value="all">Tous</option>
          <option value="OPEN">Ouverts</option>
          <option value="REVIEWING">En revue</option>
          <option value="ACTIONED">Traités</option>
          <option value="DISMISSED">Rejetés</option>
        </select>
      </div>

      <div className="space-y-3">
        {data?.items.map((r) => {
          const st = STATUS_STYLE[r.status] || { label: r.status, cls: "bg-surface text-text" };
          return (
            <div key={r.id} className="bg-white rounded-2xl shadow-sm border border-border/50 p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.cls}`}>
                      {st.label}
                    </span>
                    <span className="text-xs text-text">
                      {r.targetType} · {new Date(r.createdAt).toLocaleDateString("fr-FR")}
                    </span>
                  </div>
                  <p className="font-medium text-dark">{r.reason}</p>
                  {r.description && (
                    <p className="text-sm text-text mt-1">{r.description}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-xs text-text">
                  Par {r.reporter.fullName} ({r.reporter.email || r.reporter.phone})
                </p>
                {(r.status === "OPEN" || r.status === "REVIEWING") && (
                  <div className="flex gap-2">
                    {r.status === "OPEN" && (
                      <button
                        onClick={() => patchReport(r.id, "REVIEWING")}
                        className="text-xs px-3 py-1.5 rounded-lg bg-warning/10 text-warning hover:bg-warning/20 font-medium cursor-pointer"
                      >
                        Examiner
                      </button>
                    )}
                    <button
                      onClick={() => patchReport(r.id, "ACTIONED")}
                      className="text-xs px-3 py-1.5 rounded-lg bg-success/10 text-success hover:bg-success/20 font-medium cursor-pointer"
                    >
                      Traiter
                    </button>
                    <button
                      onClick={() => patchReport(r.id, "DISMISSED")}
                      className="text-xs px-3 py-1.5 rounded-lg bg-surface text-text hover:bg-border/30 font-medium cursor-pointer"
                    >
                      Rejeter
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {data && (
        <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} />
      )}
    </div>
  );
}
