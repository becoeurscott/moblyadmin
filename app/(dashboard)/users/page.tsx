"use client";

import { useAuth } from "@/lib/auth";
import { adminApi } from "@/lib/api";
import { useEffect, useState, useCallback } from "react";
import Pagination from "@/components/Pagination";

interface User {
  id: string;
  fullName: string;
  email?: string;
  phone: string;
  isOwner: boolean;
  isAdmin: boolean;
  isActive: boolean;
  verified: boolean;
  identityVerified: boolean;
  city?: string;
  avatarColor?: string;
  createdAt: string;
  lastSeenAt?: string;
}

interface UsersPage {
  total: number;
  page: number;
  pageSize: number;
  items: User[];
}

export default function UsersPage() {
  const { token } = useAuth();
  const [data, setData] = useState<UsersPage | null>(null);
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("all");
  const [active, setActive] = useState("all");
  const [selected, setSelected] = useState<User | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    adminApi<UsersPage>("/users", token, {
      params: { page, query, role, active, pageSize: 20 },
    })
      .then(setData)
      .catch(console.error);
  }, [token, page, query, role, active]);

  useEffect(() => { load(); }, [load]);

  async function patchUser(id: string, body: Record<string, boolean>) {
    if (!token) return;
    await adminApi(`/users/${id}`, token, { method: "PATCH", body });
    load();
    setSelected(null);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-dark mb-6">Utilisateurs</h1>

      <div className="flex flex-wrap gap-3 mb-6">
        <input
          type="text"
          placeholder="Rechercher (nom, email, tel)..."
          value={query}
          onChange={(e) => { setQuery(e.target.value); setPage(0); }}
          className="px-4 py-2 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 w-72"
        />
        <select
          value={role}
          onChange={(e) => { setRole(e.target.value); setPage(0); }}
          className="px-3 py-2 rounded-xl border border-border bg-white text-sm cursor-pointer"
        >
          <option value="all">Tous</option>
          <option value="owner">Propriétaires</option>
          <option value="visitor">Visiteurs</option>
          <option value="admin">Admins</option>
        </select>
        <select
          value={active}
          onChange={(e) => { setActive(e.target.value); setPage(0); }}
          className="px-3 py-2 rounded-xl border border-border bg-white text-sm cursor-pointer"
        >
          <option value="all">Tous statuts</option>
          <option value="active">Actifs</option>
          <option value="suspended">Suspendus</option>
        </select>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-border/50 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface/50">
              <th className="text-left px-5 py-3 font-medium text-text">Nom</th>
              <th className="text-left px-5 py-3 font-medium text-text">Contact</th>
              <th className="text-left px-5 py-3 font-medium text-text">Role</th>
              <th className="text-left px-5 py-3 font-medium text-text">Statut</th>
              <th className="text-left px-5 py-3 font-medium text-text">Inscrit le</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {data?.items.map((u) => (
              <tr key={u.id} className="border-b border-border/30 hover:bg-surface/30 transition">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                      style={{ background: u.avatarColor || "#3A4FF0" }}
                    >
                      {u.fullName?.slice(0, 2).toUpperCase()}
                    </div>
                    <span className="font-medium text-dark">{u.fullName}</span>
                  </div>
                </td>
                <td className="px-5 py-3 text-text">
                  <div>{u.email}</div>
                  <div className="text-xs">{u.phone}</div>
                </td>
                <td className="px-5 py-3">
                  <div className="flex gap-1">
                    {u.isAdmin && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent font-medium">Admin</span>
                    )}
                    {u.isOwner && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">Proprio</span>
                    )}
                    {!u.isOwner && !u.isAdmin && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-surface text-text">Visiteur</span>
                    )}
                  </div>
                </td>
                <td className="px-5 py-3">
                  {u.isActive ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-success/10 text-success font-medium">Actif</span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-danger/10 text-danger font-medium">Suspendu</span>
                  )}
                </td>
                <td className="px-5 py-3 text-text">
                  {new Date(u.createdAt).toLocaleDateString("fr-FR")}
                </td>
                <td className="px-5 py-3">
                  <button
                    onClick={() => setSelected(u)}
                    className="text-primary hover:text-primary/70 text-sm font-medium cursor-pointer"
                  >
                    Gérer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {data && (
          <div className="px-5 pb-4">
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} />
          </div>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-dark mb-4">{selected.fullName}</h2>
            <div className="space-y-2 text-sm text-text mb-6">
              <p>Email: {selected.email || "—"}</p>
              <p>Tél: {selected.phone}</p>
              <p>Ville: {selected.city || "—"}</p>
              <p>Vérifié: {selected.verified ? "Oui" : "Non"}</p>
              <p>Identité: {selected.identityVerified ? "Vérifiée" : "Non vérifiée"}</p>
              <p>Dernière activité: {selected.lastSeenAt ? new Date(selected.lastSeenAt).toLocaleString("fr-FR") : "—"}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {selected.isActive ? (
                <button
                  onClick={() => patchUser(selected.id, { isActive: false })}
                  className="px-4 py-2 text-sm rounded-xl bg-danger/10 text-danger hover:bg-danger/20 font-medium transition cursor-pointer"
                >
                  Suspendre
                </button>
              ) : (
                <button
                  onClick={() => patchUser(selected.id, { isActive: true })}
                  className="px-4 py-2 text-sm rounded-xl bg-success/10 text-success hover:bg-success/20 font-medium transition cursor-pointer"
                >
                  Réactiver
                </button>
              )}
              {!selected.verified && (
                <button
                  onClick={() => patchUser(selected.id, { verified: true })}
                  className="px-4 py-2 text-sm rounded-xl bg-primary/10 text-primary hover:bg-primary/20 font-medium transition cursor-pointer"
                >
                  Vérifier
                </button>
              )}
              {!selected.isAdmin && (
                <button
                  onClick={() => patchUser(selected.id, { isAdmin: true })}
                  className="px-4 py-2 text-sm rounded-xl bg-accent/10 text-accent hover:bg-accent/20 font-medium transition cursor-pointer"
                >
                  Promouvoir admin
                </button>
              )}
              <button
                onClick={() => setSelected(null)}
                className="px-4 py-2 text-sm rounded-xl border border-border hover:bg-surface font-medium transition cursor-pointer ml-auto"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
