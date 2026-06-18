/**
 * TreazyAI.jsx — Complete React Dashboard
 * =========================================
 * 8 tabs: Dashboard · Forecasting · Anomalies · Scenario ·
 *         Optimize · Portfolio · ETL · SQL · AI Agents
 *
 * All data comes from FastAPI backend (localhost:8000).
 * Proxy in vite.config.js routes /api → backend.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { API_BASE } from "../config.js";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine, ComposedChart,
} from "recharts";

/* ═══════════════════════ DESIGN TOKENS ══════════════════════════ */
const C = {
  page:   "#F0F2F7",
  panel:  "#FFFFFF",
  card:   "#F7F9FC",
  line:   "#E4E8F0",
  line2:  "#C8D0DE",
  blue:   "#2563EB",
  indigo: "#4F46E5",
  green:  "#059669",
  red:    "#DC2626",
  amber:  "#D97706",
  purple: "#7C3AED",
  teal:   "#0891B2",
  ink:    "#0F172A",
  sub:    "#64748B",
  faint:  "#94A3B8",
  sans:   "'Inter',system-ui,sans-serif",
  mono:   "'JetBrains Mono',monospace",
};

/* ═══════════════════════ GLOBALS ════════════════════════════════ */
const GLOBAL_CSS = `
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  html,body,#root{height:100%;font-family:${C.sans};background:${C.page};color:${C.ink}}
  ::-webkit-scrollbar{width:4px;height:4px}
  ::-webkit-scrollbar-thumb{background:${C.line2};border-radius:2px}
  input:focus,button:focus{outline:2px solid ${C.blue};outline-offset:2px}
  ::placeholder{color:${C.faint}}
  a{color:${C.blue}}
  textarea,input,select{font-family:${C.sans}}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes fadein{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
  @keyframes ping{75%,100%{transform:scale(2.2);opacity:0}}
  @keyframes slideright{from{transform:translateX(-100%)}to{transform:translateX(0)}}
  .fade{animation:fadein .2s ease both}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  .grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
  .grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
  .mob-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:49}
  .mob-overlay.open{display:block}
  .sidebar-mobile{animation:slideright .22s ease both}
  @media(max-width:900px){
    .sidebar-desktop{display:none!important}
    .mob-btn{display:flex!important}
    .grid2{grid-template-columns:1fr}
    .grid4{grid-template-columns:1fr 1fr}
    .hide-mob{display:none!important}
    textarea{font-size:14px}
  }
  @media(max-width:520px){
    .grid4{grid-template-columns:1fr}
    .grid3{grid-template-columns:1fr}
    main{padding:12px 12px 40px!important}
  }
  @media(hover:none){
    button,select{min-height:40px}
    input,textarea{font-size:16px!important}
  }
`;

/* ═══════════════════════ API HELPERS ════════════════════════════ */
const api = async (path, opts = {}) => {
  const res = await fetch(API_BASE + path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
  return res.json();
};
const apiPost = (path, body) =>
  api(path, { method: "POST", body: JSON.stringify(body) });

/* ═══════════════════════ FORMATTERS ═════════════════════════════ */
// Indian number formatting — Crore / Lakh
const fCr = (v) => {
  if (v == null) return "—";
  const n = parseFloat(v);
  if (Math.abs(n) >= 1000) return `₹${(n / 1000).toFixed(1)}K Cr`;
  if (Math.abs(n) >= 1)    return `₹${n.toFixed(2)} Cr`;
  return `₹${(n * 100).toFixed(0)} L`;
};
const fPct = (v) => `${parseFloat(v).toFixed(2)}%`;
const fINR = (v) => `₹${parseFloat(v).toLocaleString("en-IN")}`;

/* ═══════════════════════ BASE COMPONENTS ════════════════════════ */
function Spinner({ size = 22 }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
      <div style={{ width: size, height: size, border: `2px solid ${C.line}`, borderTopColor: C.blue, borderRadius: "50%", animation: "spin .7s linear infinite" }} />
    </div>
  );
}

function LiveDot({ color = C.green, size = 8 }) {
  return (
    <span style={{ position: "relative", display: "inline-flex", width: size, height: size, flexShrink: 0 }}>
      <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: color, animation: "ping 1.6s ease-out infinite", opacity: 0.5 }} />
      <span style={{ position: "relative", borderRadius: "50%", width: size, height: size, background: color }} />
    </span>
  );
}

function Badge({ text, type = "info" }) {
  const s = {
    success: ["#DCFCE7", "#15803D"], warning: ["#FEF3C7", "#92400E"],
    error:   ["#FEE2E2", "#991B1B"], info:    ["#EEF2FF", "#3730A3"],
    low:     ["#DCFCE7", "#15803D"], medium:  ["#FEF3C7", "#92400E"],
    high:    ["#FEE2E2", "#991B1B"], critical:["#FEE2E2", "#7F1D1D"],
    purple:  ["#F5F3FF", "#6D28D9"], teal:    ["#ECFEFF", "#155E75"],
  }[type] || ["#EEF2FF", "#3730A3"];
  return (
    <span style={{ background: s[0], color: s[1], borderRadius: 4, fontSize: 10, fontWeight: 600, padding: "2px 8px", textTransform: "uppercase", letterSpacing: ".05em", fontFamily: C.mono, whiteSpace: "nowrap" }}>
      {text}
    </span>
  );
}

function Card({ title, sub, action, children, mb = 16, noPad }) {
  return (
    <div className="fade" style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, overflow: "hidden", marginBottom: mb }}>
      {title && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 18px", borderBottom: `1px solid ${C.line}` }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{title}</div>
            {sub && <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>{sub}</div>}
          </div>
          {action}
        </div>
      )}
      <div style={noPad ? {} : { padding: "16px 18px" }}>{children}</div>
    </div>
  );
}

function Kpi({ label, value, sub, accent = C.blue, icon, trend }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, padding: "16px 18px", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: accent, borderRadius: "10px 10px 0 0" }} />
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: C.sub, textTransform: "uppercase", letterSpacing: ".07em", fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 18, opacity: .75 }}>{icon}</span>
      </div>
      <div style={{ fontFamily: C.mono, fontSize: 20, fontWeight: 700, color: accent, lineHeight: 1 }}>{value}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
        {trend != null && (
          <span style={{ fontSize: 10, fontWeight: 700, color: trend >= 0 ? C.green : C.red, fontFamily: C.mono }}>
            {trend >= 0 ? "▲" : "▼"} {Math.abs(trend)}%
          </span>
        )}
        {sub && <span style={{ fontSize: 11, color: C.sub }}>{sub}</span>}
      </div>
    </div>
  );
}

function CTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#1E293B", border: "1px solid #334155", borderRadius: 8, padding: "10px 14px", fontSize: 12, boxShadow: "0 8px 24px rgba(0,0,0,.3)" }}>
      <div style={{ color: "#94A3B8", fontFamily: C.mono, fontSize: 11, marginBottom: 6 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 20, marginBottom: 2 }}>
          <span style={{ color: "#94A3B8" }}>{p.name}</span>
          <span style={{ color: p.color, fontFamily: C.mono, fontWeight: 600 }}>
            {typeof p.value === "number" ? (p.value > 100 ? fINR(p.value) : `${p.value}`) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════ NAVIGATION ═════════════════════════════ */
const NAV = [
  { id: "dashboard", icon: "🏠", label: "Dashboard"         },
  { id: "forecast",  icon: "📈", label: "Forecasting"       },
  { id: "anomaly",   icon: "🔍", label: "Anomaly Detection" },
  { id: "scenario",  icon: "⚡", label: "Scenario Engine"   },
  { id: "optimize",  icon: "🎯", label: "Optimization"      },
  { id: "portfolio", icon: "📊", label: "Portfolio"         },
  { id: "etl",       icon: "🔄", label: "ETL Pipeline"      },
  { id: "sql",       icon: "🗄️", label: "SQL Explorer"      },
  { id: "agents",    icon: "🤖", label: "AI Agents"         },
];

function Sidebar({ tab, setTab, onClose }) {
  return (
    <aside className="sidebar-desktop sidebar-mobile" style={{ width: 215, background: C.panel, borderRight: `1px solid ${C.line}`, height: "100vh", position: "sticky", top: 0, display: "flex", flexDirection: "column", overflowY: "auto", flexShrink: 0 }}>
      {/* Brand */}
      <div style={{ padding: "18px 16px 14px", borderBottom: `1px solid ${C.line}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: C.blue, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>🇮🇳</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.ink, letterSpacing: "-.02em" }}>Treazy AI</div>
            <div style={{ fontSize: 10, color: C.faint, textTransform: "uppercase", letterSpacing: ".06em" }}>Treasury Intelligence</div>
          </div>
        </div>
        {onClose && <button onClick={onClose} style={{ background:"none", border:"none", fontSize:22, cursor:"pointer", color:C.sub, lineHeight:1, padding:"0 2px", flexShrink:0 }}>×</button>}
      </div>

      {/* Nav */}
      <nav style={{ padding: "10px 8px", flex: 1 }}>
        <div style={{ fontSize: 10, color: C.faint, textTransform: "uppercase", letterSpacing: ".1em", padding: "6px 10px 4px", fontWeight: 600 }}>Modules</div>
        {NAV.map(n => {
          const on = tab === n.id;
          return (
            <button key={n.id} onClick={() => setTab(n.id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", marginBottom: 1, borderRadius: 7, border: "none", background: on ? `${C.blue}12` : "transparent", color: on ? C.blue : C.sub, fontSize: 13, fontWeight: on ? 600 : 400, cursor: "pointer", textAlign: "left", borderLeft: `2px solid ${on ? C.blue : "transparent"}`, transition: "all .12s" }}>
              <span style={{ fontSize: 15, opacity: on ? 1 : .65 }}>{n.icon}</span>
              {n.label}
              {n.id === "agents" && <span style={{ marginLeft: "auto" }}><Badge text="AI" type="purple" /></span>}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div style={{ padding: "12px 16px", borderTop: `1px solid ${C.line}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
          <LiveDot />
          <span style={{ fontSize: 11, color: C.sub }}>FastAPI connected</span>
        </div>
        <div style={{ fontSize: 10, color: C.faint }}>Python + SQLite · CrewAI + Groq</div>
      </div>
    </aside>
  );
}

/* ═══════════════════════ HEADER ═════════════════════════════════ */
function Header({ tab, totalCr, onMenuClick }) {
  const n = NAV.find(x => x.id === tab);
  return (
    <header style={{ height: 54, borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", background: "rgba(255,255,255,.92)", backdropFilter: "blur(10px)", position: "sticky", top: 0, zIndex: 10, flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button className="mob-btn" onClick={onMenuClick} style={{ display:"none", background:"none", border:"none", fontSize:22, cursor:"pointer", color:C.sub, padding:"4px 6px 4px 0", alignItems:"center" }}>☰</button>
        <span style={{ fontSize: 16 }}>{n?.icon}</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{n?.label}</div>
          <div className="hide-mob" style={{ fontSize: 11, color: C.faint }}>Treazy AI · Python FastAPI + SQLite</div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {totalCr != null && (
          <>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, color: C.faint, textTransform: "uppercase", letterSpacing: ".07em" }}>Total Liquidity</div>
              <div style={{ fontFamily: C.mono, fontSize: 15, fontWeight: 700, color: C.blue }}>{fCr(totalCr)}</div>
            </div>
            <div style={{ width: 1, height: 28, background: C.line }} />
          </>
        )}
        <div style={{ width: 30, height: 30, borderRadius: "50%", background: `${C.blue}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>👤</div>
      </div>
    </header>
  );
}

/* ═══════════════════════ INFO BOX ═══════════════════════════════ */
function InfoBox({ children, type = "info" }) {
  const s = {
    info:    { bg: "#EEF2FF", border: "#A5B4FC", color: "#3730A3" },
    warning: { bg: "#FFFBEB", border: "#FCD34D", color: "#92400E" },
    success: { bg: "#F0FDF4", border: "#86EFAC", color: "#15803D" },
  }[type];
  return (
    <div style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: s.color, lineHeight: 1.7 }}>
      {children}
    </div>
  );
}

/* ═══════════════════════ TAB: DASHBOARD ════════════════════════ */
function DashboardTab({ onTotalLoaded }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api("/dashboard");
      setData(d);
      onTotalLoaded?.(d.kpis?.total_balance_cr);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const refreshMarket = async () => {
    setRefreshing(true);
    await apiPost("/market/refresh", {});
    await load();
    setRefreshing(false);
  };

  if (loading) return <Spinner />;
  if (!data) return <div style={{ color: C.red, padding: 20 }}>Backend not running. Start: <code>uvicorn main:app --reload</code></div>;

  const { kpis, entities, market } = data;
  const forex  = market.filter(m => m.data_type === "forex");
  const macro  = market.filter(m => m.data_type === "macro");
  const equity = market.filter(m => m.data_type === "equity");
  const usdinr = forex.find(f => f.ticker === "USDINR")?.price ?? 83.42;
  const repo   = macro.find(m => m.ticker === "RBI_REPO")?.price ?? 6.5;

  return (
    <>
      {/* Market ticker */}
      <div style={{ background: C.blue, borderRadius: 8, padding: "10px 18px", marginBottom: 16, display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center" }}>
        {[
          { label: "USD/INR", value: `₹${usdinr}`, live: true },
          { label: "EUR/INR", value: `₹${forex.find(f=>f.ticker==="EURINR")?.price ?? 90.18}`, live: true },
          { label: "RBI Repo", value: `${repo}%`, live: false },
          { label: "CRR", value: "4.5%", live: false },
          { label: "SLR", value: "18%", live: false },
          ...equity.slice(0,2).map(e => ({ label: e.ticker.replace(".NS","").replace("^",""), value: `${e.price.toLocaleString("en-IN")}`, change: e.change_pct, live: true })),
        ].map((m, i) => (
          <div key={i} style={{ borderRight: i < 5 ? "1px solid rgba(255,255,255,.2)" : "none", paddingRight: 20 }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,.65)", textTransform: "uppercase", letterSpacing: ".07em" }}>{m.label}</div>
            <div style={{ fontFamily: C.mono, fontSize: 14, fontWeight: 700, color: "#fff" }}>{m.value}</div>
            {m.change != null && <div style={{ fontSize: 10, color: m.change >= 0 ? "#6EE7B7" : "#FCA5A5" }}>{m.change >= 0 ? "▲" : "▼"} {Math.abs(m.change).toFixed(2)}%</div>}
            {m.live && <div style={{ fontSize: 9, color: "rgba(255,255,255,.5)" }}>Live</div>}
          </div>
        ))}
        <button onClick={refreshMarket} disabled={refreshing} style={{ marginLeft: "auto", background: "rgba(255,255,255,.15)", border: "1px solid rgba(255,255,255,.3)", borderRadius: 6, color: "#fff", fontSize: 11, padding: "5px 12px", cursor: "pointer" }}>
          {refreshing ? "…" : "↻ Refresh"}
        </button>
      </div>

      {/* KPIs */}
      <div className="grid4" style={{ marginBottom: 16 }}>
        <Kpi label="Total Liquidity"  value={fCr(kpis.total_balance_cr)} sub="All 5 entities"       accent={C.blue}   icon="💰" trend={8}  />
        <Kpi label="Inflow (30d)"     value={fCr(kpis.inflow_30d_cr)}   sub="Customer collections" accent={C.green}  icon="📥" trend={12} />
        <Kpi label="Outflow (30d)"    value={fCr(kpis.outflow_30d_cr)}  sub="GST+Salary+Vendors"   accent={C.amber}  icon="📤"            />
        <Kpi label="Open Anomalies"   value={kpis.open_anomalies}        sub="ML-flagged events"    accent={C.red}    icon="⚠️"            />
      </div>

      {/* Entity positions */}
      <Card title="Business entity positions" sub="Current cash vs minimum operating floor · Amounts in ₹ Crore" mb={16}>
        <div className="grid3" style={{ gap: 12 }}>
          {entities.map(e => {
            const pct = Math.min(100, (e.balance_cr / (e.floor_cr * 5 || 1)) * 100);
            const rc  = { low: C.green, medium: C.amber, high: C.red }[e.risk_level] ?? C.blue;
            return (
              <div key={e.id} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 8, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{e.name}</div>
                    <div style={{ fontSize: 10, color: C.faint }}>{e.city}</div>
                  </div>
                  <Badge text={e.risk_level} type={e.risk_level === "low" ? "success" : e.risk_level === "medium" ? "warning" : "error"} />
                </div>
                <div style={{ fontFamily: C.mono, fontSize: 18, fontWeight: 700, color: C.blue, marginBottom: 8 }}>{fCr(e.balance_cr)}</div>
                <div style={{ height: 3, background: C.line, borderRadius: 2, overflow: "hidden", marginBottom: 4 }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: rc, borderRadius: 2, transition: "width .8s ease" }} />
                </div>
                <div style={{ fontSize: 10, color: C.faint, fontFamily: C.mono }}>Floor: {fCr(e.floor_cr)}</div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Indian financial calendar */}
      <Card title="🗓️ Indian financial calendar" sub="Key dates that create cash flow spikes every month">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            { date: "1st",    color: C.amber,  event: "Salary disbursement",                       impact: "Large fixed outflow — plan 2 days in advance" },
            { date: "15th",   color: C.red,    event: "Advance Tax (Mar/Jun/Sep/Dec only)",         impact: "Quarterly tax payment — one of the biggest outflows" },
            { date: "20th",   color: C.red,    event: "GST payment deadline (CGST + SGST + IGST)",  impact: "Every month — no exceptions, interest 18% p.a. if missed" },
            { date: "26–31st",color: C.green,  event: "Month-end receivables collection",           impact: "Customers pay invoices → inflow surge" },
            { date: "Oct–Nov",color: C.blue,   event: "Diwali festive season",                      impact: "Retail/FMCG: inflow up 80–120% over baseline" },
            { date: "Mar 31", color: C.purple, event: "Financial year end (India FY = Apr–Mar)",    impact: "Advance tax, audit, balance sheet finalisation" },
          ].map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 12, alignItems: "center", padding: "10px 12px", background: C.card, border: `1px solid ${C.line}`, borderRadius: 8 }}>
              <div style={{ background: item.color, color: "#fff", borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 700, fontFamily: C.mono, flexShrink: 0, minWidth: 52, textAlign: "center" }}>{item.date}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{item.event}</div>
                <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>{item.impact}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

/* ═══════════════════════ TAB: FORECASTING ══════════════════════ */
function ForecastTab() {
  const [entity, setEntity] = useState("HQ");
  const [history, setHistory] = useState([]);
  const [forecast, setForecast] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [histLoading, setHL]    = useState(true);

  useEffect(() => {
    setHL(true);
    api(`/cashflow/${entity}?days=90`)
      .then(d => setHistory(d.data || []))
      .finally(() => setHL(false));
  }, [entity]);

  const runForecast = async () => {
    setLoading(true); setForecast(null);
    try {
      const d = await apiPost(`/forecast/${entity}?days_ahead=30`, {});
      setForecast(d);
    } catch (e) { alert(e.message); }
    setLoading(false);
  };

  const chartData = [
    ...history.slice(-30).map(d => ({ label: d.label, actual: d.balance_cr })),
    ...(forecast?.forecasts || []).map(d => ({ label: d.label, predicted: d.pred_cr, lo: d.lo_cr, hi: d.hi_cr })),
  ];

  return (
    <>
      <InfoBox>
        <strong>How ARIMA works:</strong> AR = uses 2 past balance values to predict next. I = we difference the series once to remove trend (make it stationary). MA = corrects for 2 past errors. Trained on 90 days of real DB data. MAPE ~1–3% is production-grade.
      </InfoBox>

      <Card title="Cash balance forecast" sub="ARIMA(2,1,2) trained on real SQLite data. Blue = actual, purple dashed = AI prediction" mb={16}
        action={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {["HQ","BLR","DEL","KOL","CHN"].map(e => (
              <button key={e} onClick={() => setEntity(e)} style={{ padding: "5px 12px", borderRadius: 6, border: `1px solid ${entity===e?C.blue:C.line}`, background: entity===e?C.blue:"transparent", color: entity===e?"#fff":C.sub, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>{e}</button>
            ))}
            <button onClick={runForecast} disabled={loading} style={{ padding: "5px 14px", borderRadius: 6, border: "none", background: loading ? C.faint : C.indigo, color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
              {loading ? "Running…" : "▶ Run ARIMA"}
            </button>
          </div>
        }>
        {forecast && (
          <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
            {[
              { l: "Model",      v: forecast.model },
              { l: "MAPE",       v: `${forecast.mape_pct}%` },
              { l: "Forecast",   v: `${forecast.days_ahead} days` },
              { l: "Trained on", v: forecast.trained_on },
            ].map((m, i) => (
              <div key={i} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 7, padding: "7px 12px" }}>
                <div style={{ fontSize: 10, color: C.faint, textTransform: "uppercase" }}>{m.l}</div>
                <div style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 600, color: C.indigo, marginTop: 3 }}>{m.v}</div>
              </div>
            ))}
          </div>
        )}
        {histLoading ? <Spinner /> : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={chartData} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gA" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.blue}   stopOpacity={.18}/><stop offset="95%" stopColor={C.blue}   stopOpacity={0}/></linearGradient>
                <linearGradient id="gP" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.purple} stopOpacity={.15}/><stop offset="95%" stopColor={C.purple} stopOpacity={0}/></linearGradient>
              </defs>
              <CartesianGrid stroke={C.line} strokeDasharray="3 3"/>
              <XAxis dataKey="label" tick={{ fill: C.faint, fontSize: 10, fontFamily: C.mono }} tickLine={false} interval={6}/>
              <YAxis tick={{ fill: C.faint, fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `₹${v}Cr`}/>
              <Tooltip content={<CTip/>}/>
              <Legend wrapperStyle={{ fontSize: 11, color: C.sub }}/>
              <Area type="monotone" dataKey="actual"    name="Actual balance ₹Cr"  stroke={C.blue}   fill="url(#gA)" strokeWidth={2}   dot={false}/>
              <Area type="monotone" dataKey="predicted" name="ARIMA forecast ₹Cr"  stroke={C.purple} fill="url(#gP)" strokeWidth={2} strokeDasharray="5 3" dot={false}/>
              <Area type="monotone" dataKey="hi"        name="Upper band"          stroke={C.purple} fill="none" strokeWidth={1} strokeDasharray="2 3" dot={false} opacity={.4}/>
              <Area type="monotone" dataKey="lo"        name="Lower band"          stroke={C.purple} fill="none" strokeWidth={1} strokeDasharray="2 3" dot={false} opacity={.4}/>
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Card>

      <div className="grid2">
        <Card title="Daily inflows vs outflows" sub="GST on 20th · Salary on 1st spikes visible">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={history.slice(-30)} margin={{ top: 4, right: 6, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={C.line} strokeDasharray="3 3"/>
              <XAxis dataKey="label" tick={{ fill: C.faint, fontSize: 9, fontFamily: C.mono }} tickLine={false} interval={5}/>
              <YAxis tick={{ fill: C.faint, fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={v => `${v}Cr`}/>
              <Tooltip content={<CTip/>}/>
              <Legend wrapperStyle={{ fontSize: 11, color: C.sub }}/>
              <Bar dataKey="inflow_cr"  name="Inflow ₹Cr"  fill={C.green} radius={[3,3,0,0]}/>
              <Bar dataKey="outflow_cr" name="Outflow ₹Cr" fill={C.red}   radius={[3,3,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Net daily cash flow" sub="Positive = surplus day">
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={history.slice(-30)} margin={{ top: 4, right: 6, left: 0, bottom: 0 }}>
              <defs><linearGradient id="gN" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.teal} stopOpacity={.2}/><stop offset="95%" stopColor={C.teal} stopOpacity={0}/></linearGradient></defs>
              <CartesianGrid stroke={C.line} strokeDasharray="3 3"/>
              <XAxis dataKey="label" tick={{ fill: C.faint, fontSize: 9 }} tickLine={false} interval={5}/>
              <YAxis tick={{ fill: C.faint, fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={v => `${v}Cr`}/>
              <Tooltip content={<CTip/>}/>
              <ReferenceLine y={0} stroke={C.faint} strokeDasharray="3 2"/>
              <Area type="monotone" dataKey="net_cr" name="Net ₹Cr" stroke={C.teal} fill="url(#gN)" strokeWidth={1.5} dot={false}/>
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </>
  );
}

/* ═══════════════════════ TAB: ANOMALY ══════════════════════════ */
function AnomalyTab() {
  const [entity, setEntity]   = useState("HQ");
  const [result, setResult]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [sel, setSel]         = useState(null);
  const [allAnoms, setAll]    = useState(null);

  useEffect(() => {
    api("/anomalies").then(d => setAll(d));
  }, []);

  const run = async () => {
    setLoading(true); setResult(null); setSel(null);
    try { setResult(await apiPost(`/anomalies/detect/${entity}`, {})); }
    catch (e) { alert(e.message); }
    setLoading(false);
    api("/anomalies").then(d => setAll(d));
  };

  const sevColor = { low: C.amber, medium: C.amber, high: C.red, critical: "#7F1D1D" };

  return (
    <>
      <InfoBox>
        <strong>Isolation Forest:</strong> Randomly splits transaction data into partitions. Normal transactions cluster together and need MANY splits to isolate. Anomalies (duplicate payments, fraud) are statistically rare — they get isolated in FEW splits. Score 0→1, threshold 0.65. Uses 3 features: log(amount), direction (IN/OUT), balance change.
      </InfoBox>

      <Card title="Run Isolation Forest" sub="Trains on real transaction data from SQLite → flags suspicious events" mb={16}
        action={
          <div style={{ display: "flex", gap: 8 }}>
            {["HQ","BLR","DEL","KOL","CHN"].map(e => (
              <button key={e} onClick={() => setEntity(e)} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${entity===e?C.red:C.line}`, background: entity===e?C.red:"transparent", color: entity===e?"#fff":C.sub, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>{e}</button>
            ))}
            <button onClick={run} disabled={loading} style={{ padding: "5px 16px", borderRadius: 6, border: "none", background: loading?C.faint:C.red, color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
              {loading ? "Scanning…" : "🔍 Run Detection"}
            </button>
          </div>
        }>
        {loading && <Spinner />}
        {result && (
          <>
            <div className="grid4" style={{ marginBottom: 14 }}>
              {[
                { l: "Checked",    v: result.total_checked,    c: C.blue   },
                { l: "Anomalies",  v: result.anomalies_found,  c: C.red    },
                { l: "Threshold",  v: result.threshold,        c: C.amber  },
                { l: "Model",      v: "Isolation Forest",       c: C.purple },
              ].map((m, i) => (
                <div key={i} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 7, padding: "8px 12px" }}>
                  <div style={{ fontSize: 10, color: C.faint, textTransform: "uppercase" }}>{m.l}</div>
                  <div style={{ fontFamily: C.mono, fontSize: 14, fontWeight: 700, color: m.c, marginTop: 3 }}>{m.v}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {result.anomalies.map((a, i) => (
                <div key={i} onClick={() => setSel(sel?.date === a.date && sel?.score === a.score ? null : a)}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 14px", background: sel?.score===a.score?`${C.red}08`:C.card, border: `1px solid ${a.score>.8?C.red+"50":C.line}`, borderRadius: 8, cursor: "pointer" }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span style={{ fontSize: 16 }}>{a.score > .85 ? "🚨" : "⚡"}</span>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, fontFamily: C.mono }}>{a.date}</div>
                      <div style={{ fontSize: 11, color: C.sub }}>{a.direction} · {fCr(a.amount_cr)}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <Badge text={a.severity} type={a.severity === "critical" ? "error" : a.severity === "high" ? "error" : "warning"} />
                    <div style={{ fontFamily: C.mono, fontSize: 15, fontWeight: 700, color: sevColor[a.severity] || C.red }}>{a.score.toFixed(3)}</div>
                  </div>
                </div>
              ))}
            </div>
            {sel && (
              <div className="fade" style={{ marginTop: 12, background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: 14 }}>
                <div style={{ fontWeight: 700, color: C.red, fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>🔎 Root cause · {sel.date}</div>
                <div style={{ fontSize: 12, color: C.ink, lineHeight: 1.8 }}>
                  <strong>Direction:</strong> {sel.direction} &nbsp;·&nbsp; <strong>Amount:</strong> {fCr(sel.amount_cr)} &nbsp;·&nbsp; <strong>Type:</strong> {sel.type}<br/>
                  <br/>{sel.description}<br/>
                  <br/><span style={{ color: C.amber, fontWeight: 600 }}>Action:</span> Cross-check in Tally/ERP. Verify bank RTGS statement. Escalate to treasury controller if unexplained within 24 hours.
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {allAnoms && (
        <Card title={`All open anomalies (${allAnoms.count})`} sub="From DB — all entities combined" noPad>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>{["Entity","City","Type","Severity","Score","Amount","Date"].map(h => (
                  <th key={h} style={{ padding: "9px 12px", textAlign: "left", color: C.faint, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em", borderBottom: `1px solid ${C.line}`, background: C.card }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {allAnoms.anomalies.map((a, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.line}` }}>
                    <td style={{ padding: "9px 12px", fontWeight: 500 }}>{a.entity}</td>
                    <td style={{ padding: "9px 12px", color: C.sub }}>{a.city}</td>
                    <td style={{ padding: "9px 12px", fontFamily: C.mono, fontSize: 11 }}>{a.type}</td>
                    <td style={{ padding: "9px 12px" }}><Badge text={a.severity} type={a.severity==="critical"||a.severity==="high"?"error":"warning"}/></td>
                    <td style={{ padding: "9px 12px", fontFamily: C.mono, color: C.red, fontWeight: 600 }}>{a.score.toFixed(3)}</td>
                    <td style={{ padding: "9px 12px", fontFamily: C.mono }}>{fCr(a.amount_cr)}</td>
                    <td style={{ padding: "9px 12px", color: C.sub, fontFamily: C.mono, fontSize: 11 }}>{a.txn_date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}

/* ═══════════════════════ TAB: SCENARIO ════════════════════════ */
function ScenarioTab() {
  const [shock, setShock]     = useState(0);
  const [data, setData]       = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api(`/scenario?shock=${shock}`).then(d => setData(d.data || [])).finally(() => setLoading(false));
  }, [shock]);

  const shocks = [
    { label: "Baseline",  val: 0, icon: "🟢", desc: "Normal operations" },
    { label: "Mild",      val: 1, icon: "🟡", desc: "GST rate +2%, RBI rate +50bps" },
    { label: "Moderate",  val: 2, icon: "🟠", desc: "USD/INR +5%, AR delays +15 days" },
    { label: "Severe",    val: 3, icon: "🔴", desc: "Credit crunch + collections slow" },
    { label: "Crisis",    val: 4, icon: "💀", desc: "COVID-2020 style lockdown scenario" },
  ];

  return (
    <>
      <InfoBox>
        <strong>Monte Carlo scenario engine:</strong> We take real historical cash flow data from SQLite and apply parameterised shock multipliers. Each button adjusts collection rates, outflow timing, and FX impact. Indian-specific shocks include GST rate changes, RBI repo rate hikes, RTGS settlement delays, and festive demand collapses.
      </InfoBox>

      <Card title="What-if scenario engine" sub="Real data from DB · Select stress level to reshape liquidity projection" mb={16}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          {shocks.map(s => (
            <button key={s.val} onClick={() => setShock(s.val)} style={{ padding: "8px 14px", borderRadius: 7, border: `1px solid ${shock===s.val?C.blue:C.line}`, background: shock===s.val?C.blue:"transparent", color: shock===s.val?"#fff":C.sub, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              {s.icon} {s.label}
            </button>
          ))}
        </div>
        {shock > 0 && (
          <div style={{ background: "#FFFBEB", border: "1px solid #FCD34D", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: C.amber, lineHeight: 1.7 }}>
            <strong>⚠ {shocks[shock].label} scenario: </strong>{shocks[shock].desc}
          </div>
        )}
        {loading ? <Spinner /> : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gO" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.green}  stopOpacity={.18}/><stop offset="95%" stopColor={C.green}  stopOpacity={0}/></linearGradient>
                <linearGradient id="gB" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.blue}   stopOpacity={.18}/><stop offset="95%" stopColor={C.blue}   stopOpacity={0}/></linearGradient>
                <linearGradient id="gS" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.red}    stopOpacity={.15}/><stop offset="95%" stopColor={C.red}    stopOpacity={0}/></linearGradient>
              </defs>
              <CartesianGrid stroke={C.line} strokeDasharray="3 3"/>
              <XAxis dataKey="month" tick={{ fill: C.faint, fontSize: 11, fontFamily: C.mono }} tickLine={false}/>
              <YAxis tick={{ fill: C.faint, fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `₹${v}Cr`}/>
              <Tooltip content={<CTip/>}/>
              <Legend wrapperStyle={{ fontSize: 11, color: C.sub }}/>
              <Area type="monotone" dataKey="optimistic" name="Optimistic"  stroke={C.green}  fill="url(#gO)" strokeWidth={1.5} dot={false}/>
              <Area type="monotone" dataKey="baseline"   name="Baseline"    stroke={C.blue}   fill="url(#gB)" strokeWidth={2}   dot={false}/>
              <Area type="monotone" dataKey="stressed"   name="Stressed"    stroke={C.red}    fill="url(#gS)" strokeWidth={shock>0?2:1} strokeDasharray={shock>0?undefined:"4 2"} dot={false}/>
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card title="Indian-specific sensitivity matrix" sub="How each variable independently impacts liquidity">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>{["Variable","Current value","Downside (−2σ)","Baseline","Upside (+2σ)"].map(h => (
                <th key={h} style={{ padding: "9px 14px", textAlign: "left", color: C.faint, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em", borderBottom: `1px solid ${C.line}` }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {[
                { v:"RBI Repo Rate",          c:"6.50%",     d:"-₹18Cr",  u:"+₹22Cr" },
                { v:"USD/INR Rate",           c:"₹83.42",    d:"-₹42Cr",  u:"+₹38Cr" },
                { v:"GST Rate Change",        c:"18% GST",   d:"-₹35Cr",  u:"+₹28Cr" },
                { v:"AR Collection (DSO)",    c:"28 days",   d:"+₹85Cr",  u:"-₹72Cr" },
                { v:"Vendor Payment (DPO)",   c:"22 days",   d:"-₹65Cr",  u:"+₹55Cr" },
                { v:"Advance Tax (Q-end)",    c:"₹120Cr/Qtr",d:"+₹0",    u:"-₹120Cr"},
                { v:"Revenue Growth",         c:"+12% YoY",  d:"-₹280Cr", u:"+₹260Cr"},
              ].map((r, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${C.line}` }}>
                  <td style={{ padding: "10px 14px", fontWeight: 500 }}>{r.v}</td>
                  <td style={{ padding: "10px 14px", color: C.sub,   fontFamily: C.mono, fontSize: 11 }}>{r.c}</td>
                  <td style={{ padding: "10px 14px", color: C.red,   fontFamily: C.mono, fontWeight: 600 }}>{r.d}</td>
                  <td style={{ padding: "10px 14px", color: C.faint  }}>—</td>
                  <td style={{ padding: "10px 14px", color: C.green, fontFamily: C.mono, fontWeight: 600 }}>{r.u}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

/* ═══════════════════════ TAB: OPTIMIZE ════════════════════════ */
function OptimizeTab() {
  const [result, setResult]   = useState(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try { setResult(await api("/optimize")); }
    catch (e) { alert(e.message); }
    setLoading(false);
  };

  return (
    <>
      <InfoBox>
        <strong>LP Optimizer:</strong> Linear programming objective: maximise Σ(balance_i × yield_i). Constraint: each entity balance ≥ minimum floor. Excess cash above the floor is swept to HDFC/SBI Overnight Liquid MF at ~7% p.a. vs 0% sitting idle in current account. In India, a ₹100Cr idle balance at 7% = ₹7Cr/year recovered.
      </InfoBox>

      <Card title="Cash positioning optimizer" sub="LP solver · Sweep idle cash to Overnight Liquid MFs · Real Indian yields" mb={16}>
        {!result ? (
          <button onClick={run} disabled={loading} style={{ background: loading?C.faint:C.blue, color:"#fff", border:"none", borderRadius:8, padding:"12px 28px", fontSize:14, fontWeight:700, cursor:loading?"default":"pointer", display:"flex", alignItems:"center", gap:10 }}>
            {loading ? <><span style={{ display:"inline-block", width:14, height:14, border:"2px solid #fff", borderTopColor:"transparent", borderRadius:"50%", animation:"spin .7s linear infinite" }}/> Optimising…</> : "🚀 Run LP Optimizer"}
          </button>
        ) : (
          <>
            <div className="grid4" style={{ marginBottom: 16 }}>
              <Kpi label="Total sweep"   value={fCr(result.total_sweep_cr)}  sub="Idle cash found"     accent={C.green}  icon="💵"/>
              <Kpi label="Annual gain"   value={fCr(result.annual_gain_cr)}  sub="At 7% Liquid MF"    accent={C.blue}   icon="📈"/>
              <Kpi label="Instrument"    value="Liquid MF"                   sub="Overnight fund"     accent={C.purple} icon="🏦"/>
              <Kpi label="Yield"         value={`${result.yield_pct}%`}      sub="Annualised p.a."    accent={C.amber}  icon="✨"/>
            </div>
            <div style={{ fontSize: 12, color: C.sub, marginBottom: 10 }}>{result.note}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {result.actions.map((a, i) => (
                <div key={i} className="fade" style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 14px", background:C.card, border:`1px solid ${C.line}`, borderRadius:8 }}>
                  <div style={{ display:"flex", gap:12, alignItems:"center" }}>
                    <div style={{ width:26, height:26, borderRadius:6, background:`${C.blue}12`, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:C.mono, fontSize:11, fontWeight:700, color:C.blue, flexShrink:0 }}>{i+1}</div>
                    <div>
                      <div style={{ fontSize:13, fontWeight:600 }}>{a.entity} · {a.city}</div>
                      <div style={{ fontSize:11, color:C.sub, marginTop:2 }}>{a.action}</div>
                      <div style={{ fontSize:10, color:C.faint, fontFamily:C.mono, marginTop:2 }}>Balance: {fCr(a.balance_cr)} · Floor: {fCr(a.floor_cr)} · Excess: {fCr(a.excess_cr)}</div>
                    </div>
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:5, alignItems:"flex-end", flexShrink:0, marginLeft:12 }}>
                    <Badge text={a.priority} type={a.priority==="High"?"error":a.priority==="Medium"?"warning":"success"}/>
                    {a.annual_gain_cr > 0 && <span style={{ fontSize:11, color:C.green, fontFamily:C.mono }}>+{fCr(a.annual_gain_cr)}/yr</span>}
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setResult(null)} style={{ marginTop:12, background:"transparent", border:`1px solid ${C.line}`, borderRadius:6, padding:"6px 14px", color:C.sub, cursor:"pointer", fontSize:11 }}>↺ Re-run</button>
          </>
        )}
      </Card>

      <Card title="Indian investment instruments for idle cash" sub="Where treasury puts money instead of letting it sit idle">
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {[
            { name:"Overnight Liquid MF (HDFC/SBI/ICICI)",     yield:"~7.0-7.2%", risk:"Very Low",  liquidity:"Same-day T+0",  note:"Best for daily surplus. No lock-in. SLR-ineligible." },
            { name:"91-Day T-Bill (Government of India)",       yield:"~6.9%",     risk:"Zero",      liquidity:"At maturity",   note:"SLR-eligible. Risk-free. Sold via RBI auction." },
            { name:"G-Sec 10Y Benchmark (7.18% GS 2033)",      yield:"~7.28%",    risk:"Mkt risk",  liquidity:"Exchange/OTC",  note:"SLR-eligible. Counts toward 18% SLR mandate." },
            { name:"Bank CD — 90 Day (HDFC/ICICI)",            yield:"~7.4-7.6%", risk:"Bank risk", liquidity:"At maturity",   note:"Higher yield. DICGC insured up to ₹5L per bank." },
            { name:"CP — Commercial Paper (AAA rated)",         yield:"~7.5-8.0%", risk:"Credit",    liquidity:"Secondary mkt", note:"Corporate short-term borrowing. Higher yield, higher risk." },
          ].map((inst, i) => (
            <div key={i} style={{ display:"flex", gap:14, padding:"10px 12px", background:C.card, border:`1px solid ${C.line}`, borderRadius:8 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:600 }}>{inst.name}</div>
                <div style={{ fontSize:11, color:C.sub, marginTop:2 }}>{inst.note}</div>
              </div>
              <div style={{ display:"flex", gap:8, alignItems:"center", flexShrink:0 }}>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontFamily:C.mono, fontSize:13, fontWeight:700, color:C.green }}>{inst.yield}</div>
                  <div style={{ fontSize:10, color:C.faint }}>{inst.liquidity}</div>
                </div>
                <Badge text={inst.risk} type={inst.risk==="Zero"||inst.risk==="Very Low"?"success":inst.risk==="Bank risk"||inst.risk==="Mkt risk"?"warning":"error"}/>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

/* ═══════════════════════ TAB: PORTFOLIO ════════════════════════ */
function PortfolioTab() {
  const [data, setData] = useState(null);
  const [comp, setComp] = useState(null);

  useEffect(() => {
    api("/portfolio").then(setData);
    api("/compliance").then(setComp);
  }, []);

  return (
    <>
      {data && (
        <Card title="Investment portfolio" sub="G-Secs, T-Bills, Liquid MFs — idle cash put to work" mb={16}>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead>
                <tr>{["Entity","Instrument","Market Value","YTM","Duration","SLR?"].map(h => (
                  <th key={h} style={{ padding:"9px 12px", textAlign:"left", color:C.faint, fontSize:10, fontWeight:600, textTransform:"uppercase", letterSpacing:".06em", borderBottom:`1px solid ${C.line}`, background:C.card }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {data.instruments.map((p, i) => (
                  <tr key={i} style={{ borderBottom:`1px solid ${C.line}` }}>
                    <td style={{ padding:"9px 12px", fontWeight:500 }}>{p.entity}</td>
                    <td style={{ padding:"9px 12px" }}>
                      <div style={{ fontWeight:500 }}>{p.name}</div>
                      <Badge text={p.type} type="teal"/>
                    </td>
                    <td style={{ padding:"9px 12px", fontFamily:C.mono, fontWeight:600, color:C.blue }}>{fCr(p.market_value_cr)}</td>
                    <td style={{ padding:"9px 12px", fontFamily:C.mono, color:C.green, fontWeight:600 }}>{fPct(p.ytm)}</td>
                    <td style={{ padding:"9px 12px", fontFamily:C.mono, color:C.sub }}>{p.duration?.toFixed(2)}y</td>
                    <td style={{ padding:"9px 12px" }}>{p.slr_eligible ? <Badge text="SLR ✓" type="success"/> : <Badge text="No" type="info"/>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {comp && (
        <Card title="RBI regulatory compliance — CRR / SLR / LCR" sub="Mandatory ratios. Breach = RBI penalty. Green = safe, Red = breach">
          <InfoBox>
             CRR = 4.5% of deposits must be kept with RBI as cash (no interest). SLR = 18% must be in govt securities (G-Secs, T-Bills). LCR ≥ 100% = must hold enough liquid assets to survive 30-day stress. Breach of CRR = 3% penalty p.a. SLR breach = 5% penalty.
          </InfoBox>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {comp.ratios.slice(0, 6).map((r, i) => {
              const crrOk = r.crr.actual >= r.crr.required;
              const slrOk = r.slr.actual >= r.slr.required;
              const lcrOk = r.lcr.actual >= r.lcr.required;
              return (
                <div key={i} style={{ display:"flex", gap:12, alignItems:"center", padding:"10px 14px", background:C.card, border:`1px solid ${C.line}`, borderRadius:8 }}>
                  <div style={{ minWidth:80, fontSize:12, fontFamily:C.mono, color:C.sub }}>{r.date}</div>
                  {[
                    { label:"CRR", actual:r.crr.actual, req:r.crr.required, ok:crrOk },
                    { label:"SLR", actual:r.slr.actual, req:r.slr.required, ok:slrOk },
                    { label:"LCR", actual:r.lcr.actual, req:r.lcr.required, ok:lcrOk },
                  ].map((rat, j) => (
                    <div key={j} style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <span style={{ fontSize:11, color:C.sub }}>{rat.label}:</span>
                      <span style={{ fontFamily:C.mono, fontSize:12, fontWeight:700, color:rat.ok?C.green:C.red }}>{rat.actual?.toFixed(1)}%</span>
                      <span style={{ fontSize:10, color:C.faint }}>/ {rat.req}%</span>
                      <Badge text={rat.ok?"✓ OK":"⚠ NEAR"} type={rat.ok?"success":"warning"}/>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </>
  );
}

/* ═══════════════════════ TAB: ETL ══════════════════════════════ */
function EtlTab() {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(null);
  const [log, setLog]        = useState([
    { t:"08:01:12", msg:"Tally Prime sync completed — 8,420 records ingested", level:"success" },
    { t:"08:00:45", msg:"RBI DBIE API updated — Repo: 6.5%, CRR: 4.5%, SLR: 18%", level:"info" },
    { t:"07:59:33", msg:"Zoho Books connector lost connection — reconnecting…", level:"error" },
    { t:"07:58:22", msg:"SBI Corporate Net latency spike — 890ms (threshold 500ms)", level:"warning" },
    { t:"07:55:00", msg:"GSTN compliance feed synced — 312 GST records", level:"success" },
    { t:"07:50:11", msg:"RazorpayX: 2,840 payment events processed", level:"info" },
  ]);

  useEffect(() => {
    api("/etl/status").then(d => { setData(d); setLoading(false); });
  }, []);

  const trigger = async (name) => {
    setRunning(name);
    const t = new Date().toTimeString().slice(0,8);
    setLog(l => [{ t, msg:`Manual trigger: ${name} — syncing…`, level:"info" }, ...l.slice(0,9)]);
    await new Promise(r => setTimeout(r, 2000));
    setLog(l => [{ t:new Date().toTimeString().slice(0,8), msg:`${name} sync completed successfully`, level:"success" }, ...l.slice(0,9)]);
    setRunning(null);
  };

  const lc = { success:C.green, warning:C.amber, error:C.red, info:C.blue };

  if (loading) return <Spinner />;

  return (
    <>
      <InfoBox>
        <strong>ETL = Extract, Transform, Load:</strong> Extract = pull data from Tally, bank APIs, GSTN, RBI. Transform = clean it, convert currency, remove duplicates, map to our schema. Load = save into SQLite. Then ARIMA and Isolation Forest run on this clean data. This is what separates a toy project from a production system.
      </InfoBox>

      <div className="grid4" style={{ marginBottom:16 }}>
        <Kpi label="Total Records"  value={data.total_records?.toLocaleString("en-IN")} sub="In SQLite DB"      accent={C.blue}  icon="📦"/>
        <Kpi label="Active Sources" value={data.connectors.filter(c=>c.status==="success").length} sub={`of ${data.connectors.length} connectors`} accent={C.green} icon="✅"/>
        <Kpi label="Warnings"       value={data.connectors.filter(c=>c.status==="warning").length} sub="High latency"    accent={C.amber} icon="⚠️"/>
        <Kpi label="Errors"         value={data.connectors.filter(c=>c.status==="error").length}   sub="Needs attention" accent={C.red}   icon="❌"/>
      </div>

      <div className="grid2" style={{ marginBottom:16 }}>
        <Card title="ETL Connectors — Indian data sources" sub="Click ▶ Run to simulate manual trigger" noPad>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead>
                <tr>{["Source","Type","Records","Status","Latency",""].map(h => (
                  <th key={h} style={{ padding:"8px 12px", textAlign:"left", color:C.faint, fontSize:10, fontWeight:600, textTransform:"uppercase", letterSpacing:".06em", borderBottom:`1px solid ${C.line}`, background:C.card }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {data.connectors.map((c, i) => (
                  <tr key={i} style={{ borderBottom:`1px solid ${C.line}` }}>
                    <td style={{ padding:"9px 12px", fontWeight:500 }}>{c.name}</td>
                    <td style={{ padding:"9px 12px" }}><Badge text={c.type} type="info"/></td>
                    <td style={{ padding:"9px 12px", fontFamily:C.mono, fontSize:11, color:C.sub }}>{c.records.toLocaleString("en-IN")}</td>
                    <td style={{ padding:"9px 12px" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                        {c.status==="success" && <LiveDot color={C.green} size={7}/>}
                        {c.status==="warning" && <div style={{ width:7,height:7,borderRadius:"50%",background:C.amber }}/>}
                        {c.status==="error"   && <div style={{ width:7,height:7,borderRadius:"50%",background:C.red }}/>}
                        <Badge text={c.status} type={c.status}/>
                      </div>
                    </td>
                    <td style={{ padding:"9px 12px", fontFamily:C.mono, fontSize:11, color:C.sub }}>{c.latency_ms ? `${c.latency_ms}ms` : "—"}</td>
                    <td style={{ padding:"9px 12px" }}>
                      <button onClick={() => trigger(c.name)} disabled={!!running} style={{ background:C.blue, color:"#fff", border:"none", borderRadius:5, padding:"3px 10px", fontSize:10, cursor:running?"default":"pointer", opacity:running?0.5:1, fontWeight:500 }}>
                        {running===c.name ? <span style={{ display:"inline-block", width:9,height:9,border:"1.5px solid #fff",borderTopColor:"transparent",borderRadius:"50%",animation:"spin .7s linear infinite" }}/> : "▶ Run"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Live ingestion log" sub="Real-time pipeline events" action={<LiveDot/>}>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {log.map((l, i) => (
              <div key={i} className="fade" style={{ display:"flex", gap:8, alignItems:"flex-start", padding:"7px 10px", background:C.card, border:`1px solid ${C.line}`, borderRadius:7 }}>
                <span style={{ fontFamily:C.mono, fontSize:10, color:C.faint, flexShrink:0, marginTop:1 }}>{l.t}</span>
                <div style={{ width:6,height:6,borderRadius:"50%",background:lc[l.level]||C.faint,flexShrink:0,marginTop:4 }}/>
                <span style={{ fontSize:12, color:C.ink, lineHeight:1.5 }}>{l.msg}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Architecture */}
      <Card title="Data pipeline architecture" sub="Full flow: Sources → Extract → Transform → SQLite → ML Models">
        <div style={{ overflowX:"auto" }}>
          <div style={{ display:"flex", alignItems:"flex-start", gap:8, minWidth:700, padding:"8px 0" }}>
            {[
              { label:"Data Sources",   color:C.blue,   items:["Tally Prime","HDFC Bank","SBI Net","GSTN","RBI DBIE","NSE FeedQ","RazorpayX","Zoho Books","ExRate-API"] },
              { label:"Extract",        color:C.purple, items:["REST API calls","Webhook listen","File parsers","SFTP pull"] },
              { label:"Transform",      color:C.teal,   items:["Dedup","INR normalise","Schema map","Validate"] },
              { label:"SQLite / MySQL", color:C.green,  items:["transactions","forecasts","anomalies","market_data","agent_runs"] },
              { label:"ML + AI",        color:C.amber,  items:["ARIMA(2,1,2)","Isolation Forest","LP Optimizer","CrewAI Agents"] },
            ].map((stage, si) => (
              <div key={si} style={{ display:"flex", alignItems:"center", gap:6 }}>
                {si > 0 && <div style={{ color:C.faint, fontSize:22, padding:"0 2px", marginTop:20 }}>→</div>}
                <div style={{ minWidth:100 }}>
                  <div style={{ fontSize:9, fontWeight:700, color:stage.color, textTransform:"uppercase", letterSpacing:".06em", marginBottom:6, textAlign:"center" }}>{stage.label}</div>
                  {stage.items.map(item => (
                    <div key={item} style={{ background:`${stage.color}10`, border:`1px solid ${stage.color}30`, borderRadius:5, padding:"3px 6px", fontSize:10, marginBottom:3, textAlign:"center", color:C.ink, whiteSpace:"nowrap" }}>{item}</div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </>
  );
}

/* ═══════════════════════ TAB: SQL EXPLORER ═════════════════════ */
function SqlTab() {
  const PRESETS = [
    { label:"GST payments",   q:"SELECT entity_id, txn_date, amount_inr, description\nFROM transactions\nWHERE txn_type = 'gst_payment'\nORDER BY txn_date DESC LIMIT 12" },
    { label:"Salary events",  q:"SELECT entity_id, txn_date, amount_inr\nFROM transactions WHERE txn_type = 'salary'\nORDER BY txn_date DESC" },
    { label:"Open anomalies", q:"SELECT entity_id, anomaly_type, severity, anomaly_score, notes\nFROM anomalies WHERE is_resolved = 0\nORDER BY anomaly_score DESC" },
    { label:"Monthly summary",q:"SELECT entity_id,\n  strftime('%Y-%m', txn_date) as month,\n  ROUND(SUM(CASE WHEN direction='IN' THEN amount_inr ELSE 0 END)/10000000.0,2) as in_cr,\n  ROUND(SUM(CASE WHEN direction='OUT' THEN amount_inr ELSE 0 END)/10000000.0,2) as out_cr\nFROM transactions WHERE amount_inr > 0\nGROUP BY entity_id, month\nORDER BY month DESC LIMIT 20" },
    { label:"All tables",     q:"SELECT name, type FROM sqlite_master WHERE type='table' ORDER BY name" },
    { label:"Entities",       q:"SELECT id, name, city, risk_level,\n  ROUND(min_balance/10000000.0,2) as floor_cr\nFROM entities" },
    { label:"Advance tax",    q:"SELECT entity_id, txn_date, amount_inr, description\nFROM transactions WHERE txn_type = 'advance_tax'\nORDER BY txn_date DESC" },
    { label:"Market data",    q:"SELECT ticker, price, change_pct, data_type, source\nFROM market_data\nWHERE id IN (SELECT MAX(id) FROM market_data GROUP BY ticker)\nORDER BY data_type, ticker" },
    { label:"FX exposures",   q:"SELECT entity_id, currency_pair, exposure_type,\n  notional_amount, hedge_ratio, var_1day\nFROM fx_exposures" },
  ];

  const [query, setQuery]   = useState(PRESETS[0].q);
  const [result, setResult] = useState(null);
  const [error, setError]   = useState("");
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true); setError(""); setResult(null);
    try { setResult(await apiPost("/sql", { query })); }
    catch (e) { setError(e.message); }
    setLoading(false);
  };

  return (
    <>
      <InfoBox>
        <strong>SQL Explorer:</strong> This lets you run any SELECT query live on the real SQLite database.Shows relational schemas, SQL joins, GROUP BY, and financial data structures. The /api/sql endpoint only allows SELECT — no data modification.
      </InfoBox>

      <Card title="SQL query explorer" sub="Run any SELECT on the real SQLite database · 9 tables">
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:12 }}>
          {PRESETS.map((p, i) => (
            <button key={i} onClick={() => setQuery(p.q)} style={{ background:C.card, border:`1px solid ${C.line}`, borderRadius:6, padding:"4px 12px", fontSize:11, color:C.sub, cursor:"pointer" }}>{p.label}</button>
          ))}
        </div>
        <textarea value={query} onChange={e => setQuery(e.target.value)}
          style={{ width:"100%", height:130, fontFamily:C.mono, fontSize:12, background:C.card, border:`1px solid ${C.line}`, borderRadius:8, padding:"10px 12px", color:C.ink, resize:"vertical", marginBottom:10 }}
        />
        <button onClick={run} disabled={loading} style={{ background:loading?C.faint:C.blue, color:"#fff", border:"none", borderRadius:7, padding:"9px 22px", fontSize:13, fontWeight:600, cursor:loading?"default":"pointer", marginBottom:14 }}>
          {loading ? "Running…" : "▶ Execute SQL"}
        </button>
        {error && <div style={{ background:"#FEF2F2", border:"1px solid #FECACA", borderRadius:8, padding:"10px 14px", color:C.red, fontSize:12, fontFamily:C.mono, marginBottom:12 }}>{error}</div>}
        {result && (
          <div className="fade">
            <div style={{ fontSize:12, color:C.sub, marginBottom:8 }}>{result.count} rows returned</div>
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                <thead>
                  <tr>{result.columns.map(col => (
                    <th key={col} style={{ padding:"8px 12px", textAlign:"left", color:C.faint, fontSize:10, fontWeight:600, textTransform:"uppercase", letterSpacing:".06em", borderBottom:`1px solid ${C.line}`, background:C.card, fontFamily:C.mono, whiteSpace:"nowrap" }}>{col}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {result.rows.map((row, i) => (
                    <tr key={i} style={{ borderBottom:`1px solid ${C.line}` }}>
                      {result.columns.map(col => (
                        <td key={col} style={{ padding:"9px 12px", fontFamily:C.mono, fontSize:11, color:C.ink, whiteSpace:"nowrap" }}>{String(row[col] ?? "")}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}

/* ═══════════════════════ TAB: AI AGENTS ════════════════════════ */
function AgentsTab() {
  const [entity, setEntity]   = useState("all");
  const [horizon, setHorizon] = useState(30);
  const [result, setResult]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    api("/agents/history").then(setHistory);
  }, []);

  const run = async () => {
    setLoading(true); setResult(null); setElapsed(0);
    timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    try {
      const d = await apiPost("/agents/run", { entity_id: entity, horizon_days: horizon });
      setResult(d);
      api("/agents/history").then(setHistory);
    } catch (e) {
      setResult({ status:"failed", report: `Error: ${e.message}\n\nMake sure GROQ_API_KEY is set in backend/.env\nFalling back to rule-based report — re-try the endpoint.` });
    }
    clearInterval(timerRef.current);
    setLoading(false);
  };

  const formatReport = (text) => {
    if (!text) return null;
    return text.split("\n").map((line, i) => {
      if (line.startsWith("## ")) return <div key={i} style={{ fontWeight:700, fontSize:14, color:C.blue, marginTop:16, marginBottom:6, borderBottom:`1px solid ${C.line}`, paddingBottom:4 }}>{line.replace("## ","")}</div>;
      if (line.startsWith("• ") || line.startsWith("- ")) return <div key={i} style={{ fontSize:12, color:C.ink, lineHeight:1.7, paddingLeft:12, position:"relative" }}><span style={{ position:"absolute", left:0, color:C.blue }}>•</span>{line.replace(/^[•\-] /,"")}</div>;
      if (line.match(/^\d\./)) return <div key={i} style={{ fontSize:12, color:C.ink, lineHeight:1.7, marginBottom:4 }}><strong style={{ color:C.ink }}>{line}</strong></div>;
      if (line.startsWith("*") && line.endsWith("*")) return <div key={i} style={{ fontSize:11, color:C.faint, fontStyle:"italic", marginTop:8 }}>{line.replace(/\*/g,"")}</div>;
      return line ? <div key={i} style={{ fontSize:12, color:C.ink, lineHeight:1.7 }}>{line}</div> : <div key={i} style={{ height:6 }}/>;
    });
  };

  return (
    <>
      <InfoBox>
        <strong>CrewAI 4-Agent system :</strong><br/>
        Agent 1 — Data Analyst: queries SQLite, finds cash flow patterns, reports in ₹Crore<br/>
        Agent 2 — Risk Analyst: checks FX exposure (USD/INR), calculates VaR, scores risk 0–100<br/>
        Agent 3 — Compliance: verifies CRR 4.5%, SLR 18%, LCR 100% vs RBI mandates<br/>
        Agent 4 — Chief Treasury Officer: synthesises all findings into a CFO-ready report<br/>
        Powered by Groq Llama 3.3 70B — free, 500 tokens/sec. Sequential pipeline.
      </InfoBox>

      <Card title="🤖 Run CrewAI treasury analysis" sub="4 AI agents collaborate in sequence → CFO-ready Treasury Intelligence Report" mb={16}>
        <div style={{ display:"flex", gap:12, alignItems:"center", marginBottom:16, flexWrap:"wrap" }}>
          <div>
            <div style={{ fontSize:11, color:C.sub, marginBottom:4 }}>Entity scope</div>
            <select value={entity} onChange={e => setEntity(e.target.value)} style={{ padding:"7px 12px", borderRadius:7, border:`1px solid ${C.line}`, fontSize:12, background:C.card, color:C.ink, cursor:"pointer" }}>
              <option value="all">All entities</option>
              {["HQ","BLR","DEL","KOL","CHN"].map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize:11, color:C.sub, marginBottom:4 }}>Horizon</div>
            <select value={horizon} onChange={e => setHorizon(+e.target.value)} style={{ padding:"7px 12px", borderRadius:7, border:`1px solid ${C.line}`, fontSize:12, background:C.card, color:C.ink, cursor:"pointer" }}>
              {[7,14,30,60,90].map(d => <option key={d} value={d}>{d} days</option>)}
            </select>
          </div>
          <button onClick={run} disabled={loading} style={{ marginTop:20, padding:"9px 24px", borderRadius:8, border:"none", background:loading?C.faint:C.indigo, color:"#fff", fontSize:13, fontWeight:700, cursor:loading?"default":"pointer", display:"flex", alignItems:"center", gap:8 }}>
            {loading ? (
              <>
                <span style={{ display:"inline-block", width:14, height:14, border:"2px solid #fff", borderTopColor:"transparent", borderRadius:"50%", animation:"spin .7s linear infinite" }}/>
                Running agents… ({elapsed}s)
              </>
            ) : "🚀 Run 4-Agent Crew"}
          </button>
        </div>

        {/* Agent pipeline visual */}
        <div style={{ display:"flex", gap:4, alignItems:"center", marginBottom:16, flexWrap:"wrap" }}>
          {[
            { n:1, role:"Data Analyst",    icon:"📊", color:C.blue   },
            { n:2, role:"Risk Analyst",    icon:"⚖️", color:C.amber  },
            { n:3, role:"Compliance",      icon:"📋", color:C.purple },
            { n:4, role:"Treasury Advisor",icon:"👔", color:C.green  },
          ].map((a, i) => (
            <div key={i} style={{ display:"flex", alignItems:"center", gap:4 }}>
              {i > 0 && <div style={{ color:C.faint, fontSize:18 }}>→</div>}
              <div style={{ background:`${a.color}10`, border:`1px solid ${a.color}30`, borderRadius:8, padding:"8px 12px", textAlign:"center", minWidth:100 }}>
                <div style={{ fontSize:18 }}>{a.icon}</div>
                <div style={{ fontSize:10, fontWeight:600, color:a.color, textTransform:"uppercase", letterSpacing:".05em", marginTop:2 }}>Agent {a.n}</div>
                <div style={{ fontSize:10, color:C.sub }}>{a.role}</div>
              </div>
            </div>
          ))}
        </div>

        {result && (
          <div className="fade">
            <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap" }}>
              <Badge text={result.status} type={result.status==="completed"?"success":"error"}/>
              {result.duration_ms && <Badge text={`${(result.duration_ms/1000).toFixed(1)}s`} type="info"/>}
              {result.run_id && <span style={{ fontFamily:C.mono, fontSize:10, color:C.faint }}>Run: {result.run_id?.slice(0,8)}…</span>}
            </div>
            <div style={{ background:C.card, border:`1px solid ${C.line}`, borderRadius:8, padding:"16px 18px", lineHeight:1.8 }}>
              {formatReport(result.report)}
            </div>
          </div>
        )}
      </Card>

      {/* Agent run history */}
      {history && history.runs?.length > 0 && (
        <Card title="Agent run history" sub="Every CrewAI analysis is logged in the agent_runs table for audit">
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {history.runs.map((r, i) => (
              <div key={i} style={{ display:"flex", gap:12, alignItems:"center", padding:"9px 12px", background:C.card, border:`1px solid ${C.line}`, borderRadius:7 }}>
                <Badge text={r.status} type={r.status==="completed"?"success":r.status==="running"?"info":"error"}/>
                <div style={{ fontFamily:C.mono, fontSize:11, color:C.faint, flexShrink:0 }}>{r.started?.slice(0,16)}</div>
                <div style={{ fontSize:12, color:C.sub, flex:1 }}>{r.task?.slice(0,60)}…</div>
                {r.duration_ms && <div style={{ fontFamily:C.mono, fontSize:11, color:C.sub, flexShrink:0 }}>{(r.duration_ms/1000).toFixed(1)}s</div>}
                <div style={{ fontFamily:C.mono, fontSize:10, color:C.faint, flexShrink:0 }}>{r.run_id?.slice(0,8)}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}

/* ═══════════════════════ MAIN APP ═══════════════════════════════ */
export default function TreazyAI() {
  const [tab, setTab]       = useState("dashboard");
  const [totalCr, setTotal] = useState(null);
  const [menuOpen, setMenu] = useState(false);

  const switchTab = (t) => { setTab(t); setMenu(false); };

  const TABS = {
    dashboard: <DashboardTab onTotalLoaded={setTotal}/>,
    forecast:  <ForecastTab/>,
    anomaly:   <AnomalyTab/>,
    scenario:  <ScenarioTab/>,
    optimize:  <OptimizeTab/>,
    portfolio: <PortfolioTab/>,
    etl:       <EtlTab/>,
    sql:       <SqlTab/>,
    agents:    <AgentsTab/>,
  };

  return (
    <>
      <style>{GLOBAL_CSS}</style>
      {/* Mobile overlay backdrop */}
      <div className={`mob-overlay${menuOpen?" open":""}`} onClick={() => setMenu(false)}/>
      <div style={{ display:"flex", minHeight:"100vh" }}>
        {/* Desktop sidebar */}
        <Sidebar tab={tab} setTab={switchTab}/>
        {/* Mobile sidebar — slides in from left */}
        {menuOpen && (
          <div style={{ position:"fixed", top:0, left:0, bottom:0, width:230, zIndex:50, background:C.panel, borderRight:`1px solid ${C.line}` }}>
            <Sidebar tab={tab} setTab={switchTab} onClose={() => setMenu(false)}/>
          </div>
        )}
        <div style={{ flex:1, display:"flex", flexDirection:"column", minWidth:0, overflowX:"hidden" }}>
          <Header tab={tab} totalCr={totalCr} onMenuClick={() => setMenu(o => !o)}/>
          <main style={{ flex:1, overflowY:"auto", padding:"20px 20px 40px" }}>
            {TABS[tab]}
            <div style={{ textAlign:"center", marginTop:20, fontSize:10, color:C.faint, fontFamily:C.mono, letterSpacing:".06em" }}>
              TREAZY AI v2.0 · PYTHON FASTAPI + SQLITE · ARIMA + ISOLATION FOREST · CREWAI + GROQ · INDIAN TREASURY DATA
            </div>
          </main>
        </div>
      </div>
    </>
  );
}
