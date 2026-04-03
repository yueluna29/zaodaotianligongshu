import { useState, useEffect, useCallback } from "react"
import { sbGet, sbPost, sbPatch, sbDel } from "../../api/supabase"
import { LEAVE_TYPES, WEEKDAYS, daysInMonth, weekday, isWeekend, pad, todayStr, fmtMinutes, workingDays } from "../../config/constants"
import { Pencil, Trash2, Plus, Save } from "lucide-react"

const mkTrans = () => ({ _key: Math.random().toString(36).slice(2), _isNew: true, _dirty: false, claim_date: "", route: "", round_trip: true, amount: "", note: "" })
const mkComm = () => ({ _key: Math.random().toString(36).slice(2), _isNew: true, _dirty: false, entry_date: "", seq_number: "", student_name: "", tuition_amount: "", commission_rate: "", commission_amount: 0 })

export default function AttendanceList({ user, t, tk }) {
  const now = new Date()
  const [y, sY] = useState(now.getFullYear())
  const [m, sM] = useState(now.getMonth() + 1)
  const [recs, sRecs] = useState({})
  const [ed, sEd] = useState(false)
  const [dr, sDr] = useState({})
  const [ld, sLd] = useState(true)
  const [sv, sSv] = useState(false)
  const days = daysInMonth(y, m)

  // 交通费 + 签单提成
  const [transRows, setTransRows] = useState([])
  const [commRows, setCommRows] = useState([])
  const [editingKeys, setEditingKeys] = useState(new Set())

  const load = useCallback(async () => {
    sLd(true)
    const from = `${y}-${pad(m)}-01`, to = `${y}-${pad(m)}-${pad(days)}`
    const [d, tr, cm] = await Promise.all([
      sbGet(`attendance_records?employee_id=eq.${user.id}&work_date=gte.${from}&work_date=lte.${to}&order=work_date`, tk),
      sbGet(`transportation_claims?employee_id=eq.${user.id}&claim_date=gte.${from}&claim_date=lte.${to}&order=claim_date&select=*`, tk),
      user.has_commission ? sbGet(`commission_entries?employee_id=eq.${user.id}&entry_date=gte.${from}&entry_date=lte.${to}&order=entry_date,seq_number&select=*`, tk) : Promise.resolve([]),
    ])
    const mp = {}; (d || []).forEach((r) => { mp[r.work_date] = r }); sRecs(mp)
    const trLoaded = (tr || []).map(r => ({ ...r, _key: r.id, _isNew: false, _dirty: false, amount: String(r.amount || "") }))
    setTransRows([...trLoaded, ...Array.from({ length: 2 }, mkTrans)])
    const cmLoaded = (cm || []).map(r => ({ ...r, _key: r.id, _isNew: false, _dirty: false, seq_number: String(r.seq_number || ""), tuition_amount: String(r.tuition_amount || ""), commission_rate: String(r.commission_rate || ""), commission_amount: Number(r.commission_amount || 0) }))
    setCommRows([...cmLoaded, ...Array.from({ length: 2 }, mkComm)])
    setEditingKeys(new Set())
    sLd(false)
  }, [y, m, days, user.id, tk, user.has_commission])

  useEffect(() => { load() }, [load])

  const chg = (d) => { let nm = m + d, ny = y; if (nm > 12) { nm = 1; ny++ } else if (nm < 1) { nm = 12; ny-- } sY(ny); sM(nm); sEd(false) }

  // ====== 勤怠编辑 ======
  const startEd = () => {
    const d = {}
    for (let i = 1; i <= days; i++) {
      const ds = `${y}-${pad(m)}-${pad(i)}`; const r = recs[ds]
      d[ds] = { ci: r?.clock_in?.slice(0, 5) || "", co: r?.clock_out?.slice(0, 5) || "", bs: r?.break_start?.slice(0, 5) || "", be: r?.break_end?.slice(0, 5) || "", nt: r?.note || "" }
    }
    sDr(d); sEd(true)
  }

  const saveAtt = async () => {
    sSv(true)
    const rows = [], dels = []
    for (let i = 1; i <= days; i++) {
      const ds = `${y}-${pad(m)}-${pad(i)}`; const d = dr[ds]; const existing = recs[ds]
      if (!d) continue
      const hasData = d.ci || d.co || d.nt
      if (hasData) rows.push({ employee_id: user.id, work_date: ds, clock_in: d.ci ? d.ci + ":00" : null, clock_out: d.co ? d.co + ":00" : null, break_start: d.bs ? d.bs + ":00" : null, break_end: d.be ? d.be + ":00" : null, note: d.nt || null })
      else if (existing) dels.push(existing.id)
    }
    if (rows.length) await sbPost("attendance_records", rows, tk, "?on_conflict=employee_id,work_date")
    for (const id of dels) await sbDel(`attendance_records?id=eq.${id}`, tk)
    await load(); sEd(false); sSv(false)
  }

  // ====== 交通费 + 签单操作 ======
  const updateTrans = (key, field, value) => setTransRows(prev => prev.map(r => r._key === key ? { ...r, [field]: value, _dirty: true } : r))
  const updateComm = (key, field, value) => {
    setCommRows(prev => prev.map(r => {
      if (r._key !== key) return r
      const next = { ...r, [field]: value, _dirty: true }
      next.commission_amount = Math.round((parseFloat(next.tuition_amount) || 0) * (parseFloat(next.commission_rate) || 0) / 100)
      return next
    }))
  }
  const toggleEdit = (key) => setEditingKeys(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n })
  const addTransRows = () => setTransRows(prev => [...prev, ...Array.from({ length: 2 }, mkTrans)])
  const addCommRows = () => setCommRows(prev => [...prev, ...Array.from({ length: 2 }, mkComm)])
  const removeTrans = (key) => setTransRows(prev => prev.filter(r => r._key !== key))
  const removeComm = (key) => setCommRows(prev => prev.filter(r => r._key !== key))
  const delTrans = async (id, key) => { if (!confirm("确定删除？")) return; await sbDel(`transportation_claims?id=eq.${id}`, tk); setTransRows(prev => prev.filter(r => r._key !== key)) }
  const delComm = async (id, key) => { if (!confirm("确定删除？")) return; await sbDel(`commission_entries?id=eq.${id}`, tk); setCommRows(prev => prev.filter(r => r._key !== key)) }

  const saveExtra = async () => {
    sSv(true)
    // 交通费
    const newTr = transRows.filter(r => r._isNew && r.claim_date && parseFloat(r.amount) > 0)
    const dirtyTr = transRows.filter(r => !r._isNew && r._dirty)
    for (const r of newTr) await sbPost("transportation_claims", { employee_id: user.id, claim_date: r.claim_date, route: r.route || null, round_trip: r.round_trip, amount: parseFloat(r.amount), note: r.note || null }, tk)
    for (const r of dirtyTr) await sbPatch(`transportation_claims?id=eq.${r.id}`, { claim_date: r.claim_date, route: r.route || null, round_trip: r.round_trip, amount: parseFloat(r.amount), note: r.note || null }, tk)
    // 签单提成
    if (user.has_commission) {
      const newCm = commRows.filter(r => r._isNew && r.entry_date && r.student_name && parseFloat(r.tuition_amount) > 0)
      const dirtyCm = commRows.filter(r => !r._isNew && r._dirty)
      for (const r of newCm) await sbPost("commission_entries", { employee_id: user.id, entry_date: r.entry_date, seq_number: parseInt(r.seq_number) || 1, student_name: r.student_name, tuition_amount: parseFloat(r.tuition_amount), commission_rate: parseFloat(r.commission_rate) || 0, commission_amount: r.commission_amount || 0 }, tk)
      for (const r of dirtyCm) await sbPatch(`commission_entries?id=eq.${r.id}`, { entry_date: r.entry_date, seq_number: parseInt(r.seq_number) || 1, student_name: r.student_name, tuition_amount: parseFloat(r.tuition_amount), commission_rate: parseFloat(r.commission_rate) || 0, commission_amount: r.commission_amount || 0 }, tk)
    }
    await load(); sSv(false)
  }

  // ====== 统计 ======
  const tw = Object.values(recs).reduce((s, r) => s + Number(r.work_minutes || 0), 0)
  const to = Object.values(recs).reduce((s, r) => s + Math.max(Number(r.work_minutes || 0) - 480, 0), 0)
  const wds = Object.values(recs).filter((r) => r.clock_in).length
  const totalTrans = transRows.filter(r => !r._isNew).reduce((s, r) => s + (parseFloat(r.amount) || 0), 0)
  const totalComm = commRows.filter(r => !r._isNew).reduce((s, r) => s + (r.commission_amount || 0), 0)
  const hasExtraChanges = transRows.some(r => r._dirty || (r._isNew && r.claim_date && parseFloat(r.amount) > 0)) || commRows.some(r => r._dirty || (r._isNew && r.entry_date && r.student_name))

  // ====== 样式 ======
  const iS = { padding: "5px 6px", borderRadius: 5, border: `1px solid ${t.bd}`, background: t.bgI, color: t.tx, fontSize: 12, fontFamily: "monospace", boxSizing: "border-box" }
  const roS = { fontSize: 12, fontFamily: "monospace", color: t.tx, padding: "5px 6px" }

  const tI = (ds, f) => (
    <input type="text" inputMode="numeric" placeholder="00:00" maxLength={5}
      value={dr[ds]?.[f] || ""} onChange={(e) => {
        let v = e.target.value.replace(/[^\d:]/g, "")
        if (v.length === 2 && !v.includes(":")) v += ":"
        sDr((p) => ({ ...p, [ds]: { ...p[ds], [f]: v } }))
      }}
      style={{ padding: "4px 5px", borderRadius: 5, border: `1px solid ${t.bd}`, background: t.bgI, color: t.ac, fontSize: 12, fontFamily: "monospace", width: 60, textAlign: "center", boxSizing: "border-box" }} />
  )

  const actBtns = (r, delFn, removeFn) => r._isNew ? (
    r.claim_date || r.entry_date ? <button onClick={() => removeFn(r._key)} style={{ background: "none", border: "none", color: t.td, cursor: "pointer", padding: 2 }}><Trash2 size={12} /></button> : null
  ) : (
    <div style={{ display: "flex", gap: 3 }}>
      <button onClick={() => toggleEdit(r._key)} style={{ background: "none", border: `1px solid ${editingKeys.has(r._key) ? t.ac : t.bd}`, borderRadius: 4, color: editingKeys.has(r._key) ? t.ac : t.ts, cursor: "pointer", padding: "2px 4px", display: "flex", alignItems: "center" }}><Pencil size={11} /></button>
      <button onClick={() => delFn(r.id, r._key)} style={{ background: "none", border: "none", color: t.rd, cursor: "pointer", padding: 2, display: "flex", alignItems: "center" }}><Trash2 size={11} /></button>
    </div>
  )

  return (
    <div>
      {/* 顶栏 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div><h2 style={{ fontSize: 18, fontWeight: 700, color: t.tx, margin: 0 }}>勤怠一览</h2><p style={{ fontSize: 11, color: t.tm, marginTop: 2 }}>{user.name}</p></div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {hasExtraChanges && <button onClick={saveExtra} disabled={sv} style={{ padding: "6px 14px", borderRadius: 7, border: "none", background: t.ac, color: "#fff", fontSize: 11, fontWeight: 600, cursor: sv ? "wait" : "pointer", display: "flex", alignItems: "center", gap: 4 }}><Save size={13} /> {sv ? "保存中..." : "保存"}</button>}
          <button onClick={() => chg(-1)} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${t.bd}`, background: "transparent", color: t.ts, cursor: "pointer" }}>◀</button>
          <span style={{ fontSize: 14, fontWeight: 600, color: t.tx, minWidth: 100, textAlign: "center" }}>{y}年{m}月</span>
          <button onClick={() => chg(1)} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${t.bd}`, background: "transparent", color: t.ts, cursor: "pointer" }}>▶</button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(100px,1fr))", gap: 8, marginBottom: 16 }}>
        {[
          { l: "出勤", v: `${wds}天`, c: t.ac },
          { l: "劳动时长", v: fmtMinutes(tw), c: t.gn },
          { l: "固定外加班", v: fmtMinutes(to), c: to / 60 > 20 ? t.rd : t.wn },
          { l: "交通费", v: `¥${totalTrans.toLocaleString()}`, c: "#8B5CF6" },
          ...(user.has_commission ? [{ l: "签单提成", v: `¥${totalComm.toLocaleString()}`, c: "#EC4899" }] : []),
        ].map((c, i) => (
          <div key={i} style={{ background: t.bgC, borderRadius: 10, padding: "12px 14px", border: `1px solid ${t.bd}` }}>
            <div style={{ fontSize: 10, color: t.tm }}>{c.l}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: c.c, marginTop: 2 }}>{c.v}</div>
          </div>
        ))}
      </div>

      {/* 勤怠编辑按钮 */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10, gap: 8 }}>
        {!ed ? <button onClick={startEd} style={{ padding: "7px 18px", borderRadius: 7, border: `1px solid ${t.ac}44`, background: `${t.ac}11`, color: t.ac, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>编辑勤怠</button> : <>
          <button onClick={() => sEd(false)} style={{ padding: "7px 14px", borderRadius: 7, border: `1px solid ${t.bd}`, background: "transparent", color: t.ts, fontSize: 12, cursor: "pointer" }}>取消</button>
          <button onClick={saveAtt} disabled={sv} style={{ padding: "7px 18px", borderRadius: 7, border: "none", background: t.gn, color: "#fff", fontSize: 12, fontWeight: 600, cursor: sv ? "wait" : "pointer", opacity: sv ? 0.7 : 1 }}>{sv ? "保存中..." : "保存勤怠"}</button>
        </>}
      </div>

      {/* ====== 勤怠表 ====== */}
      {ld ? <div style={{ textAlign: "center", padding: 40, color: t.tm }}>加载中...</div> :
        <div style={{ background: t.bgC, borderRadius: 10, border: `1px solid ${t.bd}`, overflow: "auto", maxHeight: "55vh", marginBottom: 20 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: ed ? 700 : 600, tableLayout: "fixed" }}>
            <thead style={{ position: "sticky", top: 0, zIndex: 2 }}><tr style={{ background: t.bgH }}>
            {(ed ? ["日期", "星期", "出勤", "休息", "休息结束", "退勤", "备注"] : ["日期", "星期", "出勤", "休息", "休息结束", "退勤", "劳动时长", "固定外加班", "备注"]).map((h, i) => (
              <th key={i} style={{ padding: "8px 6px", color: t.tm, fontWeight: 500, fontSize: 10, textAlign: "center", borderBottom: `1px solid ${t.bd}`, whiteSpace: "nowrap" }}>{h}</th>
            ))}
            </tr></thead>
            <tbody>
              {Array.from({ length: days }, (_, i) => i + 1).map((day) => {
                const ds = `${y}-${pad(m)}-${pad(day)}`; const r = recs[ds]; const w = weekday(y, m, day); const we = w === 0 || w === 6
                const lt = LEAVE_TYPES.find((l) => l.v === (ed ? dr[ds]?.nt : r?.note))
                const wm = Number(r?.work_minutes || 0); const ot = Math.max(wm - 480, 0); const isT = ds === todayStr()
                const mono = { fontFamily: "monospace", fontSize: 12 }
                if (ed) return (
                  <tr key={day} style={{ background: isT ? t.tb : we ? t.we : "transparent", borderBottom: `1px solid ${t.bl}` }}>
                    <td style={{ padding: "5px 6px", color: we ? t.rd : t.tx, fontWeight: 600, textAlign: "center" }}>{day}</td>
                    <td style={{ padding: "5px 4px", color: we ? t.rd : t.ts, fontSize: 11, textAlign: "center" }}>{WEEKDAYS[w]}</td>
                    <td style={{ padding: "3px 4px", textAlign: "center" }}>{tI(ds, "ci")}</td>
                    <td style={{ padding: "3px 4px", textAlign: "center" }}>{tI(ds, "bs")}</td>
                    <td style={{ padding: "3px 4px", textAlign: "center" }}>{tI(ds, "be")}</td>
                    <td style={{ padding: "3px 4px", textAlign: "center" }}>{tI(ds, "co")}</td>
                    <td style={{ padding: "3px 4px", textAlign: "center" }}>
                      <select value={dr[ds]?.nt || ""} onChange={(e) => sDr((p) => ({ ...p, [ds]: { ...p[ds], nt: e.target.value } }))} style={{ padding: 3, borderRadius: 5, border: `1px solid ${t.bd}`, background: t.bgI, color: t.tx, fontSize: 10 }}>
                        <option value="">—</option>{LEAVE_TYPES.map((l) => <option key={l.v} value={l.v}>{l.l}</option>)}
                      </select>
                    </td>
                  </tr>
                )
                return (
                  <tr key={day} style={{ background: isT ? t.tb : we ? t.we : "transparent", borderBottom: `1px solid ${t.bl}` }}>
                    <td style={{ padding: "7px 6px", color: we ? t.rd : t.tx, fontWeight: 600, textAlign: "center" }}>{day}</td>
                    <td style={{ padding: "7px 4px", color: we ? t.rd : t.ts, fontSize: 11, textAlign: "center" }}>{WEEKDAYS[w]}</td>
                    <td style={{ padding: "7px 6px", color: t.ac, textAlign: "center", ...mono }}>{r?.clock_in?.slice(0, 5) || <span style={{ color: t.td }}>--:--</span>}</td>
                    <td style={{ padding: "7px 6px", color: t.ts, textAlign: "center", ...mono }}>{r?.break_start?.slice(0, 5) || <span style={{ color: t.td }}>--:--</span>}</td>
                    <td style={{ padding: "7px 6px", color: t.ts, textAlign: "center", ...mono }}>{r?.break_end?.slice(0, 5) || <span style={{ color: t.td }}>--:--</span>}</td>
                    <td style={{ padding: "7px 6px", color: t.ac, textAlign: "center", ...mono }}>{r?.clock_out?.slice(0, 5) || <span style={{ color: t.td }}>--:--</span>}</td>
                    <td style={{ padding: "7px 6px", textAlign: "center", ...mono, color: t.tx }}>{wm > 0 ? fmtMinutes(wm) : ""}</td>
                    <td style={{ padding: "7px 6px", textAlign: "center", ...mono, color: ot > 0 ? t.wn : t.td }}>{ot > 0 ? fmtMinutes(ot) : ""}</td>
                    <td style={{ padding: "7px 6px", textAlign: "center" }}>{lt && <span style={{ padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600, color: lt.c, background: lt.bg + "33" }}>{lt.l}</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>}

      {/* ====== 交通费 ====== */}
      <div style={{ background: t.bgC, borderRadius: 10, border: `1px solid ${t.bd}`, overflow: "auto", marginBottom: 16 }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${t.bd}` }}><span style={{ fontSize: 13, fontWeight: 600, color: t.tx }}>交通费</span></div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead><tr style={{ background: t.bgH }}>{["日期", "路线", "往返", "金额", "备注", ""].map((h, i) => <th key={i} style={{ padding: "8px 8px", color: t.tm, fontWeight: 500, fontSize: 10, textAlign: "center", borderBottom: `1px solid ${t.bd}` }}>{h}</th>)}</tr></thead>
          <tbody>{transRows.map(r => { const ed2 = r._isNew || editingKeys.has(r._key); return (
            <tr key={r._key} style={{ borderBottom: `1px solid ${t.bl}` }}>
              <td style={{ padding: "6px 8px", textAlign: "center" }}>{ed2 ? <input type="date" value={r.claim_date} onChange={e => updateTrans(r._key, "claim_date", e.target.value)} style={{ ...iS, width: 120 }} /> : <span style={roS}>{r.claim_date}</span>}</td>
              <td style={{ padding: "6px 8px" }}>{ed2 ? <input type="text" value={r.route || ""} onChange={e => updateTrans(r._key, "route", e.target.value)} placeholder="新宿→高田馬場" style={{ ...iS, width: "100%", fontFamily: "inherit" }} /> : <span style={{ fontSize: 11, color: t.tx }}>{r.route}</span>}</td>
              <td style={{ padding: "6px 8px", textAlign: "center", width: 50 }}>{ed2 ? <input type="checkbox" checked={r.round_trip} onChange={e => updateTrans(r._key, "round_trip", e.target.checked)} /> : <span style={{ fontSize: 11, color: t.ts }}>{r.round_trip ? "往返" : "单程"}</span>}</td>
              <td style={{ padding: "6px 8px", textAlign: "center" }}>{ed2 ? <input type="number" value={r.amount} onChange={e => updateTrans(r._key, "amount", e.target.value)} placeholder="0" style={{ ...iS, width: 80, textAlign: "right" }} /> : <span style={{ fontSize: 12, fontWeight: 600, color: "#8B5CF6" }}>¥{Number(r.amount || 0).toLocaleString()}</span>}</td>
              <td style={{ padding: "6px 8px" }}>{ed2 ? <input type="text" value={r.note || ""} onChange={e => updateTrans(r._key, "note", e.target.value)} style={{ ...iS, width: "100%", fontFamily: "inherit", fontSize: 10 }} /> : <span style={{ fontSize: 10, color: t.ts }}>{r.note}</span>}</td>
              <td style={{ padding: "6px 8px", width: 60 }}>{actBtns(r, delTrans, removeTrans)}</td>
            </tr>
          )})}</tbody>
          <tfoot><tr style={{ borderTop: `2px solid ${t.bd}` }}>
            <td style={{ padding: "10px 8px" }}><button onClick={addTransRows} style={{ background: "none", border: `1px dashed ${t.bd}`, borderRadius: 6, padding: "4px 12px", color: t.ac, fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}><Plus size={12} /> 添加</button></td>
            <td colSpan={2}></td>
            <td style={{ padding: "10px 8px", fontSize: 13, fontWeight: 700, color: "#8B5CF6", textAlign: "center" }}>¥{totalTrans.toLocaleString()}</td>
            <td colSpan={2}></td>
          </tr></tfoot>
        </table>
      </div>

      {/* ====== 签单提成 ====== */}
      {user.has_commission && (
        <div style={{ background: t.bgC, borderRadius: 10, border: `1px solid ${t.bd}`, overflow: "auto", marginBottom: 16 }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${t.bd}` }}><span style={{ fontSize: 13, fontWeight: 600, color: t.tx }}>签单提成</span></div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 550 }}>
            <thead><tr style={{ background: t.bgH }}>{["日期", "第N个", "学生名字", "学费", "提成率(%)", "提成金额", ""].map((h, i) => <th key={i} style={{ padding: "8px 8px", color: t.tm, fontWeight: 500, fontSize: 10, textAlign: "center", borderBottom: `1px solid ${t.bd}` }}>{h}</th>)}</tr></thead>
            <tbody>{commRows.map(r => { const ed2 = r._isNew || editingKeys.has(r._key); return (
              <tr key={r._key} style={{ borderBottom: `1px solid ${t.bl}` }}>
                <td style={{ padding: "6px 8px", textAlign: "center" }}>{ed2 ? <input type="date" value={r.entry_date} onChange={e => updateComm(r._key, "entry_date", e.target.value)} style={{ ...iS, width: 120 }} /> : <span style={roS}>{r.entry_date}</span>}</td>
                <td style={{ padding: "6px 8px", textAlign: "center" }}>{ed2 ? <input type="number" value={r.seq_number} onChange={e => updateComm(r._key, "seq_number", e.target.value)} placeholder="1" style={{ ...iS, width: 45, textAlign: "center" }} /> : <span style={{ fontSize: 12 }}>{r.seq_number}</span>}</td>
                <td style={{ padding: "6px 8px", textAlign: "center" }}>{ed2 ? <input type="text" value={r.student_name} onChange={e => updateComm(r._key, "student_name", e.target.value)} placeholder="学生姓名" style={{ ...iS, width: 100, fontFamily: "inherit" }} /> : <span style={{ fontSize: 11 }}>{r.student_name}</span>}</td>
                <td style={{ padding: "6px 8px", textAlign: "center" }}>{ed2 ? <input type="number" value={r.tuition_amount} onChange={e => updateComm(r._key, "tuition_amount", e.target.value)} placeholder="0" style={{ ...iS, width: 90, textAlign: "right" }} /> : <span style={{ fontSize: 12 }}>¥{Number(r.tuition_amount || 0).toLocaleString()}</span>}</td>
                <td style={{ padding: "6px 8px", textAlign: "center" }}>{ed2 ? <input type="number" value={r.commission_rate} onChange={e => updateComm(r._key, "commission_rate", e.target.value)} placeholder="0" style={{ ...iS, width: 55, textAlign: "right" }} /> : <span style={{ fontSize: 12 }}>{r.commission_rate}%</span>}</td>
                <td style={{ padding: "6px 8px", fontSize: 12, fontWeight: 600, color: "#EC4899", textAlign: "center" }}>{r.commission_amount > 0 ? `¥${r.commission_amount.toLocaleString()}` : ""}</td>
                <td style={{ padding: "6px 8px", width: 60 }}>{actBtns(r, delComm, removeComm)}</td>
              </tr>
            )})}</tbody>
            <tfoot><tr style={{ borderTop: `2px solid ${t.bd}` }}>
              <td colSpan={5} style={{ padding: "10px 8px" }}><button onClick={addCommRows} style={{ background: "none", border: `1px dashed ${t.bd}`, borderRadius: 6, padding: "4px 12px", color: t.ac, fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}><Plus size={12} /> 添加</button></td>
              <td style={{ padding: "10px 8px", fontSize: 13, fontWeight: 700, color: "#EC4899", textAlign: "center" }}>¥{totalComm.toLocaleString()}</td>
              <td></td>
            </tr></tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
