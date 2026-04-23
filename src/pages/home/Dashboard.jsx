import { useState, useEffect, useCallback, useMemo } from "react"
import { sbGet, sbPost, sbPatch, sbDel } from "../../api/supabase"
import { WEEKDAYS, pad, todayStr, fmtMinutes, workingDays, isHourly as empIsHourly, isFullTime as empIsFullTime, COMPANIES, fmtDateW } from "../../config/constants"
import { Bell, Plus, Users, AlertCircle, FileText, ChevronRight, Fingerprint, Coffee, Zap, Moon, Check, Activity, ClipboardList, Table as TableIcon, UserCircle2 } from "lucide-react"

const LAST_SEEN_KEY = "kintai_last_seen_anno_at"

export default function Dashboard({ user, t, tk, onNav, onLogout, mobile }) {
  const isA = user.role === "admin"
  const isHourly = empIsHourly(user.employment_type)
  const now = new Date()
  const y = now.getFullYear(), m = now.getMonth() + 1
  const [stats, setStats] = useState(null)
  const [todayRec, setTodayRec] = useState(null)
  const [clocking, setClocking] = useState(false)
  const [time, setTime] = useState(new Date())
  const [pendingProfiles, setPendingProfiles] = useState([])
  const [unsubmittedMonths, setUnsubmittedMonths] = useState([])
  const [last7dHours, setLast7dHours] = useState(0)
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
            pendingLeave: pendL?.length || 0,
            pendingSwap: pendS?.length || 0,
            pendingTrans: pendTc?.length || 0,
            totalPending: (pendL?.length || 0) + (pendS?.length || 0) + (pendTc?.length || 0),
          })
          setPendingProfiles(pending || [])
        } else {
          const [atts, lb, lr] = await Promise.all([
            sbGet(`attendance_records?employee_id=eq.${user.id}&work_date=gte.${from}&work_date=lte.${to}&select=work_date,clock_in,clock_out,break_start,break_end,work_minutes,note`, tk),
            sbGet(`leave_balances?employee_id=eq.${user.id}&select=*`, tk),
            sbGet(`leave_requests?employee_id=eq.${user.id}&status=eq.承認&leave_type=eq.有休&select=id`, tk),
          ])
          const totalW = atts.reduce((s, a) => s + Number(a.work_minutes || 0), 0)
          const bal = lb.reduce((s, b) => s + Number(b.granted_days || 0) + Number(b.carried_over_days || 0), 0)
          // 打卡异常：过去日期 clock_in 有但 clock_out 没；或 break_start 有但 break_end 没
          const dateIssues = []
          for (const a of atts) {
            if (a.work_date >= td) continue
            if (a.clock_in && !a.clock_out) dateIssues.push({ date: a.work_date, kind: "no_out" })
            else if (a.break_start && !a.break_end) dateIssues.push({ date: a.work_date, kind: "no_break_end" })
          }
          dateIssues.sort((x, y) => y.date.localeCompare(x.date))
          // 工时偏低：截至今日的非周末工作日 × 8h × 0.7 为阈值
          const lastD = Math.min(now.getDate(), new Date(y, m, 0).getDate())
          let workdaysSoFar = 0
          for (let d = 1; d <= lastD; d++) {
            const w = new Date(y, m - 1, d).getDay()
            if (w !== 0 && w !== 6) workdaysSoFar++
          }
          const expectedMinSoFar = workdaysSoFar * 8 * 60
          const hoursLow = expectedMinSoFar > 0 && totalW < expectedMinSoFar * 0.7
          setStats({
            totalW, wd: atts.filter((a) => a.clock_in).length,
            targetH: workingDays(y, m) * 8 * 60,
            leaveBalance: bal - lr.length, leaveUsed: lr.length,
            dateIssues, hoursLow, expectedMinSoFar,
          })
        }
        await loadToday()
      } catch (e) {
        console.error(e)
        setStats({ empCount: 0, clockedInCount: 0, expectedToday: 0, absentCount: 0, totalPending: 0, totalW: 0, wd: 0, targetH: 1, leaveBalance: 0, leaveUsed: 0 })
      }
    })()
  }, [tk, user.id, isA])

  // baito：最近 7 天工时（用于 28h 合规提醒）
  useEffect(() => {
    if (isA || !isHourly) return
    (async () => {
      const end = new Date()
      const start = new Date(end); start.setDate(end.getDate() - 6)
      const sd = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`
      const ed = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`
      const entries = await sbGet(`work_entries?employee_id=eq.${user.id}&work_date=gte.${sd}&work_date=lte.${ed}&business_type=not.is.null&select=work_minutes`, tk)
      const mins = (entries || []).reduce((s, e) => s + (e.work_minutes || 0), 0)
      setLast7dHours(mins / 60)
    })()
  }, [tk, user.id, isA, isHourly])

  // 档案完善度（仅老师自己）
  const profileCompletion = useMemo(() => {
    if (isA) return null
    const foreign = user.nationality && user.nationality !== "日本"
    const required = [
      { key: "name", label: "汉字姓名" },
      { key: "name_kana", label: "假名" },
      { key: "gender", label: "性别" },
      { key: "birth_date", label: "生年月日" },
      { key: "phone", label: "电话" },
      { key: "email", label: "邮箱" },
      { key: "postal_code", label: "邮编" },
      { key: "address", label: "住址" },
      { key: "bank_name", label: "银行名" },
      { key: "bank_branch", label: "支店名" },
      { key: "bank_account_number", label: "口座番号" },
      { key: "bank_account_holder", label: "口座名义" },
      { key: "my_number", label: "マイナンバー" },
    ]
    if (foreign) {
      required.push(
        { key: "residence_status", label: "在留资格" },
        { key: "residence_card_number", label: "在留卡号" },
        { key: "residence_expiry", label: "在留期限" },
      )
    }
    const missing = required.filter(f => !user[f.key] || String(user[f.key]).trim() === "")
    const filled = required.length - missing.length
    const pct = Math.round(filled / required.length * 100)
    return { pct, missing, total: required.length, filled }
  }, [user, isA])

  useEffect(() => {
    if (isA || !isHourly) return
    (async () => {
      const subs = await sbGet(`monthly_report_submissions?employee_id=eq.${user.id}&status=eq.submitted&select=year,month`, tk)
      const submittedSet = new Set((subs || []).map(s => `${s.year}-${String(s.month).padStart(2, "0")}`))
      const months = []
      let yy = 2026, mm = 4
      const now = new Date()
      const endY = now.getFullYear(), endM = now.getMonth() + 1
      while (yy < endY || (yy === endY && mm <= endM)) {
        const key = `${yy}-${String(mm).padStart(2, "0")}`
        if (!submittedSet.has(key)) months.push({ year: yy, month: mm })
        mm++
        if (mm > 12) { mm = 1; yy++ }
      }
      setUnsubmittedMonths(months)
    })()
  }, [tk, user.id, isA, isHourly])

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

  const navTileStyle = (accent) => ({
    display: "flex", alignItems: "center", gap: 12, padding: "14px 16px",
    background: "rgba(255,255,255,.55)", border: `1px solid rgba(255,255,255,.9)`,
    borderRadius: 14, cursor: "pointer", fontFamily: "inherit", textAlign: "left",
    transition: "border-color .2s, box-shadow .2s, transform .15s",
    boxShadow: `0 6px 20px -12px ${accent}33`,
  })

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
                    <div style={{ fontSize: 9, color: t.tm, marginTop: 6 }}>{fmtDateW(a.created_at)}{a.expires_at && ` · 到期 ${fmtDateW(a.expires_at)}`}</div>
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
    const stateLabel = (() => {
      if (!ci) return "Current Status · 未打卡"
      if (co) return `已退勤 ${co.slice(0, 5)} · 辛苦了`
      if (bs && !be) return `休息中 ${bs.slice(0, 5)}~`
      if (bs && be) return `已出勤 ${ci.slice(0, 5)} · 休憩 ${bs.slice(0, 5)}-${be.slice(0, 5)}`
      return `已出勤 ${ci.slice(0, 5)}`
    })()

    const clockButtons = (() => {
      if (!canClock) return null
      if (clocking) return <button disabled className="clock-btn clock-btn-lg ac"><Fingerprint size={36} strokeWidth={1} className="clock-icon" /><span className="clock-label">处理中</span></button>
      if (!ci) return (
        <div style={{ position: "relative" }}>
          <div className="clock-glow" />
          <button onClick={() => clock("in")} className="clock-btn clock-btn-lg ac"><Fingerprint size={40} strokeWidth={1} className="clock-icon" /><span className="clock-label">出勤</span></button>
        </div>
      )
      if (co) return <div style={{ color: "#10b981", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}><Check size={40} strokeWidth={1.4} /><span style={{ fontSize: 12, letterSpacing: ".2em" }}>辛苦了</span></div>
      if (onBreak) return <button onClick={() => clock("be")} className="clock-btn clock-btn-md gn"><Zap size={28} strokeWidth={1.2} className="clock-icon" /><span className="clock-label">休息结束</span></button>
      return (
        <>
          {!be && <button onClick={() => clock("bs")} className="clock-btn clock-btn-md wn"><Coffee size={26} strokeWidth={1.2} className="clock-icon" /><span className="clock-label">开始休息</span></button>}
          <button onClick={() => clock("out")} className="clock-btn clock-btn-md pp"><Moon size={26} strokeWidth={1.2} className="clock-icon" /><span className="clock-label">退勤</span></button>
        </>
      )
    })()

    return (
      <div>
        <div>
          <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ color: "rgba(59,130,246,.8)", fontSize: 11, fontWeight: 600, letterSpacing: ".2em", textTransform: "uppercase" }}>早稲田理工塾 OS</div>
              <h1 style={{ fontSize: 20, fontWeight: 500, color: "#1e293b", marginTop: 4, letterSpacing: ".04em" }}>勤怠管理面板</h1>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", position: "relative" }}>
              <button className="icon-btn" onClick={() => bellOpen ? setBellOpen(false) : openBell()} aria-label="通知">
                <Bell size={18} strokeWidth={1.6} />
                {unreadAnnos.length > 0 && <span className="bell-dot" />}
              </button>
              <button className="pill-btn" onClick={() => { setBellOpen(false); if (annoShow) resetAnnoForm(); else setAnnoShow(true) }}>
                <Plus size={14} strokeWidth={2} /> {annoShow ? "关闭" : "发布通知"}
              </button>
              {bellOpen && (
                <>
                  <div onClick={() => setBellOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
                  <div style={{ position: "absolute", top: "calc(100% + 10px)", right: 0, width: 340, maxWidth: "92vw", maxHeight: 420, overflowY: "auto", background: t.bgC, border: `1px solid ${t.bd}`, borderRadius: 12, boxShadow: "0 16px 48px rgba(15,23,42,.18)", zIndex: 50 }}>
                    <div style={{ padding: "12px 14px", borderBottom: `1px solid ${t.bl}`, fontSize: 13, fontWeight: 700, color: t.tx, display: "flex", alignItems: "center", gap: 6 }}>
                      <Bell size={14} strokeWidth={1.7} color={t.ac} /> 通知（{annos.length}）
                    </div>
                    {annos.length === 0 ? (
                      <div style={{ padding: 24, textAlign: "center", fontSize: 11, color: t.tm }}>暂无通知</div>
                    ) : annos.map((a) => {
                      const s = kindStyle(a.kind)
                      return (
                        <div key={a.id} style={{ padding: "10px 14px", borderBottom: `1px solid ${t.bl}`, borderLeft: `3px solid ${s.c}`, background: s.bg }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: s.c }}>{a.title}</div>
                          {a.body && <div style={{ fontSize: 11, color: t.ts, marginTop: 4, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{a.body}</div>}
                          <div style={{ fontSize: 9, color: t.tm, marginTop: 6 }}>{fmtDateW(a.created_at)}{a.expires_at && ` · 到期 ${fmtDateW(a.expires_at)}`}</div>
                          <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                            <button onClick={() => editAnno(a)} style={{ padding: "3px 8px", borderRadius: 4, border: `1px solid ${t.bd}`, background: "transparent", color: t.ts, fontSize: 10, cursor: "pointer" }}>编辑</button>
                            <button onClick={() => delAnno(a.id)} style={{ padding: "3px 8px", borderRadius: 4, border: `1px solid ${t.rd}33`, background: "transparent", color: t.rd, fontSize: 10, cursor: "pointer" }}>删除</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          </header>

          {annoShow && <PublishForm />}
          <Toast />

          <div className="home-grid">
            {/* 打卡主面板 */}
            <div className="glass-card clock-panel span-4">
              <div className="clock-info">
                <div className="clock-time-label">
                  {time.getFullYear()}年{m}月{time.getDate()}日 {WEEKDAYS[time.getDay()]}曜日
                </div>
                <div className="clock-time">
                  {pad(time.getHours())}:{pad(time.getMinutes())}:{pad(time.getSeconds())}
                </div>
                <div className="clock-status">
                  {stateLabel}
                </div>
              </div>
              {clockButtons && (
                <div className="clock-buttons">
                  {clockButtons}
                </div>
              )}
            </div>

            {/* 已打卡 */}
            <div className="glass-card stat-card hv-emerald">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="stat-label">已打卡人数</span>
                <Users size={16} color="rgba(16,185,129,.7)" strokeWidth={1.5} />
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                  <span className="stat-value em">{stats.clockedInCount}</span>
                  <span className="stat-sub">/{stats.expectedToday}</span>
                </div>
                <div className="stat-sub">应出勤</div>
              </div>
            </div>

            {/* 异常考勤 */}
            <div className="glass-card stat-card hv-rose">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="stat-label">异常考勤</span>
                <AlertCircle size={16} color="rgba(244,63,94,.7)" strokeWidth={1.5} />
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                  <span className="stat-value rose">{stats.absentCount}</span>
                  <span className="stat-sub">条</span>
                </div>
                <div className="stat-sub">未打卡且无请假</div>
              </div>
            </div>

            {/* 待审批 */}
            <div className="glass-card stat-card hv-amber span-2">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="stat-label">待审批事项</span>
                <FileText size={16} color="rgba(245,158,11,.7)" strokeWidth={1.5} />
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                  <span className="stat-value amber">{stats.totalPending}</span>
                  <span className="stat-sub">件</span>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <span className="home-chip">请假 {stats.pendingLeave}</span>
                  <span className="home-chip">换休 {stats.pendingSwap}</span>
                  <span className="home-chip">交通 {stats.pendingTrans}</span>
                </div>
              </div>
            </div>
          </div>

          {pendingProfiles.length > 0 && (
            <button onClick={() => onNav && onNav("empmgr")} className="home-banner" style={{ marginTop: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(254,215,170,.5)", border: "1px solid rgba(254,215,170,.8)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fb923c" }}>
                  <AlertCircle size={14} strokeWidth={2} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "rgba(234,88,12,.9)", letterSpacing: ".02em" }}>{pendingProfiles.length} 个档案待完善</div>
                  <div style={{ fontSize: 11, color: "rgba(249,115,22,.7)", marginTop: 2 }}>新员工合同或 My Number 缺失</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", color: "rgba(249,115,22,.8)", fontSize: 12, fontWeight: 500, letterSpacing: ".08em", whiteSpace: "nowrap" }}>
                前往处理 <ChevronRight size={14} />
              </div>
            </button>
          )}
        </div>
      </div>
    )
  }

  const pct = stats.targetH > 0 ? Math.min((stats.totalW / stats.targetH) * 100, 150) : 0
  const barColor = pct >= 95 ? "#10b981" : pct >= 80 ? "#f59e0b" : "#f43f5e"

  const userStateLabel = (() => {
    if (!canClock) return `${user.name} 老师，辛苦了`
    if (!ci) return "Current Status · 未打卡"
    if (co) return `已退勤 ${co.slice(0, 5)} · 辛苦了`
    if (bs && !be) return `休息中 ${bs.slice(0, 5)}~`
    if (bs && be) return `已出勤 ${ci.slice(0, 5)} · 休憩 ${bs.slice(0, 5)}-${be.slice(0, 5)}`
    return `已出勤 ${ci.slice(0, 5)}`
  })()

  const userClockButtons = (() => {
    if (!canClock) return null
    if (clocking) return <button disabled className="clock-btn clock-btn-lg ac"><Fingerprint size={36} strokeWidth={1} className="clock-icon" /><span className="clock-label">处理中</span></button>
    if (!ci) return (
      <div style={{ position: "relative" }}>
        <div className="clock-glow" />
        <button onClick={() => clock("in")} className="clock-btn clock-btn-lg ac"><Fingerprint size={40} strokeWidth={1} className="clock-icon" /><span className="clock-label">出勤</span></button>
      </div>
    )
    if (co) return <div style={{ color: "#10b981", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}><Check size={40} strokeWidth={1.4} /><span style={{ fontSize: 12, letterSpacing: ".2em" }}>辛苦了</span></div>
    if (onBreak) return <button onClick={() => clock("be")} className="clock-btn clock-btn-md gn"><Zap size={28} strokeWidth={1.2} className="clock-icon" /><span className="clock-label">休息结束</span></button>
    return (
      <>
        {!be && <button onClick={() => clock("bs")} className="clock-btn clock-btn-md wn"><Coffee size={26} strokeWidth={1.2} className="clock-icon" /><span className="clock-label">开始休息</span></button>}
        <button onClick={() => clock("out")} className="clock-btn clock-btn-md pp"><Moon size={26} strokeWidth={1.2} className="clock-icon" /><span className="clock-label">退勤</span></button>
      </>
    )
  })()

  return (
    <div>
      <div>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ color: "rgba(59,130,246,.8)", fontSize: 11, fontWeight: 600, letterSpacing: ".2em", textTransform: "uppercase" }}>早稲田理工塾 OS</div>
            <h1 style={{ fontSize: 20, fontWeight: 500, color: "#1e293b", marginTop: 4, letterSpacing: ".04em" }}>{user.name} · 我的面板</h1>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", position: "relative", alignSelf: "flex-end" }}>
            <button className="icon-btn" onClick={() => bellOpen ? setBellOpen(false) : openBell()} aria-label="通知">
              <Bell size={18} strokeWidth={1.6} />
              {unreadAnnos.length > 0 && <span className="bell-dot" />}
            </button>
            {mobile && onLogout && (
              <button onClick={onLogout} style={{ padding: "6px 12px", borderRadius: 999, border: `1px solid ${t.bd}`, background: "rgba(255,255,255,0.65)", color: t.tm, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 500 }}>退出</button>
            )}
            {bellOpen && (
              <>
                <div onClick={() => setBellOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
                <div style={{ position: "absolute", top: "calc(100% + 10px)", right: 0, width: 340, maxWidth: "92vw", maxHeight: 420, overflowY: "auto", background: t.bgC, border: `1px solid ${t.bd}`, borderRadius: 12, boxShadow: "0 16px 48px rgba(15,23,42,.18)", zIndex: 50 }}>
                  <div style={{ padding: "12px 14px", borderBottom: `1px solid ${t.bl}`, fontSize: 13, fontWeight: 700, color: t.tx, display: "flex", alignItems: "center", gap: 6 }}>
                    <Bell size={14} strokeWidth={1.7} color={t.ac} /> 通知（{annos.length}）
                  </div>
                  {annos.length === 0 ? (
                    <div style={{ padding: 24, textAlign: "center", fontSize: 11, color: t.tm }}>暂无通知</div>
                  ) : annos.map((a) => {
                    const s = kindStyle(a.kind)
                    return (
                      <div key={a.id} style={{ padding: "10px 14px", borderBottom: `1px solid ${t.bl}`, borderLeft: `3px solid ${s.c}`, background: s.bg }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: s.c }}>{a.title}</div>
                        {a.body && <div style={{ fontSize: 11, color: t.ts, marginTop: 4, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{a.body}</div>}
                        <div style={{ fontSize: 9, color: t.tm, marginTop: 6 }}>{fmtDateW(a.created_at)}{a.expires_at && ` · 到期 ${fmtDateW(a.expires_at)}`}</div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </header>

        <Toast />

        <div className="home-grid">
          {/* 打卡 / 时钟主面板 */}
          <div className="glass-card clock-panel span-4">
            <div className="clock-info">
              <div className="clock-time-label">
                {time.getFullYear()}年{m}月{time.getDate()}日 {WEEKDAYS[time.getDay()]}曜日
              </div>
              <div className="clock-time">
                {pad(time.getHours())}:{pad(time.getMinutes())}:{pad(time.getSeconds())}
              </div>
              <div className="clock-status">
                {userStateLabel}
              </div>
            </div>
            {userClockButtons && (
              <div className="clock-buttons">
                {userClockButtons}
              </div>
            )}
          </div>

          {/* 本月打卡记录（仅正/契）— 放在本月出勤前，提示异常 */}
          {!isHourly && (() => {
            const dateIssues = stats.dateIssues || []
            const hoursLow = !!stats.hoursLow
            const ok = dateIssues.length === 0 && !hoursLow
            const CardTag = ok ? "div" : "button"
            const shortfallH = hoursLow ? Math.round((stats.expectedMinSoFar - stats.totalW) / 60) : 0
            return (
              <CardTag
                {...(ok ? {} : { onClick: () => onNav("att"), type: "button" })}
                className={`glass-card stat-card span-2 ${ok ? "hv-emerald" : "hv-amber"}`}
                style={ok ? undefined : { border: "none", textAlign: "left", cursor: "pointer", fontFamily: "inherit", color: "inherit" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="stat-label">本月打卡记录</span>
                  {ok
                    ? <Check size={16} color="rgba(16,185,129,.85)" strokeWidth={2} />
                    : <AlertCircle size={16} color="rgba(245,158,11,.85)" strokeWidth={1.8} />}
                </div>
                {ok ? (
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span className="stat-value em" style={{ fontSize: 22 }}>正常</span>
                    <span className="stat-sub">无异常</span>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                        <span className="stat-value amber">{hoursLow ? `-${shortfallH}h` : dateIssues.length}</span>
                        <span className="stat-sub">{hoursLow ? "工时偏低" : "处待补"}</span>
                      </div>
                      {dateIssues.length > 0 && (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                          {dateIssues.slice(0, 3).map((i) => (
                            <span key={i.date} className="home-chip" title={i.kind === "no_out" ? "未退勤" : "休息未结束"}>
                              {Number(i.date.slice(5, 7))}/{Number(i.date.slice(8, 10))}
                            </span>
                          ))}
                          {dateIssues.length > 3 && <span className="home-chip">+{dateIssues.length - 3}</span>}
                        </div>
                      )}
                    </div>
                    {hoursLow && dateIssues.length > 0 && (
                      <div className="stat-sub" style={{ fontSize: 10 }}>另有 {dateIssues.length} 处打卡待补</div>
                    )}
                  </div>
                )}
              </CardTag>
            )
          })()}

          {/* 本月出勤 / 上班天数 */}
          <div className={`glass-card stat-card hv-emerald span-2${isHourly ? " m-half" : ""}`}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="stat-label">{isHourly ? "本月上班天数" : "本月出勤"}</span>
              <Users size={16} color="rgba(16,185,129,.7)" strokeWidth={1.5} />
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
              <span className="stat-value em">{stats.wd}</span>
              <span className="stat-sub">天</span>
            </div>
          </div>

          {/* 待提交工时报表（仅 baito） */}
          {isHourly && unsubmittedMonths.length > 0 && (
            <button onClick={() => onNav("work")} className="glass-card stat-card hv-amber span-2 m-half" style={{ border: "none", textAlign: "left", cursor: "pointer", fontFamily: "inherit", color: "inherit" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="stat-label">待提交报表</span>
                <AlertCircle size={16} color="rgba(245,158,11,.7)" strokeWidth={1.5} />
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                  <span className="stat-value amber">{unsubmittedMonths.length}</span>
                  <span className="stat-sub">个月</span>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {unsubmittedMonths.slice(-3).map(({ year, month }) => (
                    <span key={`${year}-${month}`} className="home-chip">{month}月</span>
                  ))}
                </div>
              </div>
            </button>
          )}

          {/* 最近 7 天累计（28h 合规）— baito */}
          {isHourly && (() => {
            const h = last7dHours
            const over = h >= 28
            const red = h >= 25
            const amber = h >= 20
            const color = over || red ? "#f43f5e" : amber ? "#f59e0b" : "#10b981"
            const text = over ? "已超 28h 红线" : red ? "濒临 28h 红线" : amber ? "工时偏高" : "合规范围内"
            const hv = over || red ? "hv-rose" : amber ? "hv-amber" : "hv-emerald"
            return (
              <div className={`glass-card stat-card ${hv} span-2 m-half`}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="stat-label">最近 7 天累计</span>
                  <Activity size={16} color={`${color}B3`} strokeWidth={1.5} />
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                    <span className="stat-value" style={{ color }}>{h.toFixed(1)}</span>
                    <span className="stat-sub">/ 28h</span>
                  </div>
                  <div className="stat-sub" style={{ color }}>{text}</div>
                </div>
              </div>
            )
          })()}

          {/* 提交月报入口双按钮（仅 baito） */}
          {isHourly && (
            <div className="glass-card span-4" style={{ padding: "18px 22px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span className="stat-label">提交月报</span>
                <span className="stat-sub" style={{ color: "#94a3b8" }}>选一个方式填你的工时</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <button onClick={() => onNav("work")} className="nav-tile" style={navTileStyle("#3b82f6")}>
                  <ClipboardList size={22} strokeWidth={1.5} color="#3b82f6" />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", letterSpacing: ".02em" }}>按日记录</div>
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>一条一条填，适合少量</div>
                  </div>
                  <ChevronRight size={16} color="#94a3b8" style={{ marginLeft: "auto" }} />
                </button>
                <button onClick={() => onNav("upload")} className="nav-tile" style={navTileStyle("#10b981")}>
                  <TableIcon size={22} strokeWidth={1.5} color="#10b981" />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", letterSpacing: ".02em" }}>一键上传</div>
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Excel 整表导入，适合多条</div>
                  </div>
                  <ChevronRight size={16} color="#94a3b8" style={{ marginLeft: "auto" }} />
                </button>
              </div>
            </div>
          )}

          {/* 档案完善提醒 —— baito 未 100% 才显示 */}
          {isHourly && profileCompletion && profileCompletion.pct < 100 && (
            <button onClick={() => onNav && onNav("empmgr")} className="home-banner span-4" style={{ marginTop: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, minWidth: 0 }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(254,215,170,.5)", border: "1px solid rgba(254,215,170,.8)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fb923c", flexShrink: 0 }}>
                  <UserCircle2 size={16} strokeWidth={1.8} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: "rgba(234,88,12,.9)", letterSpacing: ".02em" }}>个人档案完善度 {profileCompletion.pct}%</span>
                    <span style={{ fontSize: 11, color: "rgba(249,115,22,.7)" }}>{profileCompletion.filled} / {profileCompletion.total} 项</span>
                  </div>
                  <div style={{ height: 5, background: "rgba(254,215,170,.3)", borderRadius: 3, overflow: "hidden", marginTop: 6, marginBottom: 4, maxWidth: 380 }}>
                    <div style={{ height: "100%", width: `${profileCompletion.pct}%`, background: "linear-gradient(90deg, #fb923c, #f59e0b)", borderRadius: 3, transition: "width .5s" }} />
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(249,115,22,.7)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    还缺：{profileCompletion.missing.slice(0, 5).map(m => m.label).join("、")}{profileCompletion.missing.length > 5 ? ` 等 ${profileCompletion.missing.length} 项` : ""}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", color: "rgba(249,115,22,.8)", fontSize: 12, fontWeight: 500, letterSpacing: ".08em", whiteSpace: "nowrap" }}>
                去完善 <ChevronRight size={14} />
              </div>
            </button>
          )}

          {/* 本月工时（全职） */}
          {!isHourly && (
            <div className="glass-card stat-card hv-amber span-2">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="stat-label">本月工时</span>
                <FileText size={16} color="rgba(245,158,11,.7)" strokeWidth={1.5} />
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                <span className="stat-value amber">{fmtMinutes(stats.totalW)}</span>
              </div>
            </div>
          )}

          {/* 有休余额（全职） */}
          {!isHourly && (
            <div className="glass-card stat-card hv-emerald span-2">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="stat-label">有休余额</span>
                <AlertCircle size={16} color="rgba(59,130,246,.7)" strokeWidth={1.5} />
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                  <span className="stat-value" style={{ color: "#3b82f6" }}>{stats.leaveBalance}</span>
                  <span className="stat-sub">天</span>
                </div>
                <div className="stat-sub">已用 {stats.leaveUsed}</div>
              </div>
            </div>
          )}

          {/* 工时充足度（全职） */}
          {!isHourly && (
            <div className="glass-card span-4" style={{ padding: "18px 22px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#64748b", marginBottom: 8, letterSpacing: ".05em" }}>
                <span className="stat-label" style={{ color: "#64748b" }}>工时充足度</span>
                <span style={{ fontFamily: "monospace", color: "#94a3b8" }}>{fmtMinutes(stats.totalW)} / {fmtMinutes(stats.targetH)}</span>
              </div>
              <div style={{ height: 8, background: "rgba(226,232,240,.6)", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: barColor, borderRadius: 4, transition: "width .5s" }} />
              </div>
              <div style={{ fontSize: 10, color: barColor, marginTop: 6, textAlign: "right", fontWeight: 500 }}>{pct.toFixed(0)}%</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
