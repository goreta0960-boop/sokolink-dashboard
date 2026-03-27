"use client";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type Subscription = {
  id: string;
  tier: string;
  starts_at: string;
  ends_at: string;
  active: boolean;
  profile_id: string;
  phone?: string;
};

type PeriodStats = { label: string; orders: number; gmv: number; commission: number };

const TIER_COLOR: Record<string, string> = {
  basic: "#6b7280",
  pro: "#7c3aed",
  enterprise: "#b45309",
};

export default function MonetizationPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [periodStats, setPeriodStats]     = useState<PeriodStats[]>([]);
  const [totalCommission, setTotalCommission] = useState(0);
  const [totalGmv, setTotalGmv]           = useState(0);
  const [loading, setLoading]             = useState(true);
  const [activeTab, setActiveTab]         = useState<"overview" | "subscriptions">("overview");

  useEffect(() => {
    const raw = localStorage.getItem("sokolink_profile");
    if (!raw) { window.location.href = "/"; return; }
    const p = JSON.parse(raw);
    if (p.role !== "admin") { window.location.href = "/dashboard"; return; }
    loadData();
  }, []);

  async function loadData() {
    const now = new Date();
    const periods: { label: string; start: Date }[] = [
      { label: "Today",      start: new Date(now.getFullYear(), now.getMonth(), now.getDate()) },
      { label: "This Week",  start: new Date(now.getTime() - 7  * 86400000) },
      { label: "This Month", start: new Date(now.getFullYear(), now.getMonth(), 1) },
      { label: "All Time",   start: new Date(0) },
    ];

    const [subsRes, ...orderRess] = await Promise.all([
      supabase
        .from("subscriptions")
        .select("id, tier, starts_at, ends_at, active, profile_id")
        .order("starts_at", { ascending: false })
        .limit(50),
      ...periods.map((p) =>
        supabase
          .from("orders")
          .select("status, total_price, commission_tzs")
          .eq("status", "delivered")
          .gte("created_at", p.start.toISOString()),
      ),
    ]);

    // Enrich subscriptions with phone numbers
    const subs = subsRes.data ?? [];
    const profileIds = [...new Set(subs.map((s) => s.profile_id))];
    let phonesMap: Record<string, string> = {};
    if (profileIds.length) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, phone")
        .in("id", profileIds);
      phonesMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.phone]));
    }

    const enriched: Subscription[] = subs.map((s) => ({ ...s, phone: phonesMap[s.profile_id] }));
    setSubscriptions(enriched);

    const stats: PeriodStats[] = periods.map((p, i) => {
      const orders = orderRess[i].data ?? [];
      const gmv = orders.reduce((s, o) => s + Number(o.total_price), 0);
      const commission = orders.reduce((s, o) => s + Number(o.commission_tzs), 0);
      return { label: p.label, orders: orders.length, gmv, commission };
    });
    setPeriodStats(stats);

    const allTime = stats.find((s) => s.label === "All Time");
    setTotalGmv(allTime?.gmv ?? 0);
    setTotalCommission(allTime?.commission ?? 0);

    setLoading(false);
  }

  if (loading) return <div style={styles.loading}>Loading...</div>;

  const activeSubs = subscriptions.filter((s) => s.active && new Date(s.ends_at) > new Date());
  const proCount   = activeSubs.filter((s) => s.tier === "pro").length;
  const entCount   = activeSubs.filter((s) => s.tier === "enterprise").length;
  const subRevenue = activeSubs.reduce((s, sub) => s + (sub.tier === "enterprise" ? 15000 : sub.tier === "pro" ? 5000 : 0), 0);

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.logo}>💰 Monetization</h1>
        <div style={styles.navLinks}>
          <a href="/admin" style={styles.navLink}>Admin</a>
          <a href="/dashboard" style={styles.navLink}>Dashboard</a>
          <button style={styles.logout} onClick={() => { localStorage.clear(); window.location.href = "/"; }}>Logout</button>
        </div>
      </header>

      {/* Top KPIs */}
      <div style={styles.kpiRow}>
        {[
          { label: "Total GMV",          value: `${totalGmv.toLocaleString()} TZS`,        color: "#16a34a" },
          { label: "Total Commission",   value: `${totalCommission.toLocaleString()} TZS`,  color: "#2563eb" },
          { label: "Active Subscriptions", value: activeSubs.length,                        color: "#7c3aed" },
          { label: "Sub Revenue (est.)", value: `${subRevenue.toLocaleString()} TZS`,       color: "#b45309" },
          { label: "Pro / Enterprise",   value: `${proCount} / ${entCount}`,                color: "#d97706" },
        ].map((k) => (
          <div key={k.label} style={styles.kpiCard}>
            <div style={{ ...styles.kpiValue, color: k.color }}>{String(k.value)}</div>
            <div style={styles.kpiLabel}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Period breakdown */}
      <section style={{ ...styles.section, marginBottom: 20 }}>
        <h2 style={styles.sectionTitle}>Commission by Period</h2>
        <table style={styles.table}>
          <thead>
            <tr>{["Period", "Delivered Orders", "GMV (TZS)", "Commission (TZS)"].map((h) => (
              <th key={h} style={styles.th}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {periodStats.map((p) => (
              <tr key={p.label}>
                <td style={styles.td}><strong>{p.label}</strong></td>
                <td style={styles.td}>{p.orders}</td>
                <td style={styles.td}>{p.gmv.toLocaleString()}</td>
                <td style={{ ...styles.td, color: "#16a34a", fontWeight: 600 }}>{p.commission.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Tabs */}
      <div style={styles.tabs}>
        {(["overview", "subscriptions"] as const).map((tab) => (
          <button
            key={tab}
            style={{ ...styles.tab, ...(activeTab === tab ? styles.tabActive : {}) }}
            onClick={() => setActiveTab(tab)}
          >
            {tab === "overview" ? "Overview" : "Subscriptions"}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Subscription Mix</h2>
          <div style={styles.mixRow}>
            {[
              { tier: "basic",      count: subscriptions.filter((s) => s.tier === "basic").length,      price: "Free" },
              { tier: "pro",        count: subscriptions.filter((s) => s.tier === "pro").length,        price: "5,000 TZS/mo" },
              { tier: "enterprise", count: subscriptions.filter((s) => s.tier === "enterprise").length, price: "15,000 TZS/3mo" },
            ].map((t) => (
              <div key={t.tier} style={styles.mixCard}>
                <div style={{ ...styles.mixCount, color: TIER_COLOR[t.tier] }}>{t.count}</div>
                <div style={styles.mixTier}>{t.tier.charAt(0).toUpperCase() + t.tier.slice(1)}</div>
                <div style={styles.mixPrice}>{t.price}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {activeTab === "subscriptions" && (
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>All Subscriptions ({subscriptions.length})</h2>
          <table style={styles.table}>
            <thead>
              <tr>{["Phone", "Tier", "Started", "Expires", "Status"].map((h) => (
                <th key={h} style={styles.th}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {subscriptions.map((s) => {
                const expired = new Date(s.ends_at) < new Date();
                const status  = !s.active ? "Cancelled" : expired ? "Expired" : "Active";
                const statusColor = status === "Active" ? "#16a34a" : "#dc2626";
                return (
                  <tr key={s.id} style={expired || !s.active ? { opacity: 0.5 } : {}}>
                    <td style={styles.td}>{s.phone ?? s.profile_id.slice(0, 8)}</td>
                    <td style={styles.td}>
                      <span style={{ ...styles.badge, background: `${TIER_COLOR[s.tier]}22`, color: TIER_COLOR[s.tier] }}>
                        {s.tier}
                      </span>
                    </td>
                    <td style={styles.td}>{new Date(s.starts_at).toLocaleDateString()}</td>
                    <td style={styles.td}>{new Date(s.ends_at).toLocaleDateString()}</td>
                    <td style={styles.td}>
                      <span style={{ color: statusColor, fontWeight: 600, fontSize: 12 }}>{status}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page:         { minHeight: "100vh", padding: 24, maxWidth: 1200, margin: "0 auto" },
  loading:      { display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontSize: 18 },
  header:       { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 },
  logo:         { fontSize: 22, fontWeight: 700, margin: 0 },
  navLinks:     { display: "flex", alignItems: "center", gap: 12 },
  navLink:      { padding: "6px 14px", background: "#f3f4f6", color: "#374151", borderRadius: 6, fontWeight: 600, fontSize: 13, textDecoration: "none" },
  logout:       { padding: "6px 14px", background: "#fee2e2", color: "#dc2626", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: 13 },
  kpiRow:       { display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 16, marginBottom: 24 },
  kpiCard:      { background: "#fff", borderRadius: 10, padding: "18px 20px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" },
  kpiValue:     { fontSize: 20, fontWeight: 700, marginBottom: 4 },
  kpiLabel:     { fontSize: 12, color: "#666" },
  section:      { background: "#fff", borderRadius: 10, padding: 20, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" },
  sectionTitle: { fontSize: 15, fontWeight: 600, margin: "0 0 16px" },
  table:        { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th:           { textAlign: "left", padding: "8px 12px", background: "#f9fafb", fontWeight: 600, color: "#555", borderBottom: "1px solid #e5e7eb" },
  td:           { padding: "10px 12px", borderBottom: "1px solid #f3f4f6", verticalAlign: "middle" },
  badge:        { padding: "3px 10px", borderRadius: 20, fontWeight: 600, fontSize: 12 },
  tabs:         { display: "flex", gap: 8, marginBottom: 16 },
  tab:          { padding: "8px 20px", borderRadius: 6, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 500, color: "#555" },
  tabActive:    { background: "#16a34a", color: "#fff", border: "1px solid #16a34a" },
  mixRow:       { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 },
  mixCard:      { background: "#f9fafb", borderRadius: 8, padding: "24px", textAlign: "center" },
  mixCount:     { fontSize: 36, fontWeight: 700, marginBottom: 4 },
  mixTier:      { fontSize: 14, fontWeight: 600, color: "#374151", marginBottom: 2 },
  mixPrice:     { fontSize: 12, color: "#666" },
};
