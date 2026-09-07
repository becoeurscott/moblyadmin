"use client";

import { useCallback, useEffect, useState } from "react";
import { adminApi, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import Pagination from "@/components/Pagination";
import {
  Badge, Btn, Card, ConfirmDialog, JsonDiff, Notice, SearchInput,
  Spinner, Tabs, fmtDate,
} from "@/components/ui";

/**
 * Who may administer Mobly, from where, and what they have done.
 *
 * The audit tab is the point of the whole remote-control system: every switch
 * an operator flips is recorded here with a before/after diff, so "who turned
 * chat off at 3am" has an answer.
 */

const ROLES = ["READ_ONLY", "SUPPORT", "MODERATOR", "ADMIN", "SUPER_ADMIN"] as const;

const ROLE_HELP: Record<string, string> = {
  READ_ONLY: "Consultation uniquement",
  SUPPORT: "Notifier, réinitialiser un mot de passe, gérer les sessions",
  MODERATOR: "Restrictions, modération des annonces, messages et avis",
  ADMIN: "Configuration, limites, contenu, exports, suppression",
  SUPER_ADMIN: "Rôles, sécurité, déconnexion globale",
};

interface Admin {
  id: string; fullName: string; email?: string | null; phone: string;
  adminRole: string | null; isActive: boolean; lastSeenAt?: string | null;
}

interface AuditEntry {
  id: string; action: string; targetType?: string | null; targetId?: string | null;
  before?: unknown; after?: unknown; ip?: string | null; createdAt: string;
  actor?: { id: string; fullName: string; adminRole?: string | null };
}

interface Session {
  id: string; familyId: string; ip?: string | null; userAgent?: string | null;
  createdAt: string; user: { id: string; fullName: string; adminRole?: string | null };
}

export default function SecurityPage() {
  const { token, user } = useAuth();
  const isSuper = user?.adminRole === "SUPER_ADMIN";

  const [tab, setTab] = useState("audit");
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  type AuditPage = { items: AuditEntry[]; total: number; page: number; pageSize: number };
  const [audit, setAudit] = useState<AuditPage | null>(null);
  const [page, setPage] = useState(0);
  const [actionFilter, setActionFilter] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirmLogoutAll, setConfirmLogoutAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(() => {
    if (!token) return;
    adminApi<{ items: Admin[] }>("/security/admins", token).then((d) => setAdmins(d.items)).catch(() => {});
    adminApi<{ items: Session[] }>("/security/sessions", token).then((d) => setSessions(d.items)).catch(() => {});
    adminApi<AuditPage>("/security/audit", token, {
      params: { page, pageSize: 25, action: actionFilter || undefined },
    })
      .then(setAudit)
      .catch((e) => setError(String(e.message)));
  }, [token, page, actionFilter]);

  useEffect(() => { load(); }, [load]);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true); setError(""); setNotice("");
    try { await fn(); setNotice(ok); load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-bold text-dark mb-1">Sécurité</h1>
      <p className="text-sm text-text mb-6">
        Rôles, sessions administrateur et journal complet des actions.
      </p>

      {(notice || error) && (
        <div className="mb-4 space-y-2">
          {notice && <Notice kind="success">{notice}</Notice>}
          {error && <Notice kind="danger">{error}</Notice>}
        </div>
      )}

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "audit", label: "Journal d'audit", count: audit?.total },
          { id: "roles", label: "Administrateurs", count: admins.length },
          { id: "sessions", label: "Sessions", count: sessions.length },
        ]}
      />

      <div className="mt-5">
        {tab === "audit" && (
          <>
            <div className="flex items-center gap-3 mb-3">
              <SearchInput
                value={actionFilter}
                onChange={(v) => { setActionFilter(v); setPage(0); }}
                placeholder="Filtrer par action (ex. user.restrict)"
                className="w-80"
              />
              <a
                href="/api/proxy/admin/system/export/audit.csv"
                className="px-4 py-2 text-sm rounded-xl font-medium bg-surface text-text hover:opacity-80 transition ml-auto"
              >
                Exporter CSV
              </a>
            </div>
            <Card>
              {!audit ? (
                <div className="flex justify-center py-16"><Spinner /></div>
              ) : audit.items.length === 0 ? (
                <p className="text-sm text-text p-6">Aucune action enregistrée.</p>
              ) : (
                <div className="divide-y divide-border/30">
                  {audit.items.map((a) => (
                    <div key={a.id} className="px-5 py-3">
                      <button
                        onClick={() => setExpanded(expanded === a.id ? null : a.id)}
                        className="w-full flex items-center gap-3 text-left cursor-pointer"
                      >
                        <Badge variant="primary">{a.action}</Badge>
                        <span className="text-sm text-dark">{a.actor?.fullName ?? "—"}</span>
                        {a.actor?.adminRole && <Badge variant="accent">{a.actor.adminRole}</Badge>}
                        {a.targetType && (
                          <span className="text-xs text-text truncate">
                            {a.targetType}:{a.targetId?.slice(0, 12)}
                          </span>
                        )}
                        <span className="text-xs text-text ml-auto whitespace-nowrap">
                          {a.ip} · {fmtDate(a.createdAt)}
                        </span>
                      </button>
                      {expanded === a.id && Boolean(a.before || a.after) && (
                        <div className="mt-3">
                          <JsonDiff before={a.before} after={a.after} />
                        </div>
                      )}
                    </div>
                  ))}
                  <div className="px-5 pb-4 pt-2">
                    <Pagination
                      page={audit.page}
                      pageSize={audit.pageSize}
                      total={audit.total}
                      onPageChange={setPage}
                    />
                  </div>
                </div>
              )}
            </Card>
          </>
        )}

        {tab === "roles" && (
          <Card className="p-5">
            {!isSuper && (
              <Notice kind="danger">
                Seul un super administrateur peut modifier les rôles.
              </Notice>
            )}
            <div className="mt-3 divide-y divide-border/40">
              {admins.map((a) => (
                <div key={a.id} className="flex items-center gap-4 py-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-dark">{a.fullName}</p>
                    <p className="text-xs text-text">{a.email || a.phone}</p>
                  </div>
                  {!a.isActive && <Badge variant="danger">Suspendu</Badge>}
                  <select
                    value={a.adminRole ?? ""}
                    disabled={!isSuper || busy || a.id === user?.id}
                    onChange={(e) =>
                      run(
                        () =>
                          adminApi(`/security/admins/${a.id}`, token!, {
                            method: "PATCH",
                            body: { adminRole: e.target.value || null },
                          }),
                        "Rôle mis à jour — les sessions de ce compte ont été fermées.",
                      )
                    }
                    className="px-3 py-2 rounded-xl border border-border bg-white text-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <option value="">Aucun rôle</option>
                    {ROLES.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className="mt-5 pt-4 border-t border-border">
              <h4 className="text-sm font-semibold text-dark mb-2">Niveaux</h4>
              <dl className="space-y-1 text-xs">
                {ROLES.map((r) => (
                  <div key={r} className="flex gap-2">
                    <dt className="w-28 shrink-0 font-mono text-text">{r}</dt>
                    <dd className="text-dark">{ROLE_HELP[r]}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </Card>
        )}

        {tab === "sessions" && (
          <Card className="p-5">
            {sessions.length === 0 ? (
              <p className="text-sm text-text">Aucune session administrateur active.</p>
            ) : (
              <div className="divide-y divide-border/40">
                {sessions.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 py-3 text-sm">
                    <div className="flex-1">
                      <p className="text-dark font-medium">{s.user.fullName}</p>
                      <p className="text-xs text-text truncate max-w-xl">
                        {s.ip || "IP inconnue"} · {s.userAgent || "—"}
                      </p>
                    </div>
                    <span className="text-xs text-text">{fmtDate(s.createdAt)}</span>
                    {isSuper && (
                      <Btn
                        size="sm"
                        variant="danger"
                        disabled={busy}
                        onClick={() =>
                          run(
                            () => adminApi(`/security/sessions/${s.familyId}`, token!, { method: "DELETE" }),
                            "Session révoquée.",
                          )
                        }
                      >
                        Révoquer
                      </Btn>
                    )}
                  </div>
                ))}
              </div>
            )}

            {isSuper && (
              <div className="mt-6 pt-5 border-t border-danger/20">
                <h4 className="text-sm font-semibold text-danger mb-1">Zone critique</h4>
                <p className="text-xs text-text mb-3">
                  Déconnecte immédiatement tous les utilisateurs de l&apos;application et
                  tous les administrateurs. À utiliser en cas de fuite de jetons.
                </p>
                <Btn variant="danger" onClick={() => setConfirmLogoutAll(true)}>
                  Déconnexion globale
                </Btn>
              </div>
            )}
          </Card>
        )}
      </div>

      <ConfirmDialog
        open={confirmLogoutAll}
        onClose={() => setConfirmLogoutAll(false)}
        onConfirm={() => {
          run(
            () =>
              adminApi("/security/force-logout-all", token!, {
                method: "POST",
                confirm: "DECONNECTER TOUT LE MONDE",
              }),
            "Tout le monde a été déconnecté.",
          );
          setConfirmLogoutAll(false);
        }}
        title="Déconnexion globale"
        phrase="DECONNECTER TOUT LE MONDE"
        busy={busy}
        confirmLabel="Déconnecter tout le monde"
        body={
          <p>
            Chaque session, sur chaque appareil, sera invalidée. Tous les utilisateurs
            devront se reconnecter, vous compris.
          </p>
        }
      />
    </div>
  );
}
