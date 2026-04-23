import { useState, useEffect } from "react"
import { themes } from "./config/theme"
import { sbGet } from "./api/supabase"
import { useAuth } from "./hooks/useAuth"

import Login from "./pages/auth/Login"
import Onboarding from "./pages/onboarding/Onboarding"
import Sidebar from "./components/Sidebar"
import MobileNav from "./components/MobileNav"
import ChangePasswordModal from "./components/ChangePasswordModal"
import ChangeLoginIdModal from "./components/ChangeLoginIdModal"

import Dashboard from "./pages/home/Dashboard"
import AttendanceList from "./pages/attendance/AttendanceList"
import LeaveRequest from "./pages/leave/LeaveRequest"
import CommissionEntry from "./pages/commission/CommissionEntry"
import TransportLog from "./pages/transport/TransportLog"
import ExpenseClaim from "./pages/expense/ExpenseClaim"
import EmployeeManager from "./pages/employee/EmployeeManager"
import WorkEntryManager from "./pages/workentry/WorkEntryManager"
import UploadTable from "./pages/workentry/UploadTable"
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
  const [workBadge, setWorkBadge] = useState(0)
  const [pwdShow, setPwdShow] = useState(false)
  const [idShow, setIdShow] = useState(false)
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
      const now = new Date()
      const y = now.getFullYear(), m = now.getMonth() + 1
      const [lr, sw, tc, sub] = await Promise.all([
        sbGet("leave_requests?status=eq.申請中&select=id", user.token),
        sbGet("day_swap_requests?status=eq.申請中&select=id", user.token),
        sbGet("transport_change_requests?status=eq.申請中&select=id", user.token),
        sbGet(`monthly_report_submissions?status=eq.submitted&year=eq.${y}&month=eq.${m}&select=id`, user.token),
      ])
      setBadge((lr?.length || 0) + (sw?.length || 0) + (tc?.length || 0))
      setWorkBadge(sub?.length || 0)
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

  const needsOnboarding =
    user.role !== "admin" &&
    (user.employment_type === "アルバイト" || user.employment_type === "外部講師") &&
    !user.onboarding_completed_at
  if (needsOnboarding) return <Onboarding user={user} t={t} onDone={login} onLogout={logout} />

  const pages = {
    home:    <Dashboard user={user} t={t} tk={user.token} onNav={setView} onLogout={logout} mobile={mobile} />,
    att:     <AttendanceList user={user} t={t} tk={user.token} />,
    leave:   <LeaveRequest user={user} t={t} tk={user.token} />,
    swap:    <DaySwapRequest user={user} t={t} tk={user.token} />,
    comm:    <CommissionEntry user={user} t={t} tk={user.token} />,
    trans:   <TransportLog user={user} t={t} tk={user.token} />,
    expense: <ExpenseClaim user={user} t={t} tk={user.token} />,
    work:    <WorkEntryManager user={user} t={t} tk={user.token} />,
    upload:  <UploadTable user={user} t={t} tk={user.token} />,
    empmgr:  <EmployeeManager user={user} t={t} tk={user.token} />,
    approve: <ApprovalCenter user={user} t={t} tk={user.token} />,
    cal:     <LeaveCalendar t={t} tk={user.token} />,
    report:  <MonthlyReport t={t} tk={user.token} />,
  }

  return (
    <div style={{ display: "flex", height: "100vh", background: t.bg, color: t.tx, overflow: "hidden" }}>
      {!mobile && <Sidebar user={user} view={view} onNav={setView} onLogout={logout} t={t} theme={theme} toggleTheme={toggleTheme} badge={badge} workBadge={workBadge} />}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", position: "relative" }}>
        <div className="home-ambient home-ambient-tl" />
        <div className="home-ambient home-ambient-br" />
        <div style={{ position: "relative", zIndex: 1, padding: mobile ? "16px 14px 80px" : "24px 28px", minHeight: "100%", boxSizing: "border-box" }}>
          {mobile && view !== "home" && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: t.ac, letterSpacing: ".05em" }}>早稲田理工塾 OS</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: t.tx }}>{user.name}</div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setPwdShow(true)} style={{ padding: "4px 10px", borderRadius: 5, border: `1px solid ${t.bd}`, background: "transparent", color: t.ts, fontSize: 10, cursor: "pointer" }}>密码</button>
                <button onClick={() => setIdShow(true)} style={{ padding: "4px 10px", borderRadius: 5, border: `1px solid ${t.bd}`, background: "transparent", color: t.ts, fontSize: 10, cursor: "pointer" }}>改ID</button>
                <button onClick={logout} style={{ padding: "4px 10px", borderRadius: 5, border: `1px solid ${t.bd}`, background: "transparent", color: t.tm, fontSize: 10, cursor: "pointer" }}>退出</button>
              </div>
            </div>
          )}
          {pages[view] || <Dashboard user={user} t={t} tk={user.token} />}
        </div>
      </div>
      {mobile && <MobileNav user={user} view={view} onNav={setView} t={t} badge={badge} workBadge={workBadge} />}
      {pwdShow && <ChangePasswordModal t={t} token={user.token} onClose={() => setPwdShow(false)} />}
      {idShow && <ChangeLoginIdModal t={t} user={user} token={user.token} onLogout={logout} onClose={() => setIdShow(false)} />}
    </div>
  )
}
