import { useState, useEffect, useCallback, useMemo } from "react"
import { sbGet, sbPost, sbPatch, sbDel } from "../../api/supabase"
import { WEEKDAYS, pad, todayStr, fmtMinutes, workingDays, isHourly as empIsHourly, isFullTime as empIsFullTime, COMPANIES } from "../../config/constants"
import { Bell } from "lucide-react"

const LAST_SEEN_KEY = "kintai_last_seen_anno_at"

export default function Dashboard({ user, t, tk }) {
  const isA = user.role === "admin"
  const isHourly = empIsHourly(user.employment_type)
  const now = new Date()
  const y = now.getFullYear(), m = now.getMonth() + 1
  const [stats, setStats] = useState(null)
  const [todayRec, setTodayRec] = useState(null)
  const [clocking, setClocking] = useState(false)
  const [time, setTime] = useState(new Date())
  const [pendingProfiles, setPendingProfiles] = useState([])
  const [annos, setAnnos] = useState([])
  const [annoShow, setAnnoShow] = useState(false)
  const [annoFm, setAnnoFm] = useState({ title: "", body: "", kind: "info", expires_at: "" })
  const [annoEditId, setAnnoEditId] = useState(null)
  const [annoSub, setAnnoSub] = useState(false)
  const [bellOpen, setBellOpen] = useState(false)
  const [lastSeenAt, setLastSeenAt] = useState(() => localStorage.getItem(LAST_SEEN_KEY) || "1970-01-01T00:00:00Z")
  const [toastAnno, setToastAnno] = useState(null)
  const [toastDismissedIds, setToastDismissedIds] = useState(() => new Set())
  const td = todayStr()

  const loadAnnos = useCallback(async () => {
    const nowIso = new Date().toISOString()
    const rows = await sbGet(`announcements?is_active=eq.true&or=(expires_at.is.null,expires_at.gt.${nowIso})&order=created_at.desc&select=*`, tk)
    setAnnos(rows || [])
  }, [tk])
  useEffect(() => { loadAnnos() }, [loadAnnos])

  const unreadAnnos = useMemo(() => annos.filter(a => new Date(a.created_at) > new Date(lastSeenAt)), [annos, lastSeenAt])

  // 有新通知 → 弹 toast（每条每次会话只弹一次，点击或 5s 后消失）
  useEffect(() => {
    const next = unreadAnnos.find(a => !toastDismissedIds.has(a.id))
    if (!next) return
    setToastAnno(next)
    const timer = setTimeout(() => {
      setToastAnno((cur) => cur?.id === next.id ? null : cur)
      setToastDismissedIds((s) => { const ns = new Set(s); ns.add(next.id); return ns })
    }, 5000)
    return () => clearTimeout(timer)
  }, [unreadAnnos, toastDismissedIds])

  const markAnnosRead = () => {
    const iso = new Date().toISOString()
    setLastSeenAt(iso)
    localStorage.setItem(LAST_SEEN_KEY, iso)
  }

  const openBell = () => {
    setBellOpen(true)
    markAnnosRead()
  }

  const resetAnnoForm = () => { setAnnoFm({ title: "", body: "", kind: "info", expires_at: "" }); setAnnoEditId(null); setAnnoShow(false) }
  const submitAnno = async () => {
    if (!annoFm.title.trim()) return
    setAnnoSub(true)
    const body = {
      title: annoFm.title.trim(),
      body: annoFm.body.trim() || null,
      kind: annoFm.kind,
      expires_at: annoFm.expires_at || null,
    }
    if (annoEditId) {
      await sbPatch(`announcements?id=eq.${annoEditId}`, body, tk)
    } else {
      await sbPost("announcements", { ...body, created_by: user.id }, tk)
    }
    resetAnnoForm(); await loadAnnos(); setAnnoSub(false)
  }
  const editAnno = (a) => {
    setAnnoFm({ title: a.title, body: a.body || "", kind: a.kind || "info", expires_at: a.expires_at ? a.expires_at.slice(0, 10) : "" })
    setAnnoEditId(a.id); setAnnoShow(true); setBellOpen(false)
  }
  const delAnno = async (id) => {
    if (!confirm("删除这条通知？")) return
    await sbDel(`announcements?id=eq.${id}`, tk)
    await loadAnnos()
  }

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
          const todayWeekday = new Date().getDay()
          const [emps, todayAtts, pendL, pendS, pendTc, todayLeaves, pending] = await Promise.all([
            sbGet("employees?is_active=eq.true&select=id,employment_type,days_off", tk),
            sbGet(`attendance_records?work_date=eq.${td}&select=employee_id,clock_in`, tk),
            sbGet("leave_requests?status=eq.申請中&select=id", tk),
            sbGet("day_swap_requests?status=eq.申請中&select=id", tk),
            sbGet("transport_change_requests?status=eq.申請中&select=id", tk),
            sbGet(`leave_requests?status=eq.承認&leave_date=eq.${td}&select=employee_id`, tk),
            sbGet("employees?is_active=eq.true&or=(contract_start_date.is.null,my_number.is.null)&select=id,name,employment_type,hire_date,contract_start_date,my_number,company_id&order=hire_date.desc", tk),
          ])
          const fullTime = (emps || []).filter((e) => empIsFullTime(e.employment_type))
          const expectedToday = fullTime.filter((e) => !(e.days_off || []).includes(todayWeekday))
          const clockedInIds = new Set((todayAtts || []).filter((a) => a.clock_in).map((a) => a.employee_id))
          const onLeaveIds = new Set((todayLeaves || []).map((l) => l.employee_id))
          const absentCount = expectedToday.filter((e) => !clockedInIds.has(e.id) && !onLeaveIds.has(e.id)).length
          setStats({
            empCount: (emps || []).length,
            expectedToday: expectedToday.length,
            clockedInCount: clockedInIds.size,
            absentCount,
            totalPending: (pendL?.length || 0) + (pendS?.length || 0) + (pendTc?.length || 0),
          })
          setPendingProfiles(pending || [])
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
        setStats({ empCount: 0, clockedInCount: 0, expectedToday: 0, absentCount: 0, totalPending: 0, totalW: 0, wd: 0, targetH: 1, leaveBalance: 0, leaveUsed: 0 })
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

  const TimeDisplay = () => (
    <div style={{ background: t.bgC, borderRadius: 16, padding: "20px", border: `1px solid ${t.bd}`, marginBottom: 16, textAlign: "center" }}>
      <div style={{ fontSize: 12, color: t.tm, marginBottom: 4 }}>{time.getFullYear()}年{m}月{time.getDate()}日（{WEEKDAYS[time.getDay()]}）</div>
      <div style={{ fontSize: 38, fontWeight: 200, color: t.tx, fontFamily: "monospace" }}>{pad(time.getHours())}:{pad(time.getMinutes())}:{pad(time.getSeconds())}</div>
    </div>
  )

  const canClock = empIsFullTime(user.employment_type)

  const kindStyle = (k) => k === "warning" ? { c: t.wn, bg: `${t.wn}10`, bd: `${t.wn}40` } : k === "success" ? { c: t.gn, bg: `${t.gn}10`, bd: `${t.gn}40` } : { c: t.ac, bg: `${t.ac}08`, bd: `${t.ac}30` }

  const BellWidget = () => (
    <div style={{ position: "relative", display: "flex", gap: 8, alignItems: "center" }}>
      <button onClick={() => bellOpen ? setBellOpen(false) : openBell()} aria-label="通知" style={{ position: "relative", background: "transparent", border: `1px solid ${t.bd}`, borderRadius: 8, cursor: "pointer", padding: "6px 8px", display: "flex", alignItems: "center", color: t.ts }}>
        <Bell size={18} strokeWidth={1.7} />
        {unreadAnnos.length > 0 && (
          <span style={{ position: "absolute", top: -4, right: -4, background: t.rd, color: "#fff", fontSize: 9, fontWeight: 700, borderRadius: 9, minWidth: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>{unreadAnnos.length}</span>
        )}
      </button>
      {isA && (
        <button onClick={() => { setBellOpen(false); if (annoShow) resetAnnoForm(); else setAnnoShow(true) }} style={{ padding: "6px 12px", borderRadius: 8, border: annoShow ? `1px solid ${t.bd}` : "none", background: annoShow ? "transparent" : t.ac, color: annoShow ? t.ts : "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>{annoShow ? "✕ 关闭" : "+ 发布通知"}</button>
      )}
      {bellOpen && (
        <>
          <div onClick={() => setBellOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, width: 340, maxWidth: "90vw", maxHeight: 420, overflowY: "auto", background: t.bgC, border: `1px solid ${t.bd}`, borderRadius: 10, boxShadow: "0 10px 30px rgba(0,0,0,.18)", zIndex: 50 }}>
            <div style={{ padding: "12px 14px", borderBottom: `1px solid ${t.bl}`, fontSize: 13, fontWeight: 700, color: t.tx, display: "flex", alignItems: "center", gap: 6 }}>
              <Bell size={14} strokeWidth={1.7} color={t.ac} />
              通知（{annos.length}）
            </div>
            {annos.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", fontSize: 11, color: t.tm }}>暂无通知</div>
            ) : (
              annos.map((a) => {
                const s = kindStyle(a.kind)
                return (
                  <div key={a.id} style={{ padding: "10px 14px", borderBottom: `1px solid ${t.bl}`, borderLeft: `3px solid ${s.c}`, background: s.bg }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: s.c }}>{a.title}</div>
                    {a.body && <div style={{ fontSize: 11, color: t.ts, marginTop: 4, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{a.body}</div>}
                    <div style={{ fontSize: 9, color: t.tm, marginTop: 6 }}>{new Date(a.created_at).toLocaleDateString("zh-CN")}{a.expires_at && ` · 到期 ${a.expires_at.slice(0, 10)}`}</div>
                    {isA && (
                      <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                        <button onClick={() => editAnno(a)} style={{ padding: "3px 8px", borderRadius: 4, border: `1px solid ${t.bd}`, background: "transparent", color: t.ts, fontSize: 10, cursor: "pointer" }}>编辑</button>
                        <button onClick={() => delAnno(a.id)} style={{ padding: "3px 8px", borderRadius: 4, border: `1px solid ${t.rd}33`, background: "transparent", color: t.rd, fontSize: 10, cursor: "pointer" }}>删除</button>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </>
      )}
    </div>
  )

  const Toast = () => {
    if (!toastAnno) return null
    const s = kindStyle(toastAnno.kind)
    return (
      <div onClick={() => { setToastDismissedIds((sIds) => { const ns = new Set(sIds); ns.add(toastAnno.id); return ns }); setToastAnno(null) }}
        style={{ position: "fixed", top: 20, right: 20, minWidth: 260, maxWidth: 360, padding: "12px 14px", background: t.bgC, borderRadius: 10, border: `1px solid ${s.c}66`, borderLeft: `4px solid ${s.c}`, boxShadow: "0 10px 30px rgba(0,0,0,.22)", zIndex: 100, cursor: "pointer" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: s.c, fontWeight: 700, marginBottom: 4 }}>
          <Bell size={12} strokeWidth={1.8} /> 新通知
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: t.tx }}>{toastAnno.title}</div>
        {toastAnno.body && <div style={{ fontSize: 11, color: t.ts, marginTop: 4, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{toastAnno.body}</div>}
        <div style={{ fontSize: 9, color: t.tm, marginTop: 6 }}>点击关闭</div>
      </div>
    )
  }

  const PublishForm = () => (
    <div style={{ background: t.bgC, borderRadius: 10, padding: 14, border: `2px solid ${t.ac}33`, marginBottom: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div>
          <label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>标题 *</label>
          <input value={annoFm.title} onChange={(e) => setAnnoFm(p => ({ ...p, title: e.target.value }))} placeholder="例：本月工资发放日延后" style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: `1px solid ${t.bd}`, background: t.bgI, color: t.tx, fontSize: 12, boxSizing: "border-box" }} />
        </div>
        <div>
          <label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>类型</label>
          <select value={annoFm.kind} onChange={(e) => setAnnoFm(p => ({ ...p, kind: e.target.value }))} style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: `1px solid ${t.bd}`, background: t.bgI, color: t.tx, fontSize: 12, boxSizing: "border-box" }}>
            <option value="info">通知 (蓝)</option>
            <option value="warning">警告 (黄)</option>
            <option value="success">喜讯 (绿)</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>到期日（选填）</label>
          <input type="date" value={annoFm.expires_at} onChange={(e) => setAnnoFm(p => ({ ...p, expires_at: e.target.value }))} style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: `1px solid ${t.bd}`, background: t.bgI, color: t.tx, fontSize: 12, boxSizing: "border-box" }} />
        </div>
      </div>
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>内容（选填）</label>
        <textarea value={annoFm.body} onChange={(e) => setAnnoFm(p => ({ ...p, body: e.target.value }))} rows={3} style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: `1px solid ${t.bd}`, background: t.bgI, color: t.tx, fontSize: 12, boxSizing: "border-box", fontFamily: "inherit", resize: "vertical" }} />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={submitAnno} disabled={annoSub || !annoFm.title.trim()} style={{ padding: "7px 18px", borderRadius: 6, border: "none", background: t.ac, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: annoSub || !annoFm.title.trim() ? 0.5 : 1 }}>{annoSub ? "保存中..." : annoEditId ? "保存" : "发布"}</button>
        <button onClick={resetAnnoForm} style={{ padding: "7px 18px", borderRadius: 6, border: `1px solid ${t.bd}`, background: "transparent", color: t.ts, fontSize: 12, cursor: "pointer" }}>取消</button>
      </div>
    </div>
  )

  const Header = ({ title }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: t.tx, margin: 0 }}>{title}</h2>
      <BellWidget />
    </div>
  )

  if (isA) {
    return (
      <div>
        <Header title="管理面板" />
        {annoShow && <PublishForm />}
        <Toast />
        {canClock ? <ClockSection size={96} /> : <TimeDisplay />}

        <div style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: t.tx, margin: "0 0 10px" }}>勤怠概览</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10 }}>
            <Card label="已打卡人数" value={`${stats.clockedInCount}人`} sub={`今日应出勤 ${stats.expectedToday}人`} color={t.gn} />
            <Card label="异常考勤" value={`${stats.absentCount}条`} sub="未打卡且无请假" color={stats.absentCount > 0 ? t.rd : t.gn} />
            <Card label="待审批" value={`${stats.totalPending}件`} sub="请假 / 换休 / 交通费" color={stats.totalPending > 0 ? t.wn : t.gn} />
          </div>
        </div>

        {pendingProfiles.length > 0 && (
          <div style={{ padding: "12px 14px", borderRadius: 10, border: `1px solid ${t.wn}40`, background: `${t.wn}08`, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: 8, background: t.wn }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: t.tx }}>还有 {pendingProfiles.length} 个档案待完善</div>
                <div style={{ fontSize: 10, color: t.tm, marginTop: 2 }}>新员工缺合同日期或 My Number，请在「人事档案」中补齐</div>
              </div>
            </div>
            <span style={{ fontSize: 10, color: t.wn, fontWeight: 600, whiteSpace: "nowrap" }}>去人事档案补齐 →</span>
          </div>
        )}
      </div>
    )
  }

  const pct = stats.targetH > 0 ? Math.min((stats.totalW / stats.targetH) * 100, 150) : 0
  const barColor = pct >= 95 ? t.gn : pct >= 80 ? t.wn : t.rd

  return (
    <div>
      <Header title="首页" />
      {annoShow && <PublishForm />}
      <Toast />
      {canClock ? <ClockSection size={96} /> : <TimeDisplay />}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 16 }}>
        <Card label={isHourly ? "本月上班天数" : "本月出勤"} value={`${stats.wd}天`} />
        {!isHourly && <Card label="本月工时" value={fmtMinutes(stats.totalW)} color={t.gn} />}
        {!isHourly && <Card label="有休余额" value={`${stats.leaveBalance}天`} color={t.ac} sub={`已用${stats.leaveUsed}天`} />}
      </div>
      {!isHourly && (
        <div style={{ background: t.bgC, borderRadius: 12, padding: "16px 18px", border: `1px solid ${t.bd}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: t.ts, marginBottom: 6 }}>
            <span>工时充足度</span><span>{fmtMinutes(stats.totalW)} / {fmtMinutes(stats.targetH)}</span>
          </div>
          <div style={{ height: 10, background: t.bgI, borderRadius: 5, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: barColor, borderRadius: 5, transition: "width .5s" }} />
          </div>
          <div style={{ fontSize: 10, color: barColor, marginTop: 4, textAlign: "right" }}>{pct.toFixed(0)}%</div>
        </div>
      )}
    </div>
  )
}
