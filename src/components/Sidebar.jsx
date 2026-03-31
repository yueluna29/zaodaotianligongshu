export default function Sidebar({ user, view, onNav, onLogout, t, theme, toggleTheme, badge }) {
  const isA = user.role === "admin"
  const items = [
    { id: "home", l: "首页", ic: "🏠", r: ["staff", "admin"] },
    { id: "att", l: "勤怠一览", ic: "📋", r: ["staff", "admin"] },
    { id: "leave", l: "假期管理", ic: "🌴", r: ["staff", "admin"] },
    { id: "work", l: "工时管理", ic: "⏱", r: ["staff", "admin"] },
    { id: "comm", l: "签单录入", ic: "💰", r: ["staff", "admin"] },
    { id: "trans", l: "交通费", ic: "🚃", r: ["staff", "admin"] },
    { id: "expense", l: "报销", ic: "🧾", r: ["staff", "admin"] },
    { id: "empmgr", l: "人事档案", ic: "👥", r: ["staff", "admin"] },
    { id: "approve", l: "承认中心", ic: "✅", r: ["admin"] },
    { id: "cal", l: "休假日历", ic: "📅", r: ["staff", "admin"] },
    { id: "report", l: "月度报告", ic: "📊", r: ["admin"] },
  ]

  return (
    <div style={{ width: 210, background: t.bgS, borderRight: `1px solid ${t.bd}`, display: "flex", flexDirection: "column", height: "100vh", flexShrink: 0 }}>
      <div style={{ padding: "18px 16px 14px", borderBottom: `1px solid ${t.bd}` }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: t.ac, letterSpacing: ".06em" }}>早稲田理工塾</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: t.tx, marginTop: 3 }}>管理系统</div>
      </div>
      <nav style={{ flex: 1, padding: "10px 8px", display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
        {items.filter((n) => n.r.includes(user.role)).map((it) => (
          <button key={it.id} onClick={() => onNav(it.id)} style={{
            display: "flex", alignItems: "center", gap: 9, padding: "10px 12px", borderRadius: 8,
            border: "none", background: view === it.id ? t.sa : "transparent",
            color: view === it.id ? t.sat : t.st, fontSize: 13, cursor: "pointer",
            textAlign: "left", fontWeight: view === it.id ? 600 : 400, position: "relative",
          }}>
            <span style={{ fontSize: 15 }}>{it.ic}</span>{it.l}
            {it.id === "approve" && badge > 0 && (
              <span style={{ position: "absolute", right: 10, background: t.rd, color: "#fff", fontSize: 9, fontWeight: 700, borderRadius: 10, padding: "1px 6px", minWidth: 18, textAlign: "center" }}>{badge}</span>
            )}
          </button>
        ))}
      </nav>
      <div style={{ padding: 14, borderTop: `1px solid ${t.bd}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: `linear-gradient(135deg,${isA ? t.wn : t.ac},${isA ? "#B45309" : "#1D4ED8"})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#fff", fontWeight: 700 }}>{(user.name || "?")[0]}</div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: t.tx }}>{user.name}</div>
              <div style={{ fontSize: 9, color: t.tm }}>{isA ? "管理者" : "社員"}</div>
            </div>
          </div>
          <button onClick={toggleTheme} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer" }}>{theme === "dark" ? "☀️" : "🌙"}</button>
        </div>
        <button onClick={onLogout} style={{ width: "100%", padding: 8, borderRadius: 7, border: `1px solid ${t.bd}`, background: "transparent", color: t.tm, fontSize: 11, cursor: "pointer" }}>退出登录</button>
      </div>
    </div>
  )
}
