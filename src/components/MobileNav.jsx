export default function MobileNav({ user, view, onNav, t, badge }) {
  const items = [
    { id: "home", ic: "🏠", l: "首页" },
    { id: "att", ic: "📋", l: "勤怠" },
    { id: "leave", ic: "🌴", l: "休假" },
    { id: "comm", ic: "💰", l: "签单" },
    ...(user.role === "admin"
      ? [
          { id: "approve", ic: "✅", l: "审批" },
          { id: "report", ic: "📊", l: "月报" },
        ]
      : []),
  ]

  return (
    <div style={{
      display: "flex", justifyContent: "space-around", background: t.bgS,
      borderTop: `1px solid ${t.bd}`, padding: "6px 0 env(safe-area-inset-bottom,4px)",
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50,
    }}>
      {items.map((it) => (
        <button key={it.id} onClick={() => onNav(it.id)} style={{
          display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
          border: "none", background: "transparent",
          color: view === it.id ? t.ac : t.tm, fontSize: 9, cursor: "pointer",
          padding: "4px 6px", fontWeight: view === it.id ? 700 : 400, position: "relative",
        }}>
          <span style={{ fontSize: 18 }}>{it.ic}</span>{it.l}
          {it.id === "approve" && badge > 0 && (
            <span style={{ position: "absolute", top: 0, right: 2, background: t.rd, color: "#fff", fontSize: 8, borderRadius: 8, padding: "0 4px", fontWeight: 700 }}>{badge}</span>
          )}
        </button>
      ))}
    </div>
  )
}
