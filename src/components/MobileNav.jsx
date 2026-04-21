import { Home, ClipboardList, Clock, Users, CheckCircle, CalendarDays, BarChart3 } from "lucide-react"
import { isHourly as empIsHourly } from "../config/constants"

export default function MobileNav({ user, view, onNav, t, badge, workBadge }) {
  const isA = user.role === "admin"
  const et = user.employment_type || "正社員"
  const isHourly = empIsHourly(et)

  const all = [
    { id: "home", ic: Home, l: "首页", show: true },
    { id: "att", ic: ClipboardList, l: "勤怠", show: !isHourly || isA },
    { id: "work", ic: Clock, l: "报表", show: isHourly || isA },
    { id: "empmgr", ic: Users, l: "档案", show: true },
    { id: "cal", ic: CalendarDays, l: "日历", show: !isHourly || isA },
    { id: "approve", ic: CheckCircle, l: "审批", show: isA },
    { id: "report", ic: BarChart3, l: "月报", show: isA },
  ]

  const items = all.filter(n => n.show)

  return (
    <div style={{
      display: "flex", justifyContent: "space-around", background: t.bgS,
      borderTop: `1px solid ${t.bd}`, padding: "6px 0 env(safe-area-inset-bottom,4px)",
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50,
    }}>
      {items.map((it) => {
        const Icon = it.ic
        const active = view === it.id
        return (
          <button key={it.id} onClick={() => onNav(it.id)} style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
            border: "none", background: "transparent",
            color: active ? t.ac : t.tm, fontSize: 9, cursor: "pointer",
            padding: "4px 6px", fontWeight: active ? 700 : 400, position: "relative",
          }}>
            <Icon size={20} strokeWidth={active ? 2.2 : 1.6} />
            {it.l}
            {it.id === "approve" && badge > 0 && (
              <span style={{ position: "absolute", top: 0, right: 2, background: t.rd, color: "#fff", fontSize: 8, borderRadius: 8, padding: "0 4px", fontWeight: 700 }}>{badge}</span>
            )}
            {it.id === "work" && isA && workBadge > 0 && (
              <span style={{ position: "absolute", top: 0, right: 2, background: t.ac, color: "#fff", fontSize: 8, borderRadius: 8, padding: "0 4px", fontWeight: 700 }}>{workBadge}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
