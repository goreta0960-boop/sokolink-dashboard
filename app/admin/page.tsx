"use client";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type Stats = {
  totalUsers: number; buyers: number; suppliers: number;
  activeListings: number; pendingOrders: number;
  confirmedOrders: number; deliveredOrders: number; disputedOrders: number;
  totalRevenue: number; totalCommission: number;
  avgTrustBuyer: number; avgTrustSupplier: number;
};

export default function AdminDashboard() {
  const [stats, setStats]       = useState<Stats | null>(null);
  const [loading, setLoading]   = useState(true);
  const [topSuppliers, setTop]  = useState<{ phone: string; trust_score: number; total_deals: number }[]>([]);
  const [disputes, setDisputes] = useState<{ id: string; items: Record<string, unknown>; created_at: string }[]>([]);

  useEffect(() => { loadStats(); }, []);

  async function loadStats() {
    const [profilesRes, inventoryRes, ordersRes, topSupRes, disputeRes] = await Promise.all([
      supabase.from("profiles").select("role, trust_score"),
      supabase.from("inventory").select("status"),
      supabase.from("orders").select("status, total_price, commission_tzs"),
      supabase.from("profiles").select("phone, trust_score, total_deals").eq("role", "supplier")
        .order("total_deals", { ascending: false }).limit(5),
      supabase.from("orders").select("id, items, created_at").eq("status", "disputed")
        .order("created_at", { ascending: false }).limit(10),
    ]);

    const profiles  = profilesRes.data  ?? [];
    const inventory = inventoryRes.data ?? [];
    const orders    = ordersRes.data    ?? [];

    const buyers    = profiles.filter((p) => p.role === "buyer");
    const suppliers = profiles.filter((p) => p.role === "supplier");

    setStats({
      totalUsers:      profiles.length,
      buyers:          buyers.length,
      suppliers:       suppliers.length,
      activeListings:  inventory.filter((i) => i.status === "available").length,
      pendingOrders:   orders.filter((o) => o.status === "pending").length,
      confirmedOrders: orders.filter((o) => o.status === "confirmed").length,
      deliveredOrders: orders.filter((o) => o.status === "delivered").length,
      disputedOrders:  orders.filter((o) => o.status === "disputed").length,
      totalRevenue:    orders.filter((o) => o.status === "delivered").reduce((s, o) => s + Number(o.total_price), 0),
      totalCommission: orders.filter((o) => o.status === "delivered").reduce((s, o) => s + Number(o.commission_tzs), 0),
      avgTrustBuyer:    buyers.length    ? buyers.reduce((s, p)    => s + Number(p.trust_score), 0) / buyers.length    : 0,
      avgTrustSupplier: suppliers.length ? suppliers.reduce((s, p) => s + Number(p.trust_score), 0) / suppliers.length : 0,
    });

    setTop(topSupRes.data ?? []);
    setDisputes((disputeRes.data ?? []).map((d) => ({ ...d, items: d.items as Record<string, unknown> })));
    setLoading(false);
  }

  if (loading) return <div style={s.center}>Loading admin stats...</div>;
  if (!stats) return null;

  const statCards = [
    { label: "Total Users",       value: stats.totalUsers,                               sub: `${stats.buyers}B / ${stats.suppliers}S`, color: "#7c3aed" },
    { label: "Active Listings",   value: stats.activeListings,                           sub: "available now",                          color: "#0891b2" },
    { label: "Pending Orders",    value: stats.pendingOrders,                            sub: "need attention",                         color: "#f59e0b" },
    { label: "Delivered Orders",  value: stats.deliveredOrders,                          sub: "completed",                              color: "#16a34a" },
    { label: "Disputed Orders",   value: stats.disputedOrders,                           sub: "needs resolution",                       color: "#dc2626" },
    { label: "Total Revenue",     value: `${stats.totalRevenue.toLocaleString()} TZS`,   sub: "from delivered orders",                  color: "#16a34a" },
    { label: "Total Commission",  value: `${stats.totalCommission.toLocaleString()} TZS`,sub: "5% platform fee",                        color: "#2563eb" },
    { label: "Avg Trust Score",   value: `${stats.avgTrustSupplier.toFixed(1)}/10`,      sub: "supplier average",                       color: "#d97706" },
  ];

  return (
    <div style={s.page}>
      <header style={s.header}>
        <h1 style={s.logo}>🌾 SokoLink Admin</h1>
        <button style={s.refresh} onClick={loadStats}>↻ Refresh</button>
      </header>

      <div style={s.grid4}>
        {statCards.map((c) => (
          <div key={c.label} style={s.card}>
            <div style={{ ...s.value, color: c.color }}>{String(c.value)}</div>
            <div style={s.label}>{c.label}</div>
            <div style={s.sub}>{c.sub}</div>
          </div>
        ))}
      </div>

      <div style={s.grid2}>
        <section style={s.section}>
          <h2 style={s.title}>Top Suppliers</h2>
          <table style={s.table}>
            <thead><tr>{["Phone","Trust","Deals"].map((h) => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
            <tbody>
              {topSuppliers.map((sup) => (
                <tr key={sup.phone}>
                  <td style={s.td}>{sup.phone}</td>
                  <td style={s.td}>{Number(sup.trust_score).toFixed(1)}/10 ⭐</td>
                  <td style={s.td}>{sup.total_deals}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section style={s.section}>
          <h2 style={s.title}>Recent Disputes ⚠️</h2>
          {disputes.length === 0
            ? <p style={{ color: "#16a34a", fontWeight: 600 }}>No disputes 🎉</p>
            : (
              <table style={s.table}>
                <thead><tr>{["Product","Date"].map((h) => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {disputes.map((d) => (
                    <tr key={d.id}>
                      <td style={s.td}>{String(d.items?.product ?? "?")}</td>
                      <td style={s.td}>{new Date(d.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </section>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page:    { maxWidth: 1200, margin: "0 auto", padding: 24 },
  center:  { display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontSize: 18 },
  header:  { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 },
  logo:    { fontSize: 24, fontWeight: 700, margin: 0 },
  refresh: { padding: "8px 16px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 },
  grid4:   { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 24 },
  grid2:   { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 },
  card:    { background: "#fff", borderRadius: 10, padding: "20px 24px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" },
  value:   { fontSize: 22, fontWeight: 700, marginBottom: 4 },
  label:   { fontSize: 13, fontWeight: 600, color: "#333", marginBottom: 2 },
  sub:     { fontSize: 12, color: "#999" },
  section: { background: "#fff", borderRadius: 10, padding: 20, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" },
  title:   { fontSize: 16, fontWeight: 600, margin: "0 0 16px" },
  table:   { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th:      { textAlign: "left", padding: "8px 12px", background: "#f9fafb", fontWeight: 600, color: "#555", borderBottom: "1px solid #e5e7eb" },
  td:      { padding: "10px 12px", borderBottom: "1px solid #f3f4f6" },
};
