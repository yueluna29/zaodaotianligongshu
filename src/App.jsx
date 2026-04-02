import { useState, useEffect } from "react"
import { themes } from "./config/theme"
import { sbGet } from "./api/supabase"
import { useAuth } from "./hooks/useAuth"

import Login from "./pages/auth/Login"
import Sidebar from "./components/Sidebar"
import MobileNav from "./components/MobileNav"

import Dashboard from "./pages/home/Dashboard"
import AttendanceList from "./pages/attendance/AttendanceList"
import LeaveRequest from "./pages/leave/LeaveRequest"
import CommissionEntry from "./pages/commission/CommissionEntry"
import TransportLog from "./pages/transport/TransportLog"
import ExpenseClaim from "./pages/expense/ExpenseClaim"
import EmployeeManager from "./pages/employee/EmployeeManager"
import WorkEntryManager from "./pages/workentry/WorkEntryManager"
import ApprovalCenter from "./pages/approval/ApprovalCenter"
import LeaveCalendar from "./pages/leave/LeaveCalendar"
import DaySwapRequest from "./pages/leave/DaySwapRequest"
import MonthlyReport from "./pages/report/MonthlyReport"

export default function App() {
  const { user, login, logout } = useAuth()
  const [view, setView] = useState("home")
  const [theme, setTheme] = useState(() => localStorage.getItem("kintai_theme") || "light")
  const [mobile, setMobile] = useState(false)
  const [badge, setBadge] = useState(0)
  const t = themes[theme]

  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 768)
    check()
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [])

  useEffect(() => {
    if (!user || user.role !== "admin") return
    const poll = async () => {
      const [lr, sw] = await Promise.all([
        sbGet("leave_requests?status=eq.申請中&select=id", user.token),
        sbGet("day_swap_requests?status=eq.申請中&select=id", user.token),
      ])
      setBadge((lr?.length || 0) + (sw?.length || 0))
    }
    poll()
    const iv = setInterval(poll, 30000)
    return () => clearInterval(iv)
  }, [user])

  const toggleTheme = () =>
    setTheme((p) => {
      const n = p === "dark" ? "light" : "dark"
      localStorage.setItem("kintai_theme", n)
      return n
    })

  if (!user) return <Login onAuth={login} theme={theme} t={t} toggleTheme={toggleTheme} />

  const pages = {
    home:    <Dashboard user={user} t={t} tk={user.token} />,
    att:     <AttendanceList user={user} t={t} tk={user.token} />,
    leave:   <LeaveRequest user={user} t={t} tk={user.token} />,
    swap:    <DaySwapRequest user={user} t={t} tk={user.token} />,
    comm:    <CommissionEntry user={user} t={t} tk={user.token} />,
    trans:   <TransportLog user={user} t={t} tk={user.token} />,
    expense: <ExpenseClaim user={user} t={t} tk={user.token} />,
    work:    <WorkEntryManager user={user} t={t} tk={user.token} />,
    empmgr:  <EmployeeManager user={user} t={t} tk={user.token} />,
    approve: <ApprovalCenter t={t} tk={user.token} />,
    cal:     <LeaveCalendar t={t} tk={user.token} />,
    report:  <MonthlyReport t={t} tk={user.token} />,
  }

  return (
    <div style={{ display: "flex", height: "100vh", background: t.bg, fontFamily: "'Noto Sans JP',-apple-system,sans-serif", color: t.tx, overflow: "hidden" }}>
      {!mobile && <Sidebar user={user} view={view} onNav={setView} onLogout={logout} t={t} theme={theme} toggleTheme={toggleTheme} badge={badge} />}
      <div style={{ flex: 1, overflow: "auto", padding: mobile ? "16px 14px 80px" : "24px 28px" }}>
        {mobile && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: t.ac, letterSpacing: ".05em" }}>早稲田理工塾</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: t.tx }}>勤怠管理</div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button onClick={toggleTheme} style={{ background: "none", border: "none", fontSize: 16, cursor: "pointer" }}>{theme === "dark" ? "☀️" : "🌙"}</button>
              <button onClick={logout} style={{ padding: "4px 10px", borderRadius: 5, border: `1px solid ${t.bd}`, background: "transparent", color: t.tm, fontSize: 10, cursor: "pointer" }}>退出</button>
            </div>
          </div>
        )}
        {pages[view] || <Dashboard user={user} t={t} tk={user.token} />}
      </div>
      {mobile && <MobileNav user={user} view={view} onNav={setView} t={t} badge={badge} />}
    </div>
  )
}
