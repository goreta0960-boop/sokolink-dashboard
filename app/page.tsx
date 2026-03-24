"use client";
import { useState } from "react";
import { supabase } from "../lib/supabase";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const normalized = phone.replace(/\s+/g, "").replace(/^\+/, "");

    const { data, error: err } = await supabase
      .from("profiles")
      .select("id, phone, role")
      .eq("phone", normalized)
      .maybeSingle();

    setLoading(false);

    if (err || !data) {
      setError("Phone number not found. Send any message to the bot first.");
      return;
    }

    localStorage.setItem("sokolink_profile", JSON.stringify(data));

    if (data.role === "supplier") {
      router.push("/dashboard");
    } else {
      setError("Dashboard is available for suppliers only.");
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.logo}>🌾 SokoLink</h1>
        <p style={styles.sub}>Supplier & Admin Portal</p>

        <form onSubmit={handleLogin} style={styles.form}>
          <label style={styles.label}>Phone number (with country code)</label>
          <input
            style={styles.input}
            type="text"
            placeholder="255712345678"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
          {error && <p style={styles.error}>{error}</p>}
          <button style={styles.btn} type="submit" disabled={loading}>
            {loading ? "Checking..." : "Login →"}
          </button>
        </form>

        <p style={styles.hint}>
          Admin? Go to{" "}
          <a href="/admin" style={{ color: "#16a34a" }}>/admin</a>
        </p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page:  { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" },
  card:  { background: "#fff", borderRadius: 12, padding: 40, width: 380, boxShadow: "0 4px 24px rgba(0,0,0,0.08)" },
  logo:  { fontSize: 28, fontWeight: 700, margin: "0 0 4px" },
  sub:   { color: "#666", margin: "0 0 28px", fontSize: 14 },
  form:  { display: "flex", flexDirection: "column", gap: 12 },
  label: { fontSize: 13, fontWeight: 600, color: "#333" },
  input: { padding: "10px 14px", borderRadius: 8, border: "1px solid #ddd", fontSize: 15, outline: "none" },
  btn:   { padding: "12px 0", background: "#16a34a", color: "#fff", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: "pointer" },
  error: { color: "#dc2626", fontSize: 13, margin: 0 },
  hint:  { textAlign: "center", marginTop: 20, fontSize: 13, color: "#888" },
};
