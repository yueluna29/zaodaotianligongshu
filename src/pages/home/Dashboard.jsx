import { useState, useEffect, useCallback } from "react"
import { sbGet, sbPost } from "../../api/supabase"
import { WEEKDAYS, pad, todayStr, fmtMinutes, workingDays } from "../../config/constants"

export default function Dashboard({ user, t, tk }) {
  const isA = user.role === "admin"
  const now = new Date()
  const y = now.getFullYear(), m = now.getMonth() + 1
  const [stats, setStats] = useState(null)
  const [todayRec, setTodayRec] = useState(null)
  const [clocking, setClocking] = useState(false)
  const [time, setTime] = useState(new Date())
  const td = todayStr()

  useEffect(() => {
    const iv = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(iv)
  }, [])

  const loadToday = useCallback(async () => {
    const d = await sbGet(`attendance_records?employee_id=eq.${user.id}&work_date=eq.${td}&select=*`, tk)
    setTodayRec(d?.length ? d[0] : null)
  }, [user.id, td, tk])

  useEffect(() => {
    (async () => {
      try {
        const from = `${y}-${pad(m)}-01`, to = `${y}-${pad(m)}-${pad(new Date(y, m, 0).getDate())}`
        if (isA) {
          const [emps, atts, lr] = await Promise.all([
            sbGet("employees?is_active=eq.true&select=id", tk),
            sbGet(`attendance_records?work_date=gte.${from}&work_date=lte.${to}&select=employee_id,work_minutes,clock_in`, tk),
            sbGet("leave_requests?status=eq.申請中&select=id", tk),
          ])
          setStats({
            empCount: emps.length,
            todayWorkers: new Set(atts.filter((a) => a.clock_in).map((a) => a.employee_id)).size,
            totalOT: (atts.reduce((s, a) => s + Math.max(Number(a.work_minutes || 0) - 480, 0), 0) / 60).toFixed(1),
            pending: lr.length,
          })
        } else {
          const [atts, lb, lr] = await Promise.all([
            sbGet(`attendance_records?employee_id=eq.${user.id}&work_date=gte.${from}&work_date=lte.${to}&select=work_minutes,clock_in,note`, tk),
            sbGet(`leave_balances?employee_id=eq.${user.id}&select=*`, tk),
            sbGet(`leave_requests?employee_id=eq.${user.id}&status=eq.承認&leave_type=eq.有休&select=id`, tk),
          ])
          const totalW = atts.reduce((s, a) => s + Number(a.work_minutes || 0), 0)
          const bal = lb.reduce((s, b) => s + Number(b.granted_days || 0) + Number(b.carried_over_days || 0), 0)
          setStats({ totalW, wd: atts.filter((a) => a.clock_in).length, targetH: workingDays(y, m) * 8 * 60, leaveBalance: bal - lr.length, leaveUsed: lr.length })
        }
        await loadToday()
      } catch (e) {
        console.error(e)
        setStats({ empCount: 0, todayWorkers: 0, totalOT: "0", pending: 0, totalW: 0, wd: 0, targetH: 1, leaveBalance: 0, leaveUsed: 0 })
      }
    })()
  }, [tk, user.id, isA])

  const clock = async (action) => {
    setClocking(true)
    const h = pad(new Date().getHours()), mi = pad(new Date().getMinutes()), tm = `${h}:${mi}:00`
    const rec = todayRec || {}
    const body = { employee_id: user.id, work_date: td }
    if (action === "in") body.clock_in = tm
    else if (action === "out") { body.clock_in = rec.clock_in || tm; body.clock_out = tm }
    else if (action === "bs") { body.clock_in = rec.clock_in; body.break_start = tm }
    else if (action === "be") { body.clock_in = rec.clock_in; body.break_start = rec.break_start; body.break_end = tm }
    await sbPost("attendance_records", [body], tk, "?on_conflict=employee_id,work_date")
    await loadToday()
    setClocking(false)
  }

  if (!stats) return <div style={{ textAlign: "center", padding: 40, color: t.tm }}>加载中...</div>

  const Card = ({ label, value, sub, color }) => (
    <div style={{ background: t.bgC, borderRadius: 12, padding: "16px 18px", border: `1px solid ${t.bd}` }}>
      <div style={{ fontSize: 10, color: t.tm }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: color || t.ac, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: t.td, marginTop: 2 }}>{sub}</div>}
    </div>
  )

  const ci = todayRec?.clock_in, co = todayRec?.clock_out, bs = todayRec?.break_start, be = todayRec?.break_end
  const onBreak = bs && !be

  const ClockBtn = ({ onClick, icon, label, bg, border, color, size }) => (
    <button onClick={onClick} disabled={clocking} style={{ width: size || 100, height: size || 100, borderRadius: "50%", border: border || "none", background: bg, color: color || "#fff", fontSize: 15, fontWeight: 700, cursor: clocking ? "wait" : "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, opacity: clocking ? 0.7 : 1, boxShadow: `0 6px 20px ${typeof bg === "string" && bg.startsWith("#") ? bg + "44" : "rgba(0,0,0,.1)"}` }}>
      <span style={{ fontSize: 24 }}>{icon}</span>{label}
    </button>
  )

  const ClockSection = ({ size = 96 }) => (
    <div style={{ background: t.bgC, borderRadius: 16, padding: "24px 20px", border: `1px solid ${t.bd}`, marginBottom: 16, textAlign: "center" }}>
      <div style={{ fontSize: 12, color: t.tm, marginBottom: 4 }}>{time.getFullYear()}年{m}月{time.getDate()}日（{WEEKDAYS[time.getDay()]}）</div>
      <div style={{ fontSize: 42, fontWeight: 200, color: t.tx, fontFamily: "monospace", marginBottom: 16 }}>{pad(time.getHours())}:{pad(time.getMinutes())}:{pad(time.getSeconds())}</div>
      {ci && (
        <div style={{ display: "flex", justifyContent: "center", gap: 16, fontSize: 12, color: t.ts, marginBottom: 16, flexWrap: "wrap" }}>
          <span>出勤 {ci?.slice(0, 5)}</span>
          {bs && <span>休息 {bs?.slice(0, 5)}{be ? `~${be?.slice(0, 5)}` : " 中..."}</span>}
          {co && <span>退勤 {co?.slice(0, 5)}</span>}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "center", gap: 14, flexWrap: "wrap" }}>
        {!ci ? <ClockBtn onClick={() => clock("in")} icon="☀️" label="出勤" bg={`linear-gradient(135deg,${t.ac},${t.ah})`} size={size} /> :
          co ? <div><span style={{ fontSize: 28 }}>✅</span><div style={{ fontSize: 13, color: t.gn, marginTop: 4 }}>辛苦了</div></div> : <>
            {!onBreak && !be && <ClockBtn onClick={() => clock("bs")} icon="☕" label="开始休息" bg="transparent" border={`3px solid ${t.wn}`} color={t.wn} size={size - 8} />}
            {onBreak && <ClockBtn onClick={() => clock("be")} icon="💪" label="休息结束" bg="transparent" border={`3px solid ${t.gn}`} color={t.gn} size={size - 8} />}
            {!onBreak && <ClockBtn onClick={() => clock("out")} icon="🌙" label="退勤" bg="linear-gradient(135deg,#7C3AED,#6D28D9)" size={size - 8} />}
          </>}
      </div>
    </div>
  )

  // 实时时钟区块（可见版本，不带打卡按钮）
  const TimeDisplay = () => (
    <div style={{ background: t.bgC, borderRadius: 16, padding: "20px", border: `1px solid ${t.bd}`, marginBottom: 16, textAlign: "center" }}>
      <div style={{ fontSize: 12, color: t.tm, marginBottom: 4 }}>{time.getFullYear()}年{m}月{time.getDate()}日（{WEEKDAYS[time.getDay()]}）</div>
      <div style={{ fontSize: 38, fontWeight: 200, color: t.tx, fontFamily: "monospace" }}>{pad(time.getHours())}:{pad(time.getMinutes())}:{pad(time.getSeconds())}</div>
    </div>
  )

  if (isA) return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: t.tx, margin: "0 0 16px" }}>管理面板</h2>
      <TimeDisplay />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
        <Card label="员工数" value={`${stats.empCount}人`} />
        <Card label="本月出勤" value={`${stats.todayWorkers}人`} color={t.gn} />
        <Card label="待审批" value={`${stats.pending}件`} color={stats.pending > 0 ? t.wn : t.gn} />
        <Card label="全员加班合计" value={`${stats.totalOT}h`} color={parseFloat(stats.totalOT) > 100 ? t.rd : t.wn} />
      </div>
    </div>
  )

  const pct = stats.targetH > 0 ? Math.min((stats.totalW / stats.targetH) * 100, 150) : 0
  const barColor = pct >= 95 ? t.gn : pct >= 80 ? t.wn : t.rd
  const canClock = user.employment_type === "正社員" || user.employment_type === "契約社員"

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: t.tx, margin: "0 0 16px" }}>首页</h2>
      {canClock ? <ClockSection size={96} /> : <TimeDisplay />}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 16 }}>
        <Card label="本月出勤" value={`${stats.wd}天`} />
        <Card label="本月工时" value={fmtMinutes(stats.totalW)} color={t.gn} />
        <Card label="有休余额" value={`${stats.leaveBalance}天`} color={t.ac} sub={`已用${stats.leaveUsed}天`} />
      </div>
      <div style={{ background: t.bgC, borderRadius: 12, padding: "16px 18px", border: `1px solid ${t.bd}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: t.ts, marginBottom: 6 }}>
          <span>工时充足度</span><span>{fmtMinutes(stats.totalW)} / {fmtMinutes(stats.targetH)}</span>
        </div>
        <div style={{ height: 10, background: t.bgI, borderRadius: 5, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: barColor, borderRadius: 5, transition: "width .5s" }} />
        </div>
        <div style={{ fontSize: 10, color: barColor, marginTop: 4, textAlign: "right" }}>{pct.toFixed(0)}%</div>
      </div>
    </div>
  )
}
