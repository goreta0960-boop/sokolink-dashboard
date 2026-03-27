"use client";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "../../lib/supabase";

type Tab = "overview" | "verification" | "disputes" | "trends" | "featured";

type Stats = {
  totalUsers: number; buyers: number; suppliers: number;
  verifiedSellers: number;
  activeListings: number; pendingVerification: number;
  pendingOrders: number; confirmedOrders: number;
  deliveredOrders: number; disputedOrders: number;
  totalRevenue: number; totalCommission: number;
  avgTrustSupplier: number;
};

type PendingListing = {
  id: string; product_name: string; price_tzs: number; qty: number; unit: string;
  verification_score: number | null; image_url: string | null;
  created_at: string; supplier_phone: string;
};

type DisputedOrder = {
  id: string; items: Record<string, unknown>; total_price: number;
  created_at: string; buyer_phone: string; supplier_phone: string;
};

type PriceTrend = {
  product_name: string; avg_price: number; min_price: number;
  max_price: number; count: number; latest_price: number;
};

type FeaturedListing = {
  id: string; product_name: string; price_tzs: number; qty: number; unit: string;
  is_featured: boolean; featured_until: string | null; supplier_phone: string;
  verification_status: string;
};

const BADGE: Record<string, string> = { verified: "🟢", pending: "🟡", rejected: "🔴" };
const STATUS_COLOR: Record<string, string> = {
  pending: "#f59e0b", confirmed: "#3b82f6", delivered: "#16a34a", disputed: "#dc2626",
};

export default function AdminDashboard() {
  const [tab, setTab]             = useState<Tab>("overview");
  const [stats, setStats]         = useState<Stats | null>(null);
  const [topSuppliers, setTop]    = useState<{ phone: string; trust_score: number; total_deals: number; verified_seller: boolean }[]>([]);
  const [pendingList, setPending] = useState<PendingListing[]>([]);
  const [disputes, setDisputes]   = useState<DisputedOrder[]>([]);
  const [trends, setTrends]       = useState<PriceTrend[]>([]);
  const [featured, setFeatured]   = useState<FeaturedListing[]>([]);
  const [loading, setLoading]     = useState(true);
  const [actionMsg, setAction]    = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [profilesRes, inventoryRes, ordersRes, topSupRes] = await Promise.all([
      supabase.from("profiles").select("role, trust_score, verified_seller"),
      supabase.from("inventory").select("status, verification_status"),
      supabase.from("orders").select("status, total_price, commission_tzs"),
      supabase.from("profiles")
        .select("phone, trust_score, total_deals, verified_seller")
        .eq("role", "supplier").order("total_deals", { ascending: false }).limit(8),
    ]);

    const profiles  = profilesRes.data  ?? [];
    const inventory = inventoryRes.data ?? [];
    const orders    = ordersRes.data    ?? [];
    const buyers    = profiles.filter((p) => p.role === "buyer");
    const suppliers = profiles.filter((p) => p.role === "supplier");

    setStats({
      totalUsers:         profiles.length,
      buyers:             buyers.length,
      suppliers:          suppliers.length,
      verifiedSellers:    profiles.filter((p) => p.verified_seller).length,
      activeListings:     inventory.filter((i) => i.status === "available").length,
      pendingVerification:inventory.filter((i) => (i as Record<string,unknown>).verification_status === "pending").length,
      pendingOrders:      orders.filter((o) => o.status === "pending").length,
      confirmedOrders:    orders.filter((o) => o.status === "confirmed").length,
      deliveredOrders:    orders.filter((o) => o.status === "delivered").length,
      disputedOrders:     orders.filter((o) => o.status === "disputed").length,
      totalRevenue:       orders.filter((o) => o.status === "delivered").reduce((s, o) => s + Number(o.total_price), 0),
      totalCommission:    orders.filter((o) => o.status === "delivered").reduce((s, o) => s + Number(o.commission_tzs), 0),
      avgTrustSupplier:   suppliers.length ? suppliers.reduce((s, p) => s + Number(p.trust_score), 0) / suppliers.length : 0,
    });
    setTop(topSupRes.data ?? []);
    setLoading(false);
  }, []);

  const loadVerification = useCallback(async () => {
    const { data } = await supabase
      .from("inventory")
      .select("id, product_name, price_tzs, qty, unit, verification_score, image_url, created_at, supplier_id")
      .eq("status", "available")
      .eq("verification_status", "pending")
      .order("created_at", { ascending: false })
      .limit(20);
    if (!data?.length) { setPending([]); return; }

    const ids = data.map((d) => d.supplier_id).filter(Boolean) as string[];
    const { data: phones } = await supabase.from("profiles").select("id, phone").in("id", ids);
    const phoneMap = new Map((phones ?? []).map((p) => [p.id, p.phone]));

    setPending(data.map((d) => ({
      id: d.id, product_name: d.product_name, price_tzs: d.price_tzs,
      qty: d.qty, unit: d.unit, verification_score: d.verification_score,
      image_url: d.image_url, created_at: d.created_at,
      supplier_phone: phoneMap.get(d.supplier_id) ?? "unknown",
    })));
  }, []);

  const loadDisputes = useCallback(async () => {
    const { data } = await supabase
      .from("orders")
      .select("id, items, total_price, created_at, buyer_id, supplier_id")
      .eq("status", "disputed")
      .order("created_at", { ascending: false })
      .limit(20);
    if (!data?.length) { setDisputes([]); return; }

    const ids = [...new Set([...data.map((d) => d.buyer_id), ...data.map((d) => d.supplier_id)].filter(Boolean))];
    const { data: phones } = await supabase.from("profiles").select("id, phone").in("id", ids);
    const phoneMap = new Map((phones ?? []).map((p) => [p.id, p.phone]));

    setDisputes(data.map((d) => ({
      id: d.id, items: d.items as Record<string, unknown>, total_price: d.total_price,
      created_at: d.created_at, buyer_phone: phoneMap.get(d.buyer_id) ?? "?",
      supplier_phone: phoneMap.get(d.supplier_id) ?? "?",
    })));
  }, []);

  const loadTrends = useCallback(async () => {
    const { data } = await supabase
      .from("price_history")
      .select("product_name, price_tzs, recorded_at")
      .order("recorded_at", { ascending: false })
      .limit(500);
    if (!data?.length) { setTrends([]); return; }

    const grouped = new Map<string, number[]>();
    for (const row of data) {
      const key = row.product_name.toLowerCase();
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(Number(row.price_tzs));
    }

    const result: PriceTrend[] = [];
    for (const [name, prices] of grouped.entries()) {
      result.push({
        product_name: name,
        avg_price:    Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
        min_price:    Math.min(...prices),
        max_price:    Math.max(...prices),
        latest_price: prices[0],
        count:        prices.length,
      });
    }
    setTrends(result.sort((a, b) => b.count - a.count).slice(0, 15));
  }, []);

  const loadFeatured = useCallback(async () => {
    const { data } = await supabase
      .from("inventory")
      .select("id, product_name, price_tzs, qty, unit, is_featured, featured_until, supplier_id, verification_status")
      .eq("status", "available")
      .order("is_featured", { ascending: false })
      .limit(30);
    if (!data?.length) { setFeatured([]); return; }

    const ids = data.map((d) => d.supplier_id).filter(Boolean) as string[];
    const { data: phones } = await supabase.from("profiles").select("id, phone").in("id", ids);
    const phoneMap = new Map((phones ?? []).map((p) => [p.id, p.phone]));

    setFeatured(data.map((d) => ({
      id: d.id, product_name: d.product_name, price_tzs: d.price_tzs,
      qty: d.qty, unit: d.unit, is_featured: d.is_featured,
      featured_until: d.featured_until, supplier_phone: phoneMap.get(d.supplier_id) ?? "?",
      verification_status: (d as Record<string,unknown>).verification_status as string ?? "pending",
    })));
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (tab === "verification") loadVerification();
    if (tab === "disputes")     loadDisputes();
    if (tab === "trends")       loadTrends();
    if (tab === "featured")     loadFeatured();
  }, [tab, loadVerification, loadDisputes, loadTrends, loadFeatured]);

  async function setVerification(id: string, status: "verified" | "rejected") {
    await supabase.from("inventory").update({ verification_status: status }).eq("id", id);
    if (status === "verified") {
      const item = pendingList.find((p) => p.id === id);
      if (item) {
        const { data: profile } = await supabase.from("profiles")
          .select("id").eq("phone", item.supplier_phone).maybeSingle();
        if (profile) await supabase.from("profiles").update({ verified_seller: true }).eq("id", profile.id);
      }
    }
    setPending((prev) => prev.filter((p) => p.id !== id));
    flash(status === "verified" ? "✅ Verified!" : "❌ Rejected.");
  }

  async function toggleFeatured(id: string, current: boolean) {
    const until = current ? null : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from("inventory").update({ is_featured: !current, featured_until: until }).eq("id", id);
    setFeatured((prev) => prev.map((f) => f.id === id ? { ...f, is_featured: !current, featured_until: until } : f));
    flash(!current ? "⭐ Featured for 7 days!" : "Feature removed.");
  }

  async function resolveDispute(id: string) {
    await supabase.from("orders").update({ status: "delivered" }).eq("id", id);
    setDisputes((prev) => prev.filter((d) => d.id !== id));
    flash("✅ Dispute resolved.");
  }

  function flash(msg: string) {
    setAction(msg);
    setTimeout(() => setAction(""), 3000);
  }

  if (loading) return <div style={s.center}>Loading admin dashboard...</div>;

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview",     label: "📊 Overview"      },
    { id: "verification", label: `🔍 Verify${stats?.pendingVerification ? ` (${stats.pendingVerification})` : ""}` },
    { id: "disputes",     label: `⚠️ Disputes${stats?.disputedOrders ? ` (${stats.disputedOrders})` : ""}` },
    { id: "trends",       label: "📈 Price Trends"  },
    { id: "featured",     label: "⭐ Featured"       },
  ];

  return (
    <div style={s.page}>
      <header style={s.header}>
        <h1 style={s.logo}>🌾 SokoLink Admin</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {actionMsg && <span style={s.flash}>{actionMsg}</span>}
          <button style={s.refresh} onClick={load}>↻ Refresh</button>
        </div>
      </header>

      {/* Tabs */}
      <div style={s.tabs}>
        {tabs.map((t) => (
          <button key={t.id} style={{ ...s.tab, ...(tab === t.id ? s.tabActive : {}) }}
            onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {/* ── Overview ── */}
      {tab === "overview" && stats && (
        <>
          <div style={s.grid4}>
            {[
              { label: "Total Users",       value: stats.totalUsers,                                sub: `${stats.buyers} buyers / ${stats.suppliers} suppliers`, color: "#7c3aed" },
              { label: "Verified Sellers",  value: `${stats.verifiedSellers} 🟢`,                  sub: "with verified badge",                                    color: "#16a34a" },
              { label: "Active Listings",   value: stats.activeListings,                            sub: `${stats.pendingVerification} pending verification`,      color: "#0891b2" },
              { label: "Pending Orders",    value: stats.pendingOrders,                             sub: "awaiting supplier",                                      color: "#f59e0b" },
              { label: "Delivered",         value: stats.deliveredOrders,                           sub: "completed orders",                                       color: "#16a34a" },
              { label: "Disputed",          value: stats.disputedOrders,                            sub: "needs attention",                                        color: "#dc2626" },
              { label: "Total Revenue",     value: `${stats.totalRevenue.toLocaleString()} TZS`,    sub: "delivered orders",                                       color: "#16a34a" },
              { label: "Commission Earned", value: `${stats.totalCommission.toLocaleString()} TZS`, sub: "5% platform fee",                                        color: "#2563eb" },
            ].map((c) => (
              <div key={c.label} style={s.card}>
                <div style={{ ...s.value, color: c.color }}>{String(c.value)}</div>
                <div style={s.cardLabel}>{c.label}</div>
                <div style={s.sub}>{c.sub}</div>
              </div>
            ))}
          </div>

          <div style={s.grid2}>
            <section style={s.section}>
              <h2 style={s.title}>Top Suppliers</h2>
              <table style={s.table}>
                <thead><tr>{["Phone", "Trust", "Deals", "Badge"].map((h) => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {topSuppliers.map((sup) => (
                    <tr key={sup.phone}>
                      <td style={s.td}>{sup.phone}</td>
                      <td style={s.td}>{Number(sup.trust_score).toFixed(1)}/10 ⭐</td>
                      <td style={s.td}>{sup.total_deals}</td>
                      <td style={s.td}>{sup.verified_seller ? "🟢 Verified" : "🟡 New"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section style={s.section}>
              <h2 style={s.title}>Quick Actions</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[
                  { label: "Review Pending Verifications", tab: "verification" as Tab, color: "#2563eb" },
                  { label: "Resolve Disputes",             tab: "disputes"     as Tab, color: "#dc2626" },
                  { label: "Manage Featured Listings",     tab: "featured"     as Tab, color: "#d97706" },
                  { label: "View Price Trends",            tab: "trends"       as Tab, color: "#16a34a" },
                ].map((a) => (
                  <button key={a.label} style={{ ...s.actionBtn, background: a.color }}
                    onClick={() => setTab(a.tab)}>{a.label}</button>
                ))}
              </div>
            </section>
          </div>
        </>
      )}

      {/* ── Verification Panel ── */}
      {tab === "verification" && (
        <section style={s.section}>
          <h2 style={s.title}>Pending Verifications</h2>
          {pendingList.length === 0
            ? <p style={{ color: "#16a34a", fontWeight: 600 }}>No pending verifications 🎉</p>
            : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {pendingList.map((item) => (
                  <div key={item.id} style={s.verifyCard}>
                    <div style={s.verifyLeft}>
                      {item.image_url
                        ? <img src={item.image_url} alt={item.product_name} style={s.productImg} />
                        : <div style={s.noImg}>No image</div>
                      }
                    </div>
                    <div style={s.verifyMid}>
                      <div style={s.productName}>{item.product_name}</div>
                      <div style={s.metaRow}>
                        <span style={s.meta}>{Number(item.price_tzs).toLocaleString()} TZS/{item.unit}</span>
                        <span style={s.meta}>📦 {item.qty} {item.unit}</span>
                        <span style={s.meta}>📱 {item.supplier_phone}</span>
                      </div>
                      <div style={s.metaRow}>
                        <span style={{ ...s.meta, color: "#6366f1" }}>
                          AI score: {item.verification_score != null ? `${item.verification_score}/10` : "N/A"}
                        </span>
                        <span style={s.meta}>{new Date(item.created_at).toLocaleString()}</span>
                      </div>
                    </div>
                    <div style={s.verifyActions}>
                      <button style={{ ...s.btn, background: "#16a34a" }}
                        onClick={() => setVerification(item.id, "verified")}>✅ Verify</button>
                      <button style={{ ...s.btn, background: "#dc2626" }}
                        onClick={() => setVerification(item.id, "rejected")}>❌ Reject</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
        </section>
      )}

      {/* ── Disputes Panel ── */}
      {tab === "disputes" && (
        <section style={s.section}>
          <h2 style={s.title}>Disputed Orders</h2>
          {disputes.length === 0
            ? <p style={{ color: "#16a34a", fontWeight: 600 }}>No disputes 🎉</p>
            : (
              <table style={s.table}>
                <thead>
                  <tr>{["Product", "Total TZS", "Buyer", "Supplier", "Date", "Action"].map((h) =>
                    <th key={h} style={s.th}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {disputes.map((d) => (
                    <tr key={d.id}>
                      <td style={s.td}>{String(d.items?.product ?? "?")}</td>
                      <td style={s.td}>{Number(d.total_price).toLocaleString()}</td>
                      <td style={s.td}>{d.buyer_phone}</td>
                      <td style={s.td}>{d.supplier_phone}</td>
                      <td style={s.td}>{new Date(d.created_at).toLocaleDateString()}</td>
                      <td style={s.td}>
                        <button style={{ ...s.btn, background: "#16a34a", padding: "4px 10px", fontSize: 12 }}
                          onClick={() => resolveDispute(d.id)}>Resolve ✅</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </section>
      )}

      {/* ── Price Trends ── */}
      {tab === "trends" && (
        <section style={s.section}>
          <h2 style={s.title}>Market Price Trends</h2>
          {trends.length === 0
            ? <p style={{ color: "#999" }}>No price history yet.</p>
            : (
              <table style={s.table}>
                <thead>
                  <tr>{["Product", "Latest TZS", "Avg TZS", "Min", "Max", "Volatility", "Data Points"].map((h) =>
                    <th key={h} style={s.th}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {trends.map((t) => {
                    const volatility = t.max_price > 0 ? Math.round(((t.max_price - t.min_price) / t.avg_price) * 100) : 0;
                    const trend = t.latest_price > t.avg_price ? "📈" : t.latest_price < t.avg_price ? "📉" : "➡️";
                    return (
                      <tr key={t.product_name}>
                        <td style={s.td}>{t.product_name} {trend}</td>
                        <td style={{ ...s.td, fontWeight: 700 }}>{t.latest_price.toLocaleString()}</td>
                        <td style={s.td}>{t.avg_price.toLocaleString()}</td>
                        <td style={{ ...s.td, color: "#16a34a" }}>{t.min_price.toLocaleString()}</td>
                        <td style={{ ...s.td, color: "#dc2626" }}>{t.max_price.toLocaleString()}</td>
                        <td style={s.td}>
                          <span style={{ color: volatility > 30 ? "#dc2626" : volatility > 15 ? "#f59e0b" : "#16a34a" }}>
                            {volatility}%
                          </span>
                        </td>
                        <td style={s.td}>{t.count}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
        </section>
      )}

      {/* ── Featured Listings ── */}
      {tab === "featured" && (
        <section style={s.section}>
          <h2 style={s.title}>Featured Listings Management</h2>
          <p style={{ color: "#666", fontSize: 13, marginTop: -8, marginBottom: 16 }}>
            Featured listings appear first in all buyer searches. Feature lasts 7 days.
          </p>
          {featured.length === 0
            ? <p style={{ color: "#999" }}>No active listings.</p>
            : (
              <table style={s.table}>
                <thead>
                  <tr>{["Product", "Price/unit", "Qty", "Supplier", "Badge", "Featured Until", "Action"].map((h) =>
                    <th key={h} style={s.th}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {featured.map((f) => (
                    <tr key={f.id} style={f.is_featured ? { background: "#fffbeb" } : {}}>
                      <td style={s.td}>{f.product_name}</td>
                      <td style={s.td}>{Number(f.price_tzs).toLocaleString()} TZS/{f.unit}</td>
                      <td style={s.td}>{f.qty} {f.unit}</td>
                      <td style={s.td}>{f.supplier_phone}</td>
                      <td style={s.td}>{BADGE[f.verification_status] ?? "🟡"}</td>
                      <td style={s.td}>
                        {f.is_featured && f.featured_until
                          ? new Date(f.featured_until).toLocaleDateString()
                          : <span style={{ color: "#999" }}>—</span>
                        }
                      </td>
                      <td style={s.td}>
                        <button
                          style={{ ...s.btn, background: f.is_featured ? "#6b7280" : "#d97706", padding: "4px 10px", fontSize: 12 }}
                          onClick={() => toggleFeatured(f.id, f.is_featured)}>
                          {f.is_featured ? "Remove ⭐" : "Feature ⭐"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </section>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page:         { maxWidth: 1280, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" },
  center:       { display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontSize: 18 },
  header:       { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  logo:         { fontSize: 24, fontWeight: 700, margin: 0 },
  refresh:      { padding: "8px 16px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 },
  flash:        { padding: "6px 14px", background: "#f0fdf4", color: "#16a34a", borderRadius: 8, fontWeight: 600, fontSize: 13 },
  tabs:         { display: "flex", gap: 4, marginBottom: 20, borderBottom: "2px solid #e5e7eb", paddingBottom: 0 },
  tab:          { padding: "10px 18px", border: "none", background: "none", cursor: "pointer", fontWeight: 500, color: "#666", borderRadius: "8px 8px 0 0", fontSize: 14 },
  tabActive:    { background: "#f0fdf4", color: "#16a34a", fontWeight: 700, borderBottom: "2px solid #16a34a" },
  grid4:        { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 24 },
  grid2:        { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 },
  card:         { background: "#fff", borderRadius: 10, padding: "20px 24px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" },
  value:        { fontSize: 22, fontWeight: 700, marginBottom: 4 },
  cardLabel:    { fontSize: 13, fontWeight: 600, color: "#333", marginBottom: 2 },
  sub:          { fontSize: 12, color: "#999" },
  section:      { background: "#fff", borderRadius: 10, padding: 24, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" },
  title:        { fontSize: 17, fontWeight: 700, margin: "0 0 18px" },
  table:        { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th:           { textAlign: "left", padding: "9px 12px", background: "#f9fafb", fontWeight: 600, color: "#555", borderBottom: "1px solid #e5e7eb" },
  td:           { padding: "11px 12px", borderBottom: "1px solid #f3f4f6", verticalAlign: "middle" },
  verifyCard:   { display: "flex", gap: 20, padding: 16, border: "1px solid #e5e7eb", borderRadius: 10, alignItems: "center" },
  verifyLeft:   { flexShrink: 0 },
  verifyMid:    { flex: 1 },
  verifyActions:{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 },
  productImg:   { width: 80, height: 80, objectFit: "cover", borderRadius: 8, border: "1px solid #e5e7eb" },
  noImg:        { width: 80, height: 80, background: "#f3f4f6", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#999" },
  productName:  { fontWeight: 700, fontSize: 16, marginBottom: 6 },
  metaRow:      { display: "flex", gap: 16, marginBottom: 4 },
  meta:         { fontSize: 13, color: "#666" },
  btn:          { padding: "8px 16px", border: "none", borderRadius: 8, cursor: "pointer", color: "#fff", fontWeight: 600, fontSize: 13 },
  actionBtn:    { padding: "12px 16px", border: "none", borderRadius: 8, cursor: "pointer", color: "#fff", fontWeight: 600, fontSize: 14, textAlign: "left" },
};
