"use client";

import { useAuth } from "@/lib/auth";
import { adminApi } from "@/lib/api";
import { useEffect, useState } from "react";
import StatCard from "@/components/StatCard";

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
}

export default function OverviewPage() {
  const { token } = useAuth();
  const [data, setData] = useState<Overview | null>(null);

  useEffect(() => {
    if (!token) return;
    adminApi<Overview>("/overview", token).then(setData).catch(console.error);
  }, [token]);

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-dark mb-6">Vue d&apos;ensemble</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Utilisateurs"
          value={data.users}
          delta={`+${data.newUsers30d} (30j)`}
          accent="primary"
        />
        <StatCard label="Propriétaires" value={data.owners} accent="accent" />
        <StatCard
          label="Annonces"
          value={data.listings}
          delta={`+${data.newListings30d} (30j)`}
          accent="primary"
        />
        <StatCard
          label="Sessions actives (24h)"
          value={data.activeSessions24h}
          accent="success"
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="En attente"
          value={data.pendingListings}
          accent="warning"
        />
        <StatCard label="Boostées" value={data.boostedListings} accent="accent" />
        <StatCard
          label="Signalements ouverts"
          value={data.openReports}
          accent="danger"
        />
        <StatCard
          label="Messages (24h)"
          value={data.messagesLast24h}
          accent="primary"
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          label="Visites en attente"
          value={data.pendingVisits}
          accent="warning"
        />
        <StatCard
          label="Visites confirmées"
          value={data.confirmedVisits}
          accent="success"
        />
        <StatCard
          label="Conversations"
          value={data.threads}
          accent="primary"
        />
      </div>
    </div>
  );
}
