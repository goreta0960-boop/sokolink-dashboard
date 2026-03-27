"use client";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type Profile = { id: string; phone: string; role: string; trust_score: number; total_deals: number };

type Order = {
  id: string;
  status: string;
  total_price: number;
  created_at: string;
  updated_at: string;
  items: Record<string, unknown>;
  supplier_phone?: string;
};

type Listing = {
  id: string;
  product_name: string;
  qty: number;
  unit: string;
  price_tzs: number;
  verification_status: string;
  is_featured: boolean;
  supplier_phone?: string;
};

const STATUS_COLOR: Record<string, string> = {
  pending:   "#f59e0b",
  confirmed: "#3b82f6",
  delivered: "#16a34a",
  disputed:  "#dc2626",
};

const STATUS_LABEL: Record<string, string> = {
  pending:   "⏳ Pending",
  confirmed: "✅ Confirmed",
  delivered: "📦 Delivered",
  disputed:  "⚠️ Disputed",
};

export default function BuyerDashboard() {
  const [profile, setProfile]   = useState<Profile | null>(null);
  const [orders, setOrders]     = useState<Order[]>([]);
  const [browse, setBrowse]     = useState<Listing[]>([]);
  const [loading, setLoading]   = useState(true);
  const [activeTab, setActiveTab] = useState<"orders" | "browse">("orders");
  const [ratingOrderId, setRatingOrderId] = useState<string | null>(null);
  const [ratingScore, setRatingScore]     = useState(5);
  const [ratingMsg, setRatingMsg]         = useState("");

  useEffect(() => {
    const raw = localStorage.getItem("sokolink_profile");
    if (!raw) { window.location.href = "/"; return; }
    const p: Profile = JSON.parse(raw);
    if (p.role !== "buyer") { window.location.href = "/dashboard"; return; }
    setProfile(p);
    loadData(p.id);
  }, []);

  async function loadData(buyerId: string) {
    const [ordersRes, browseRes] = await Promise.all([
      supabase
        .from("orders")
        .select("id, status, total_price, created_at, updated_at, items, supplier_id")
        .eq("buyer_id", buyerId)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("inventory")
        .select("id, product_name, qty, unit, price_tzs, verification_status, is_featured, supplier_id")
        .eq("status", "available")
        .order("is_featured", { ascending: false })
        .order("price_tzs", { ascending: true })
        .limit(40),
    ]);

    const orderData = ordersRes.data ?? [];

    // Enrich orders with supplier phone
    const supplierIds = [...new Set(orderData.map((o) => (o as Record<string, unknown>).supplier_id as string).filter(Boolean))];
    let phonesMap: Record<string, string> = {};
    if (supplierIds.length) {
      const { data: profiles } = await supabase.from("profiles").select("id, phone").in("id", supplierIds);
      phonesMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.phone]));
    }

    const enrichedOrders: Order[] = orderData.map((o) => ({
      id:             o.id,
      status:         o.status,
      total_price:    o.total_price,
      created_at:     o.created_at,
      updated_at:     o.updated_at,
      items:          o.items as Record<string, unknown>,
      supplier_phone: phonesMap[(o as Record<string, unknown>).supplier_id as string],
    }));
    setOrders(enrichedOrders);

    // Enrich browse listings with supplier phone
    const browseData = browseRes.data ?? [];
    const browseSupplierIds = [...new Set(browseData.map((l) => (l as Record<string, unknown>).supplier_id as string).filter(Boolean))];
    let browsePhones: Record<string, string> = {};
    if (browseSupplierIds.length) {
      const alreadyFetched = browseSupplierIds.filter((id) => !phonesMap[id]);
      if (alreadyFetched.length) {
        const { data: profiles } = await supabase.from("profiles").select("id, phone").in("id", alreadyFetched);
        browsePhones = { ...phonesMap, ...Object.fromEntries((profiles ?? []).map((p) => [p.id, p.phone])) };
      } else {
        browsePhones = phonesMap;
      }
    }

    const enrichedBrowse: Listing[] = browseData.map((l) => ({
      id:                  l.id,
      product_name:        l.product_name,
      qty:                 l.qty,
      unit:                l.unit,
      price_tzs:           l.price_tzs,
      verification_status: l.verification_status,
      is_featured:         l.is_featured,
      supplier_phone:      browsePhones[(l as Record<string, unknown>).supplier_id as string],
    }));
    setBrowse(enrichedBrowse);

    setLoading(false);
  }

  async function submitRating(orderId: string, supplierId: string | undefined) {
    if (!supplierId || !profile) return;
    await supabase.from("ratings").insert({
      supplier_id: supplierId,
      buyer_id:    profile.id,
      order_id:    orderId,
      score:       ratingScore,
    });
    // Update order to avoid double-rating (mark updated_at)
    await supabase.from("orders").update({ updated_at: new Date().toISOString() }).eq("id", orderId);
    setRatingOrderId(null);
    setRatingMsg("⭐ Asante kwa tathmini yako! Thank you for rating!");
    setTimeout(() => setRatingMsg(""), 3000);
  }

  if (loading) return <div style={styles.loading}>Loading...</div>;

  const delivered  = orders.filter((o) => o.status === "delivered").length;
  const pending    = orders.filter((o) => o.status === "pending").length;
  const disputed   = orders.filter((o) => o.status === "disputed").length;
  const totalSpent = orders.filter((o) => o.status === "delivered").reduce((s, o) => s + Number(o.total_price), 0);

  // Get supplier_id from order items for rating
  const getOrderSupplierId = (order: Order): string | undefined => {
    // stored on the order row directly? We'd need to fetch — use supplier_phone as proxy
    // The enriched orders have supplier_phone but not supplier_id directly
    // For rating, we'll look up by phone
    return order.supplier_phone;
  };

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.logo}>🛒 SokoLink Buyer</h1>
        <div style={styles.navLinks}>
          <span style={styles.phone}>{profile?.phone}</span>
          <a href="/chat" style={styles.chatBtn}>💬 Chat Bot</a>
          <button style={styles.logout} onClick={() => { localStorage.clear(); window.location.href = "/"; }}>Logout</button>
        </div>
      </header>

      {/* KPIs */}
      <div style={styles.kpiRow}>
        {[
          { label: "Total Spent",   value: `${totalSpent.toLocaleString()} TZS`, color: "#16a34a" },
          { label: "Total Orders",  value: orders.length,                         color: "#2563eb" },
          { label: "Delivered",     value: delivered,                             color: "#16a34a" },
          { label: "Pending",       value: pending,                               color: "#f59e0b" },
          { label: "Trust Score",   value: `${profile?.trust_score ?? "–"}/10`,   color: "#7c3aed" },
        ].map((k) => (
          <div key={k.label} style={styles.kpiCard}>
            <div style={{ ...styles.kpiValue, color: k.color }}>{String(k.value)}</div>
            <div style={styles.kpiLabel}>{k.label}</div>
          </div>
        ))}
      </div>

      {ratingMsg && <div style={styles.toast}>{ratingMsg}</div>}

      {/* Tabs */}
      <div style={styles.tabs}>
        {(["orders", "browse"] as const).map((tab) => (
          <button
            key={tab}
            style={{ ...styles.tab, ...(activeTab === tab ? styles.tabActive : {}) }}
            onClick={() => setActiveTab(tab)}
          >
            {tab === "orders" ? `My Orders (${orders.length})` : `Browse Listings (${browse.length})`}
          </button>
        ))}
      </div>

      {activeTab === "orders" && (
        <section style={styles.section}>
          {orders.length === 0 ? (
            <div style={styles.empty}>
              No orders yet. Chat with the bot to place your first order!<br />
              <a href="/chat" style={styles.chatLink}>💬 Open Chat</a>
            </div>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>{["Product", "Qty", "Total TZS", "Supplier", "Status", "Date", "Action"].map((h) => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const isDelivered = o.status === "delivered";
                  const isRating    = ratingOrderId === o.id;
                  return (
                    <>
                      <tr key={o.id}>
                        <td style={styles.td}>{String(o.items?.product ?? "?")}</td>
                        <td style={styles.td}>{String(o.items?.qty ?? "?")} {String(o.items?.unit ?? "")}</td>
                        <td style={styles.td}>{Number(o.total_price).toLocaleString()}</td>
                        <td style={styles.td}>{o.supplier_phone ?? "–"}</td>
                        <td style={styles.td}>
                          <span style={{ ...styles.badge, background: `${STATUS_COLOR[o.status]}22`, color: STATUS_COLOR[o.status] ?? "#666" }}>
                            {STATUS_LABEL[o.status] ?? o.status}
                          </span>
                        </td>
                        <td style={styles.td}>{new Date(o.created_at).toLocaleDateString()}</td>
                        <td style={styles.td}>
                          {isDelivered && (
                            <button style={styles.rateBtn} onClick={() => setRatingOrderId(isRating ? null : o.id)}>
                              ⭐ Rate
                            </button>
                          )}
                          {o.status === "disputed" && (
                            <span style={{ fontSize: 11, color: "#dc2626" }}>Contact admin</span>
                          )}
                        </td>
                      </tr>
                      {isRating && (
                        <tr key={`${o.id}-rate`}>
                          <td colSpan={7} style={{ ...styles.td, background: "#fffbeb", padding: 16 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                              <span style={{ fontSize: 13, fontWeight: 600 }}>Rate supplier:</span>
                              {[1,2,3,4,5].map((n) => (
                                <button key={n} style={{ ...styles.starBtn, color: n <= ratingScore ? "#f59e0b" : "#ccc" }} onClick={() => setRatingScore(n)}>★</button>
                              ))}
                              <span style={{ fontSize: 13, color: "#666" }}>{ratingScore}/5</span>
                              <button style={styles.submitRateBtn} onClick={async () => {
                                // find supplier_id from orders table
                                const { data } = await supabase.from("orders").select("supplier_id").eq("id", o.id).maybeSingle();
                                await submitRating(o.id, data?.supplier_id);
                              }}>Submit</button>
                              <button style={styles.cancelBtn} onClick={() => setRatingOrderId(null)}>Cancel</button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      )}

      {activeTab === "browse" && (
        <section style={styles.section}>
          <p style={styles.browseHint}>💬 To order any product, send a message to the WhatsApp bot: <strong>nunua [bidhaa] [qty]</strong></p>
          <table style={styles.table}>
            <thead>
              <tr>{["Product", "Qty Available", "Price TZS", "Verified", "Supplier"].map((h) => (
                <th key={h} style={styles.th}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {browse.map((l) => {
                const badge = l.verification_status === "verified" ? "🟢" : l.verification_status === "rejected" ? "🔴" : "🟡";
                return (
                  <tr key={l.id} style={l.is_featured ? { background: "#fffbeb" } : {}}>
                    <td style={styles.td}>{l.is_featured ? "⭐ " : ""}{l.product_name}</td>
                    <td style={styles.td}>{l.qty} {l.unit}</td>
                    <td style={{ ...styles.td, fontWeight: 600, color: "#16a34a" }}>{Number(l.price_tzs).toLocaleString()}</td>
                    <td style={styles.td}>{badge}</td>
                    <td style={styles.td}>{l.supplier_phone ?? "–"}</td>
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
  phone:        { fontSize: 13, color: "#555" },
  chatBtn:      { padding: "6px 14px", background: "#dcfce7", color: "#16a34a", borderRadius: 6, fontWeight: 600, fontSize: 13, textDecoration: "none" },
  logout:       { padding: "6px 14px", background: "#fee2e2", color: "#dc2626", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: 13 },
  kpiRow:       { display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 16, marginBottom: 24 },
  kpiCard:      { background: "#fff", borderRadius: 10, padding: "18px 20px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" },
  kpiValue:     { fontSize: 20, fontWeight: 700, marginBottom: 4 },
  kpiLabel:     { fontSize: 12, color: "#666" },
  toast:        { background: "#dcfce7", color: "#16a34a", padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontWeight: 600, fontSize: 14 },
  tabs:         { display: "flex", gap: 8, marginBottom: 16 },
  tab:          { padding: "8px 20px", borderRadius: 6, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 500, color: "#555" },
  tabActive:    { background: "#16a34a", color: "#fff", border: "1px solid #16a34a" },
  section:      { background: "#fff", borderRadius: 10, padding: 20, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" },
  table:        { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th:           { textAlign: "left", padding: "8px 12px", background: "#f9fafb", fontWeight: 600, color: "#555", borderBottom: "1px solid #e5e7eb" },
  td:           { padding: "10px 12px", borderBottom: "1px solid #f3f4f6", verticalAlign: "middle" },
  badge:        { padding: "3px 10px", borderRadius: 20, fontWeight: 600, fontSize: 12 },
  rateBtn:      { padding: "4px 12px", background: "#fffbeb", color: "#d97706", border: "1px solid #fde68a", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600 },
  starBtn:      { background: "none", border: "none", fontSize: 22, cursor: "pointer", padding: "0 2px" },
  submitRateBtn:{ padding: "5px 14px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 },
  cancelBtn:    { padding: "5px 12px", background: "#f3f4f6", color: "#555", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13 },
  empty:        { textAlign: "center", padding: "40px 0", color: "#888", fontSize: 14 },
  chatLink:     { display: "inline-block", marginTop: 12, padding: "8px 20px", background: "#dcfce7", color: "#16a34a", borderRadius: 8, textDecoration: "none", fontWeight: 600 },
  browseHint:   { fontSize: 13, color: "#555", margin: "0 0 16px", background: "#f0fdf4", padding: "10px 14px", borderRadius: 8 },
};
