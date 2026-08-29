"use client";

import { useAuth } from "@/lib/auth";
import { adminApi } from "@/lib/api";
import { useState, type FormEvent } from "react";

export default function NotificationsPage() {
  const { token } = useAuth();
  const [type, setType] = useState("ANNOUNCEMENT");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function handleBroadcast(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSending(true);
    setError("");
    setResult(null);
    try {
      const res = await adminApi<{ sent: number }>(
        "/notifications/broadcast",
        token,
        { method: "POST", body: { type, title, body } },
      );
      setResult(`Notification envoyée à ${res.sent} utilisateurs.`);
      setTitle("");
      setBody("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-dark mb-6">Notifications</h1>

      <div className="bg-white rounded-2xl shadow-sm border border-border/50 p-6 max-w-lg">
        <h2 className="text-lg font-semibold text-dark mb-4">
          Diffusion générale
        </h2>
        <p className="text-sm text-text mb-6">
          Envoyer une notification push à tous les utilisateurs actifs.
        </p>

        <form onSubmit={handleBroadcast} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-dark mb-1.5">
              Type
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-border bg-surface text-sm cursor-pointer"
            >
              <option value="ANNOUNCEMENT">Annonce</option>
              <option value="PROMO">Promo</option>
              <option value="ALERT">Alerte</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-dark mb-1.5">
              Titre
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Nouvelle fonctionnalité disponible"
              maxLength={120}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-dark mb-1.5">
              Message
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              rows={3}
              placeholder="Détails de la notification..."
              maxLength={500}
              required
            />
          </div>

          {error && (
            <div className="text-sm text-danger bg-danger/10 rounded-xl px-4 py-2.5">
              {error}
            </div>
          )}

          {result && (
            <div className="text-sm text-success bg-success/10 rounded-xl px-4 py-2.5">
              {result}
            </div>
          )}

          <button
            type="submit"
            disabled={sending}
            className="px-6 py-2.5 rounded-xl bg-primary text-white font-semibold hover:bg-primary/90 disabled:opacity-50 transition cursor-pointer"
          >
            {sending ? "Envoi en cours..." : "Envoyer à tous"}
          </button>
        </form>
      </div>
    </div>
  );
}
