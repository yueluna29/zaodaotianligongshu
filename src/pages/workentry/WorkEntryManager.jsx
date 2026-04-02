import { useState, useEffect, useCallback } from "react"
import { sbGet, sbPost, sbPatch, sbDel } from "../../api/supabase"
import { Clock, Plus, Check, ChevronLeft, ChevronRight, Pencil, Trash2, Send, AlertTriangle } from "lucide-react"

export default function WorkEntryManager({ user, t, tk }) {
  const [entries, setEntries] = useState([])
  const [ld, setLd] = useState(true)
  const [show, setShow] = useState(false)
  const [sub, setSub] = useState(false)
  const [rates, setRates] = useState([])
  const [fm, setFm] = useState({ work_date: "", business_type: "", start_time: "", end_time: "", work_minutes: "", note: "" })
  const [editId, setEditId] = useState(null)

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  const isAdmin = user.role === "admin"
  const [allEmps, setAllEmps] = useState([])
  const [filterEmp, setFilterEmp] = useState("")

  // 当前操作目标员工ID
  const targetEmpId = isAdmin && filterEmp ? filterEmp : user.id

  const load = useCallback(async () => {
    setLd(true)
    const sd = `${year}-${String(month).padStart(2, "0")}-01`
    const ed = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`

    let q = `work_entries?work_date=gte.${sd}&work_date=lt.${ed}&order=work_date.desc,created_at.desc&select=*`
    if (isAdmin && filterEmp) {
      q += `&employee_id=eq.${filterEmp}`
    } else if (!isAdmin) {
      q += `&employee_id=eq.${user.id}`
    }

    const [r, emps] = await Promise.all([
      sbGet(q, tk),
      isAdmin ? sbGet("employees?is_active=eq.true&order=name&select=id,name,employment_type", tk) : Promise.resolve(null),
    ])
    setEntries(r || [])
    if (emps) setAllEmps(emps)
    setLd(false)
  }, [user.id, tk, year, month, isAdmin, filterEmp])

  // 加载目标员工的时薪配置
  const loadRates = useCallback(async () => {
    const pr = await sbGet(`pay_rates?employee_id=eq.${targetEmpId}&order=business_type,effective_from.desc&select=*`, tk)
    const seen = new Set(), cur = []
    for (const r of (pr || [])) {
      if (!seen.has(r.business_type)) { seen.add(r.business_type); cur.push(r) }
    }
    setRates(cur)
  }, [targetEmpId, tk])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadRates() }, [loadRates])

  const getRateForType = (bt) => {
    const r = rates.find(r => r.business_type === bt)
    return r ? Number(r.hourly_rate) : 0
  }

  const calcMin = (s, e) => {
    if (!s || !e) return 0
    const [sh, sm] = s.split(":").map(Number)
    const [eh, em] = e.split(":").map(Number)
    return (eh * 60 + em) - (sh * 60 + sm)
  }

  const upFm = (u) => {
    setFm(prev => {
      const n = { ...prev, ...u }
      if (n.start_time && n.end_time) {
        const m = calcMin(n.start_time, n.end_time)
        if (m > 0) n.work_minutes = String(m)
      }
      return n
    })
  }

  const resetForm = () => {
    setFm({ work_date: "", business_type: "", start_time: "", end_time: "", work_minutes: "", note: "" })
    setEditId(null)
    setShow(false)
  }

  const submit = async () => {
    if (!fm.work_date || !fm.business_type || !fm.work_minutes) return
    setSub(true)
    const mins = parseInt(fm.work_minutes)
    const rate = getRateForType(fm.business_type)
    const total = Math.round(mins / 60 * rate)

    if (editId) {
      await sbPatch(`work_entries?id=eq.${editId}`, {
        work_date: fm.work_date,
        business_type: fm.business_type,
        start_time: fm.start_time || null,
        end_time: fm.end_time || null,
        work_minutes: mins,
        hourly_rate: rate,
        subtotal: total,
        note: fm.note || null,
      }, tk)
    } else {
      await sbPost("work_entries", {
        employee_id: targetEmpId,
        work_date: fm.work_date,
        business_type: fm.business_type,
        start_time: fm.start_time || null,
        end_time: fm.end_time || null,
        work_minutes: mins,
        hourly_rate: rate,
        subtotal: total,
        note: fm.note || null,
        status: "下書き",
      }, tk)
    }
    await load()
    resetForm()
    setSub(false)
  }

  const startEdit = (e) => {
    setFm({
      work_date: e.work_date,
      business_type: e.business_type,
      start_time: e.start_time?.slice(0, 5) || "",
      end_time: e.end_time?.slice(0, 5) || "",
      work_minutes: String(e.work_minutes || ""),
      note: e.note || "",
    })
    setEditId(e.id)
    setShow(true)
  }

  const delEntry = async (id) => {
    if (!confirm("确定要删除这条工时记录吗？")) return
    await sbDel(`work_entries?id=eq.${id}`, tk)
    await load()
  }

  const submitEntry = async (id) => {
    await sbPatch(`work_entries?id=eq.${id}`, { status: "提出済み" }, tk)
    await load()
  }

  const approveEntry = async (id) => {
    await sbPatch(`work_entries?id=eq.${id}`, {
      status: "承認",
      approved_by: user.id,
      approved_at: new Date().toISOString()
    }, tk)
    await load()
  }

  const submitAll = async () => {
    const dr = entries.filter(e => e.status === "下書き")
    if (!dr.length) return
    if (!confirm(`确定要提交全部 ${dr.length} 条草稿？`)) return
    for (const d of dr) {
      await sbPatch(`work_entries?id=eq.${d.id}`, { status: "提出済み" }, tk)
    }
    await load()
  }

  const approveAll = async () => {
    const pd = entries.filter(e => e.status === "提出済み")
    if (!pd.length) return
    if (!confirm(`确定要批准全部 ${pd.length} 条记录？`)) return
    for (const d of pd) {
      await sbPatch(`work_entries?id=eq.${d.id}`, {
        status: "承認",
        approved_by: user.id,
        approved_at: new Date().toISOString()
      }, tk)
    }
    await load()
  }

  const chgMonth = (d) => {
    let nm = month + d, ny = year
    if (nm > 12) { nm = 1; ny++ } else if (nm < 1) { nm = 12; ny-- }
    setYear(ny); setMonth(nm)
  }

  const statusBadge = (s) => {
    const map = { "下書き": { c: "#9CA3AF", l: "草稿" }, "提出済み": { c: "#F59E0B", l: "已提交" }, "承認": { c: "#10B981", l: "已批准" } }
    const { c, l } = map[s] || { c: "#9CA3AF", l: s }
    return { style: { padding: "3px 8px", borderRadius: 5, fontSize: 10, fontWeight: 600, color: c, background: `${c}18` }, label: l }
  }

  const iS = { width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${t.bd}`, background: t.bgI, color: t.tx, fontSize: 13, boxSizing: "border-box" }

  const totalMins = entries.reduce((s, e) => s + (e.work_minutes || 0), 0)
  const totalPay = entries.reduce((s, e) => s + (Number(e.subtotal) || 0), 0)
  const drafts = entries.filter(e => e.status === "下書き").length
  const pendingCount = entries.filter(e => e.status === "提出済み").length

  const previewRate = fm.business_type ? getRateForType(fm.business_type) : 0
  const previewMins = parseInt(fm.work_minutes) || 0
  const previewTotal = Math.round(previewMins / 60 * previewRate)

  // 按日期分组显示
  const grouped = {}
  entries.forEach(e => {
    if (!grouped[e.work_date]) grouped[e.work_date] = []
    grouped[e.work_date].push(e)
  })
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Clock size={20} color={t.ac} />
          <h2 style={{ fontSize: 18, fontWeight: 700, color: t.tx, margin: 0 }}>工时录入</h2>
        </div>
        <button onClick={() => { if (show) resetForm(); else setShow(true) }} style={{ padding: "8px 18px", borderRadius: 8, border: show ? `1px solid ${t.bd}` : "none", background: show ? "transparent" : t.ac, color: show ? t.ts : "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
          {show ? "✕ 关闭" : <><Plus size={14} /> 添加工时</>}
        </button>
      </div>

      {/* 月份 + 筛选 */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <button onClick={() => chgMonth(-1)} style={{ background: "none", border: `1px solid ${t.bd}`, borderRadius: 6, padding: "6px 10px", cursor: "pointer", color: t.ts, display: "flex", alignItems: "center" }}>
          <ChevronLeft size={14} />
        </button>
        <span style={{ fontSize: 15, fontWeight: 600, color: t.tx }}>{year}年{month}月</span>
        <button onClick={() => chgMonth(1)} style={{ background: "none", border: `1px solid ${t.bd}`, borderRadius: 6, padding: "6px 10px", cursor: "pointer", color: t.ts, display: "flex", alignItems: "center" }}>
          <ChevronRight size={14} />
        </button>
        {isAdmin && (
          <select value={filterEmp} onChange={e => setFilterEmp(e.target.value)} style={{ ...iS, width: "auto", minWidth: 160 }}>
            <option value="">全部员工</option>
            {allEmps.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        )}
      </div>

      {/* 统计卡片 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 8, marginBottom: 20 }}>
        <div style={{ background: t.bgC, borderRadius: 10, padding: "14px 16px", border: `1px solid ${t.bd}` }}>
          <div style={{ fontSize: 10, color: t.tm }}>本月工时</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: t.ac, marginTop: 4 }}>{(totalMins / 60).toFixed(1)}h</div>
        </div>
        <div style={{ background: t.bgC, borderRadius: 10, padding: "14px 16px", border: `1px solid ${t.bd}` }}>
          <div style={{ fontSize: 10, color: t.tm }}>预估工资</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: t.gn, marginTop: 4 }}>¥{totalPay.toLocaleString()}</div>
        </div>
        <div style={{ background: t.bgC, borderRadius: 10, padding: "14px 16px", border: `1px solid ${t.bd}` }}>
          <div style={{ fontSize: 10, color: t.tm }}>草稿</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#9CA3AF", marginTop: 4 }}>{drafts}件</div>
        </div>
        <div style={{ background: t.bgC, borderRadius: 10, padding: "14px 16px", border: `1px solid ${t.bd}` }}>
          <div style={{ fontSize: 10, color: t.tm }}>待审批</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: t.wn, marginTop: 4 }}>{pendingCount}件</div>
        </div>
      </div>

      {/* 录入表单 */}
      {show && (
        <div style={{ background: t.bgC, borderRadius: 12, padding: 22, border: `2px solid ${t.ac}33`, marginBottom: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: t.tx, margin: "0 0 14px" }}>
            {editId ? "编辑工时" : "添加工时"}
          </h3>

          {!rates.length && (
            <div style={{ padding: 12, borderRadius: 8, background: `${t.wn}15`, border: `1px solid ${t.wn}33`, marginBottom: 12, fontSize: 11, color: t.wn, display: "flex", alignItems: "center", gap: 6 }}>
              <AlertTriangle size={14} /> 该员工尚未配置时薪，请先在「时薪配置」页面设定工种和时薪
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>日期</label>
              <input type="date" value={fm.work_date} onChange={e => upFm({ work_date: e.target.value })} style={iS} />
            </div>
            <div>
              <label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>工种</label>
              <select value={fm.business_type} onChange={e => upFm({ business_type: e.target.value })} style={iS}>
                <option value="">请选择</option>
                {rates.map(r => (
                  <option key={r.business_type} value={r.business_type}>
                    {r.business_type} (¥{Number(r.hourly_rate).toLocaleString()}/h)
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>开始时间</label>
              <input type="time" value={fm.start_time} onChange={e => upFm({ start_time: e.target.value })} style={iS} />
            </div>
            <div>
              <label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>结束时间</label>
              <input type="time" value={fm.end_time} onChange={e => upFm({ end_time: e.target.value })} style={iS} />
            </div>
            <div>
              <label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>分钟数（可手动改）</label>
              <input type="number" value={fm.work_minutes} onChange={e => upFm({ work_minutes: e.target.value })} placeholder="60" style={iS} />
            </div>
          </div>

          {previewRate > 0 && previewMins > 0 && (
            <div style={{ padding: "8px 12px", borderRadius: 8, background: `${t.gn}10`, marginBottom: 10, fontSize: 12, color: t.gn, fontWeight: 600 }}>
              预计: {previewMins}分 × ¥{previewRate.toLocaleString()}/h = ¥{previewTotal.toLocaleString()}
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>备注</label>
            <input value={fm.note} onChange={e => upFm({ note: e.target.value })} placeholder="可选" style={iS} />
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={submit} disabled={sub || !fm.work_date || !fm.business_type || !fm.work_minutes} style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: t.ac, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: (sub || !fm.work_date || !fm.business_type || !fm.work_minutes) ? 0.5 : 1 }}>
              {sub ? "保存中..." : editId ? "保存修改" : "保存草稿"}
            </button>
            {editId && <button onClick={resetForm} style={{ padding: "10px 24px", borderRadius: 8, border: `1px solid ${t.bd}`, background: "transparent", color: t.ts, fontSize: 13, cursor: "pointer" }}>取消</button>}
          </div>
        </div>
      )}

      {/* 批量操作 */}
      {(drafts > 0 || (isAdmin && pendingCount > 0)) && (
        <div style={{ marginBottom: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {drafts > 0 && (
            <button onClick={submitAll} style={{ padding: "6px 16px", borderRadius: 8, border: `1px solid ${t.ac}`, background: "transparent", color: t.ac, fontSize: 11, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
              <Send size={12} /> 提交全部草稿（{drafts}件）
            </button>
          )}
          {isAdmin && pendingCount > 0 && (
            <button onClick={approveAll} style={{ padding: "6px 16px", borderRadius: 8, border: `1px solid ${t.gn}`, background: `${t.gn}10`, color: t.gn, fontSize: 11, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
              <Check size={12} /> 批准全部已提交（{pendingCount}件）
            </button>
          )}
        </div>
      )}

      {/* 工时列表 — 按日期分组 */}
      {ld ? <div style={{ textAlign: "center", padding: 40, color: t.tm }}>加载中...</div> : (
        <div style={{ background: t.bgC, borderRadius: 10, border: `1px solid ${t.bd}`, overflow: "hidden" }}>
          {!entries.length ? (
            <div style={{ padding: 24, textAlign: "center", color: t.tm, fontSize: 12 }}>本月暂无工时记录</div>
          ) : sortedDates.map(date => {
            const dayEntries = grouped[date]
            const dayTotal = dayEntries.reduce((s, e) => s + (Number(e.subtotal) || 0), 0)
            const dayMins = dayEntries.reduce((s, e) => s + (e.work_minutes || 0), 0)
            const wd = new Date(date + "T00:00:00").getDay()
            const wdStr = ["日", "月", "火", "水", "木", "金", "土"][wd]
            const isWe = wd === 0 || wd === 6
            return (
              <div key={date}>
                <div style={{ padding: "8px 16px", background: `${t.ac}06`, borderBottom: `1px solid ${t.bl}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: isWe ? t.rd : t.tx, fontFamily: "monospace" }}>{date}（{wdStr}）</span>
                  <span style={{ fontSize: 10, color: t.tm }}>{dayMins}分 / ¥{dayTotal.toLocaleString()}</span>
                </div>
                {dayEntries.map(e => {
                  const sb = statusBadge(e.status)
                  const canEdit = e.status === "下書き"
                  const canApprove = isAdmin && e.status === "提出済み"
                  return (
                    <div key={e.id} style={{ padding: "8px 16px 8px 32px", borderBottom: `1px solid ${t.bl}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ padding: "2px 8px", borderRadius: 5, fontSize: 10, fontWeight: 600, color: "#8B5CF6", background: "#8B5CF620" }}>{e.business_type}</span>
                        {e.start_time && e.end_time && (
                          <span style={{ fontSize: 10, color: t.tm, fontFamily: "monospace" }}>{e.start_time?.slice(0, 5)}~{e.end_time?.slice(0, 5)}</span>
                        )}
                        <span style={{ fontSize: 11, color: t.tx }}>{e.work_minutes}分</span>
                        <span style={{ fontSize: 10, color: t.td }}>×¥{Number(e.hourly_rate || 0).toLocaleString()}</span>
                        <span style={{ fontSize: 11, color: t.gn, fontWeight: 600 }}>= ¥{Number(e.subtotal || 0).toLocaleString()}</span>
                        {e.note && <span style={{ fontSize: 10, color: t.td }}>| {e.note}</span>}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        {canEdit && (
                          <>
                            <button onClick={() => startEdit(e)} style={{ padding: "3px 8px", borderRadius: 5, border: `1px solid ${t.bd}`, background: "transparent", color: t.ac, fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center" }}><Pencil size={10} /></button>
                            <button onClick={() => delEntry(e.id)} style={{ padding: "3px 8px", borderRadius: 5, border: `1px solid ${t.rd}33`, background: "transparent", color: t.rd, fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center" }}><Trash2 size={10} /></button>
                            <button onClick={() => submitEntry(e.id)} style={{ padding: "3px 8px", borderRadius: 5, border: `1px solid ${t.ac}`, background: `${t.ac}10`, color: t.ac, fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center" }}><Send size={10} /></button>
                          </>
                        )}
                        {canApprove && (
                          <button onClick={() => approveEntry(e.id)} style={{ padding: "3px 10px", borderRadius: 5, border: "none", background: `${t.gn}20`, color: t.gn, fontSize: 10, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 3 }}>
                            <Check size={10} /> 批准
                          </button>
                        )}
                        <span style={sb.style}>{sb.label}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
