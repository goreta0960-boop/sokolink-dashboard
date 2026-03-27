"use client";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type Profile = { id: string; phone: string; role: string };
type Order   = { id: string; status: string; total_price: number; commission_tzs: number; created_at: string; items: Record<string, unknown> };
type Listing = { id: string; product_name: string; qty: number; unit: string; price_tzs: number; status: string; verification_status: string; is_featured: boolean };
type Rating  = { score: number; created_at: string };

export default function SupplierDashboard() {
  const [profile, setProfile]   = useState<Profile | null>(null);
  const [orders, setOrders]     = useState<Order[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [ratings, setRatings]   = useState<Rating[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    const raw = localStorage.getItem("sokolink_profile");
    if (!raw) { window.location.href = "/"; return; }
    const p: Profile = JSON.parse(raw);
    setProfile(p);
    loadData(p.id);
  }, []);

  async function loadData(supplierId: string) {
    const [ordersRes, listingsRes, ratingsRes] = await Promise.all([
      supabase.from("orders").select("id, status, total_price, commission_tzs, created_at, items")
        .eq("supplier_id", supplierId).order("created_at", { ascending: false }).limit(20),
      supabase.from("inventory").select("id, product_name, qty, unit, price_tzs, status, verification_status, is_featured")
        .eq("supplier_id", supplierId).order("created_at", { ascending: false }).limit(20),
      supabase.from("ratings").select("score, created_at")
        .eq("supplier_id", supplierId).order("created_at", { ascending: false }).limit(50),
    ]);

    setOrders(ordersRes.data ?? []);
    setListings(listingsRes.data ?? []);
    setRatings(ratingsRes.data ?? []);
    setLoading(false);
  }

  if (loading) return <div style={styles.loading}>Loading...</div>;

  const totalRevenue   = orders.filter((o) => o.status === "delivered").reduce((s, o) => s + Number(o.total_price), 0);
  const totalEarnings  = orders.filter((o) => o.status === "delivered").reduce((s, o) => s + (Number(o.total_price) - Number(o.commission_tzs)), 0);
  const avgRating      = ratings.length ? (ratings.reduce((s, r) => s + r.score, 0) / ratings.length).toFixed(1) : "–";
  const verifiedCount  = listings.filter((l) => l.verification_status === "verified").length;
  const pendingCount   = listings.filter((l) => l.verification_status === "pending").length;

  const statusColors: Record<string, string> = {
    pending:   "#f59e0b", confirmed: "#3b82f6",
    delivered: "#16a34a", disputed:  "#dc2626",
  };

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.logo}>🌾 SokoLink</h1>
        <div style={styles.user}>
          <span style={styles.phone}>{profile?.phone}</span>
          <a href="/chat" style={styles.chatBtn}>💬 Chat</a>
          <a href="/admin" style={styles.adminBtn}>⚙️ Admin</a>
          <button style={styles.logout} onClick={() => { localStorage.clear(); window.location.href = "/"; }}>Logout</button>
        </div>
      </header>

      {/* Stats */}
      <div style={styles.statsRow}>
        {[
          { label: "Total Revenue",  value: `${totalRevenue.toLocaleString()} TZS`,   color: "#16a34a" },
          { label: "Net Earnings",   value: `${totalEarnings.toLocaleString()} TZS`,  color: "#2563eb" },
          { label: "Orders",         value: orders.length,                             color: "#7c3aed" },
          { label: "Avg Rating",     value: `${avgRating} ⭐`,                         color: "#d97706" },
          { label: "Verified Listings", value: `${verifiedCount} 🟢 / ${pendingCount} 🟡`, color: "#16a34a" },
        ].map((s) => (
          <div key={s.label} style={styles.statCard}>
            <div style={{ ...styles.statValue, color: s.color }}>{String(s.value)}</div>
            <div style={styles.statLabel}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={styles.grid}>
        {/* Active listings */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>My Listings</h2>
          <table style={styles.table}>
            <thead>
              <tr>{["Product", "Qty", "Price TZS", "Verify", "Status"].map((h) => <th key={h} style={styles.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {listings.map((l) => {
                const vBadge = l.verification_status === "verified" ? "🟢" : l.verification_status === "rejected" ? "🔴" : "🟡";
                const vLabel = l.verification_status === "verified" ? "Verified" : l.verification_status === "rejected" ? "Rejected" : "Pending";
                const vColor = l.verification_status === "verified" ? "#16a34a" : l.verification_status === "rejected" ? "#dc2626" : "#d97706";
                return (
                  <tr key={l.id} style={l.is_featured ? { background: "#fffbeb" } : {}}>
                    <td style={styles.td}>{l.is_featured ? "⭐ " : ""}{l.product_name}</td>
                    <td style={styles.td}>{l.qty} {l.unit}</td>
                    <td style={styles.td}>{Number(l.price_tzs).toLocaleString()}</td>
                    <td style={styles.td}>
                      <span style={{ color: vColor, fontWeight: 600, fontSize: 12 }}>{vBadge} {vLabel}</span>
                    </td>
                    <td style={styles.td}>
                      <span style={{ ...styles.badge, background: l.status === "available" ? "#dcfce7" : "#fee2e2", color: l.status === "available" ? "#16a34a" : "#dc2626" }}>
                        {l.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        {/* Recent orders */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Recent Orders</h2>
          <table style={styles.table}>
            <thead>
              <tr>{["Product", "Total TZS", "Status", "Date"].map((h) => <th key={h} style={styles.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const items = o.items as Record<string, unknown>;
                return (
                  <tr key={o.id}>
                    <td style={styles.td}>{String(items?.product ?? "?")}</td>
                    <td style={styles.td}>{Number(o.total_price).toLocaleString()}</td>
                    <td style={styles.td}>
                      <span style={{ ...styles.badge, background: `${statusColors[o.status]}22`, color: statusColors[o.status] ?? "#666" }}>
                        {o.status}
                      </span>
                    </td>
                    <td style={styles.td}>{new Date(o.created_at).toLocaleDateString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page:         { minHeight: "100vh", padding: 24, maxWidth: 1200, margin: "0 auto" },
  loading:      { display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontSize: 18 },
  header:       { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 },
  logo:         { fontSize: 24, fontWeight: 700, margin: 0 },
  user:         { display: "flex", alignItems: "center", gap: 16 },
  phone:        { fontSize: 14, color: "#555" },
  chatBtn:      { padding: "6px 14px", background: "#dcfce7", color: "#16a34a", borderRadius: 6, fontWeight: 600, fontSize: 13, textDecoration: "none" },
  adminBtn:     { padding: "6px 14px", background: "#f3f4f6", color: "#374151", borderRadius: 6, fontWeight: 600, fontSize: 13, textDecoration: "none" },
  logout:       { padding: "6px 14px", background: "#fee2e2", color: "#dc2626", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: 13 },
  statsRow:     { display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 16, marginBottom: 28 },
  statCard:     { background: "#fff", borderRadius: 10, padding: "20px 24px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" },
  statValue:    { fontSize: 22, fontWeight: 700, marginBottom: 4 },
  statLabel:    { fontSize: 13, color: "#666" },
  grid:         { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 },
  section:      { background: "#fff", borderRadius: 10, padding: 20, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" },
  sectionTitle: { fontSize: 16, fontWeight: 600, margin: "0 0 16px" },
  table:        { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th:           { textAlign: "left", padding: "8px 12px", background: "#f9fafb", fontWeight: 600, color: "#555", borderBottom: "1px solid #e5e7eb" },
  td:           { padding: "10px 12px", borderBottom: "1px solid #f3f4f6", verticalAlign: "middle" },
  badge:        { padding: "3px 10px", borderRadius: 20, fontWeight: 600, fontSize: 12 },
};
