"use client";

import { useAuth } from "@/lib/auth";
import { adminApi } from "@/lib/api";
import { useEffect, useState, useCallback } from "react";
import Pagination from "@/components/Pagination";

interface ThreadParticipant {
  id: string;
  fullName: string;
  avatarColor?: string;
}

interface Thread {
  id: string;
  listing: { id: string; title: string } | null;
  participants: ThreadParticipant[];
  messageCount: number;
  lastMessage: { text: string; kind: string; createdAt: string } | null;
  updatedAt: string;
}

interface ThreadsPage {
  total: number;
  page: number;
  pageSize: number;
  items: Thread[];
}

interface Message {
  id: string;
  text: string;
  kind: string;
  createdAt: string;
  sender: { id: string; fullName: string; avatarColor?: string };
}

export default function ThreadsPage() {
  const { token } = useAuth();
  const [data, setData] = useState<ThreadsPage | null>(null);
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  const load = useCallback(() => {
    if (!token) return;
    adminApi<ThreadsPage>("/threads", token, {
      params: { page, query, pageSize: 30 },
    })
      .then(setData)
      .catch(console.error);
  }, [token, page, query]);

  useEffect(() => { load(); }, [load]);

  async function openThread(id: string) {
    if (!token) return;
    setSelected(id);
    const res = await adminApi<{ items: Message[] }>(`/threads/${id}/messages`, token);
    setMessages(res.items);
  }

  function timeAgo(d: string) {
    const diff = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}j`;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-dark mb-6">Conversations</h1>

      <div className="mb-6">
        <input
          type="text"
          placeholder="Rechercher (annonce, participant)..."
          value={query}
          onChange={(e) => { setQuery(e.target.value); setPage(0); }}
          className="px-4 py-2 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 w-72"
        />
      </div>

      <div className="flex gap-6">
        <div className="flex-1">
          <div className="bg-white rounded-2xl shadow-sm border border-border/50 divide-y divide-border/30">
            {data?.items.map((t) => (
              <button
                key={t.id}
                onClick={() => openThread(t.id)}
                className={`w-full text-left px-5 py-4 hover:bg-surface/50 transition cursor-pointer ${
                  selected === t.id ? "bg-primary-light" : ""
                }`}
              >
                <div className="flex justify-between items-start mb-1">
                  <p className="font-medium text-dark text-sm line-clamp-1">
                    {t.listing?.title || "Conversation"}
                  </p>
                  <span className="text-xs text-text shrink-0 ml-2">
                    {timeAgo(t.updatedAt)}
                  </span>
                </div>
                <div className="flex items-center gap-1 mb-1">
                  {t.participants.map((p) => (
                    <span key={p.id} className="text-xs text-text">
                      {p.fullName}
                    </span>
                  ))}
                </div>
                {t.lastMessage && (
                  <p className="text-xs text-text line-clamp-1">
                    {t.lastMessage.text}
                  </p>
                )}
                <span className="text-xs text-text/50 mt-1 block">
                  {t.messageCount} messages
                </span>
              </button>
            ))}
          </div>
          {data && (
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} />
          )}
        </div>

        {selected && (
          <div className="w-96 bg-white rounded-2xl shadow-sm border border-border/50 flex flex-col max-h-[calc(100vh-12rem)]">
            <div className="px-5 py-4 border-b border-border flex justify-between items-center">
              <h3 className="font-semibold text-dark text-sm">Messages</h3>
              <button
                onClick={() => setSelected(null)}
                className="text-text hover:text-dark text-sm cursor-pointer"
              >
                Fermer
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((m) => (
                <div key={m.id}>
                  <div className="flex items-center gap-2 mb-0.5">
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0"
                      style={{ background: m.sender.avatarColor || "#3A4FF0" }}
                    >
                      {m.sender.fullName?.slice(0, 1).toUpperCase()}
                    </div>
                    <span className="text-xs font-medium text-dark">
                      {m.sender.fullName}
                    </span>
                    <span className="text-[10px] text-text">
                      {new Date(m.createdAt).toLocaleString("fr-FR", {
                        hour: "2-digit",
                        minute: "2-digit",
                        day: "2-digit",
                        month: "short",
                      })}
                    </span>
                  </div>
                  <p className="text-sm text-dark ml-7">{m.text}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
