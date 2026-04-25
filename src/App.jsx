import { useState, useEffect, useRef } from "react"
import { themes } from "./config/theme"
import { sbGet, sbRefresh } from "./api/supabase"
import { useAuth } from "./hooks/useAuth"
import { isSuperAdmin } from "./config/constants"

import Login from "./pages/auth/Login"
import Onboarding from "./pages/onboarding/Onboarding"
import Sidebar from "./components/Sidebar"
import MobileNav from "./components/MobileNav"
import ChangePasswordModal from "./components/ChangePasswordModal"
import ChangeLoginIdModal from "./components/ChangeLoginIdModal"
import MaintenanceModeModal from "./components/MaintenanceModeModal"

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
import LeaveHub from "./pages/leave/LeaveHub"
import DaySwapRequest from "./pages/leave/DaySwapRequest"
import MonthlyReport from "./pages/report/MonthlyReport"
import PayrollManager from "./pages/payroll/PayrollManager"

export default function App() {
  const { user, login, logout } = useAuth()
  const [view, setView] = useState("home")
  const [theme, setTheme] = useState(() => localStorage.getItem("kintai_theme") || "light")
  const [mobile, setMobile] = useState(false)
  const [badge, setBadge] = useState(0)
  const [workBadge, setWorkBadge] = useState(0)
  const [pwdShow, setPwdShow] = useState(false)
  const [idShow, setIdShow] = useState(false)
  const [maintShow, setMaintShow] = useState(false)
  const [maintState, setMaintState] = useState({ on: false, message: null })
  const t = themes[theme]

  const userRef = useRef(user)
  useEffect(() => { userRef.current = user }, [user])

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

  useEffect(() => {
    if (!user) return
    const checkMaint = async () => {
      const rows = await sbGet("system_state?id=eq.1&select=maintenance_mode,maintenance_message", user.token)
      if (rows?.length) setMaintState({ on: !!rows[0].maintenance_mode, message: rows[0].maintenance_message })
    }
    checkMaint()
    const iv = setInterval(checkMaint, 30000)
    return () => clearInterval(iv)
  }, [user])

  // 自动续期：挂载时立刻刷一次（防止 localStorage 里的 token 已过期），
  // 之后每 50 分钟刷一次（access_token 1h 过期），tab 从后台切回也刷一次。
  // 关键：dep 用 user?.id 而不是 user?.refreshToken —— Supabase 每次 refresh 都会返回新的
  // refresh_token，若依赖它则 effect 会在每次刷新后重跑 → 立刻再 doRefresh → 死循环频闪。
  useEffect(() => {
    if (!user?.id || !userRef.current?.refreshToken) return
    const doRefresh = async () => {
      const cur = userRef.current
      if (!cur?.refreshToken) return
      const r = await sbRefresh(cur.refreshToken)
      if (r?.access_token) {
        login({ ...cur, token: r.access_token, refreshToken: r.refresh_token || cur.refreshToken })
      }
    }
    doRefresh()
    const iv = setInterval(doRefresh, 50 * 60 * 1000)
    const onVis = () => { if (document.visibilityState === "visible") doRefresh() }
    document.addEventListener("visibilitychange", onVis)
    return () => { clearInterval(iv); document.removeEventListener("visibilitychange", onVis) }
  }, [user?.id])

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

  if (maintState.on && !isSuperAdmin(user)) return (
    <div style={{ minHeight: "100vh", background: t.bg, color: t.tx, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ maxWidth: 440, width: "100%", background: t.bgC, borderRadius: 18, border: `1px solid ${t.bd}`, padding: "32px 28px", textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🛠</div>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: t.tx }}>系统维护中</h1>
        <div style={{ fontSize: 13, color: t.tm, marginTop: 12, lineHeight: 1.7 }}>
          {maintState.message || "管理员正在更新系统，请稍后再试。"}
        </div>
        <div style={{ fontSize: 11, color: t.td, marginTop: 16 }}>此期间编辑的内容无法保存，请暂停操作。</div>
        <button onClick={logout} style={{ marginTop: 24, padding: "8px 20px", borderRadius: 8, border: `1px solid ${t.bd}`, background: "transparent", color: t.tm, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>退出登录</button>
      </div>
    </div>
  )

  const pages = {
    home:    <Dashboard user={user} t={t} tk={user.token} onNav={setView} onLogout={logout} onUpdateUser={login} mobile={mobile} />,
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
    leavehub: <LeaveHub user={user} t={t} tk={user.token} />,
    report:  <MonthlyReport t={t} tk={user.token} />,
    // 超管专属：非 super admin 不注册此路由，即使手动改 view 也无法渲染
    ...(isSuperAdmin(user) ? { payroll: <PayrollManager user={user} t={t} tk={user.token} /> } : {}),
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
                {isSuperAdmin(user) && <button onClick={() => setMaintShow(true)} style={{ padding: "4px 10px", borderRadius: 5, border: `1px solid ${maintState.on ? t.rd : t.bd}`, background: "transparent", color: maintState.on ? t.rd : t.ts, fontSize: 10, cursor: "pointer", fontWeight: maintState.on ? 700 : 400 }}>{maintState.on ? "维护中" : "维护"}</button>}
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
      {maintShow && isSuperAdmin(user) && <MaintenanceModeModal t={t} token={user.token} onChange={(on) => setMaintState(s => ({ ...s, on }))} onClose={() => setMaintShow(false)} />}
      {maintState.on && isSuperAdmin(user) && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, background: t.rd, color: "#fff", fontSize: 11, fontWeight: 600, padding: "4px 12px", textAlign: "center", zIndex: 999, letterSpacing: ".05em" }}>
          🛠 维护模式中 · 其他用户已被锁定 · <button onClick={() => setMaintShow(true)} style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", padding: "2px 8px", borderRadius: 4, fontSize: 10, cursor: "pointer", fontFamily: "inherit", marginLeft: 6 }}>管理</button>
        </div>
      )}
    </div>
  )
}
