"use client";

import { useAuth } from "@/lib/auth";
import { adminApi } from "@/lib/api";
import { useEffect, useState } from "react";
import StatCard from "@/components/StatCard";

interface Bucket {
  day: string;
  sessions: number;
  events: number;
}

interface TopEvent {
  name: string;
  count: number;
}

interface AnalyticsSummary {
  dailyBuckets: Bucket[];
  dau: number;
  mau: number;
  topEvents: TopEvent[];
}

export default function AnalyticsPage() {
  const { token } = useAuth();
  const [data, setData] = useState<AnalyticsSummary | null>(null);

  useEffect(() => {
    if (!token) return;
    adminApi<AnalyticsSummary>("/analytics/summary", token)
      .then(setData)
      .catch(console.error);
  }, [token]);

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const maxEvents = Math.max(...data.dailyBuckets.map((b) => b.events), 1);
  const maxSessions = Math.max(...data.dailyBuckets.map((b) => b.sessions), 1);

  return (
    <div>
      <h1 className="text-2xl font-bold text-dark mb-6">Analytique</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="DAU" value={data.dau} accent="primary" />
        <StatCard label="MAU" value={data.mau} accent="accent" />
        <StatCard
          label="Sessions (30j)"
          value={data.dailyBuckets.reduce((s, b) => s + b.sessions, 0)}
          accent="success"
        />
        <StatCard
          label="Événements (30j)"
          value={data.dailyBuckets.reduce((s, b) => s + b.events, 0)}
          accent="warning"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-2xl shadow-sm border border-border/50 p-5">
          <h2 className="text-sm font-semibold text-dark mb-4">Sessions quotidiennes (30j)</h2>
          <div className="flex items-end gap-px h-40">
            {data.dailyBuckets.map((b) => (
              <div
                key={b.day}
                className="flex-1 bg-primary/70 rounded-t-sm hover:bg-primary transition-colors min-w-0"
                style={{ height: `${(b.sessions / maxSessions) * 100}%` }}
                title={`${b.day}: ${b.sessions} sessions`}
              />
            ))}
          </div>
          <div className="flex justify-between mt-2 text-xs text-text">
            <span>{data.dailyBuckets[0]?.day.slice(5)}</span>
            <span>{data.dailyBuckets[data.dailyBuckets.length - 1]?.day.slice(5)}</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-border/50 p-5">
          <h2 className="text-sm font-semibold text-dark mb-4">Événements quotidiens (30j)</h2>
          <div className="flex items-end gap-px h-40">
            {data.dailyBuckets.map((b) => (
              <div
                key={b.day}
                className="flex-1 bg-accent/70 rounded-t-sm hover:bg-accent transition-colors min-w-0"
                style={{ height: `${(b.events / maxEvents) * 100}%` }}
                title={`${b.day}: ${b.events} events`}
              />
            ))}
          </div>
          <div className="flex justify-between mt-2 text-xs text-text">
            <span>{data.dailyBuckets[0]?.day.slice(5)}</span>
            <span>{data.dailyBuckets[data.dailyBuckets.length - 1]?.day.slice(5)}</span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-border/50 p-5">
        <h2 className="text-sm font-semibold text-dark mb-4">Top événements (30j)</h2>
        <div className="space-y-3">
          {data.topEvents.map((ev, i) => {
            const pct = data.topEvents[0] ? (ev.count / data.topEvents[0].count) * 100 : 0;
            return (
              <div key={ev.name} className="flex items-center gap-3">
                <span className="w-5 text-xs text-text text-right">{i + 1}</span>
                <div className="flex-1">
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-medium text-dark">{ev.name}</span>
                    <span className="text-sm text-text">{ev.count}</span>
                  </div>
                  <div className="h-1.5 bg-surface rounded-full">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
