import { useState } from "react"
import { Home, ClipboardList, Clock, Users, CheckCircle, CalendarDays, BarChart3, KeyRound } from "lucide-react"
import { isHourly as empIsHourly } from "../config/constants"
import ChangePasswordModal from "./ChangePasswordModal"

export default function Sidebar({ user, view, onNav, onLogout, t, theme, toggleTheme, badge, workBadge }) {
  const isA = user.role === "admin"
  const et = user.employment_type || "正社員"
  const isHourly = empIsHourly(et)
  const [pwdShow, setPwdShow] = useState(false)

  const items = [
    { id: "home", l: "首页", ic: Home, show: true },
    { id: "att", l: "勤怠一览", ic: ClipboardList, show: !isHourly || isA },
    { id: "work", l: "工资报表", ic: Clock, show: isHourly || isA },
    { id: "empmgr", l: isA ? "人事档案" : "入职信息", ic: Users, show: true },
    { id: "approve", l: "承认中心", ic: CheckCircle, show: isA },
    { id: "cal", l: "休假日历", ic: CalendarDays, show: !isHourly || isA },
    { id: "report", l: "月度报告", ic: BarChart3, show: isA },
  ]

  return (
    <>
    <div style={{ width: 210, background: t.bgS, borderRight: `1px solid ${t.bd}`, display: "flex", flexDirection: "column", height: "100vh", flexShrink: 0 }}>
      <div style={{ padding: "18px 16px 14px", borderBottom: `1px solid ${t.bd}` }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: t.ac, letterSpacing: ".06em" }}>早稲田理工塾 OS</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: t.tx, marginTop: 3 }}>管理系统</div>
      </div>
      <nav style={{ flex: 1, padding: "10px 8px", display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
        {items.filter((n) => n.show).map((it) => {
          const Icon = it.ic
          return (
            <button key={it.id} onClick={() => onNav(it.id)} style={{
              display: "flex", alignItems: "center", gap: 9, padding: "10px 12px", borderRadius: 8,
              border: "none", background: view === it.id ? t.sa : "transparent",
              color: view === it.id ? t.sat : t.st, fontSize: 13, cursor: "pointer",
              textAlign: "left", fontWeight: view === it.id ? 600 : 400, position: "relative",
            }}>
              <Icon size={16} strokeWidth={1.8} />{it.l}
              {it.id === "approve" && badge > 0 && (
                <span style={{ position: "absolute", right: 10, background: t.rd, color: "#fff", fontSize: 9, fontWeight: 700, borderRadius: 10, padding: "1px 6px", minWidth: 18, textAlign: "center" }}>{badge}</span>
              )}
              {it.id === "work" && isA && workBadge > 0 && (
                <span style={{ position: "absolute", right: 10, background: t.ac, color: "#fff", fontSize: 9, fontWeight: 700, borderRadius: 10, padding: "1px 6px", minWidth: 18, textAlign: "center" }}>{workBadge}</span>
              )}
            </button>
          )
        })}
      </nav>
      <div style={{ padding: 14, borderTop: `1px solid ${t.bd}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: `linear-gradient(135deg,${isA ? t.wn : t.ac},${isA ? "#B45309" : "#1D4ED8"})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#fff", fontWeight: 700 }}>{(user.name || "?")[0]}</div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: t.tx }}>{user.name}</div>
            <div style={{ fontSize: 9, color: t.tm }}>{isA ? "管理者" : et}</div>
          </div>
        </div>
        <button onClick={() => setPwdShow(true)} style={{ width: "100%", padding: 8, borderRadius: 7, border: `1px solid ${t.bd}`, background: "transparent", color: t.ts, fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4, marginBottom: 6, fontFamily: "inherit" }}>
          <KeyRound size={12} /> 修改密码
        </button>
        <button onClick={onLogout} style={{ width: "100%", padding: 8, borderRadius: 7, border: `1px solid ${t.bd}`, background: "transparent", color: t.tm, fontSize: 11, cursor: "pointer" }}>退出登录</button>
      </div>
    </div>
    {pwdShow && <ChangePasswordModal t={t} token={user.token} onClose={() => setPwdShow(false)} />}
    </>
  )
}
