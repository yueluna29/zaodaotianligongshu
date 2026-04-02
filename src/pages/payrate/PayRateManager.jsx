import { useState, useEffect, useCallback } from "react"
import { sbGet, sbPost, sbDel } from "../../api/supabase"
import { DollarSign, Plus, History, ChevronDown, ChevronUp, Pencil, Trash2, Users, Copy } from "lucide-react"

const COMMON_TYPES = [
  "事務",
  "講師（大課）",
  "講師（一対一）",
  "答疑做題",
  "研究計画書修改",
]

export default function PayRateManager({ user, t, tk }) {
  const [emps, setEmps] = useState([])
  const [selEmp, setSelEmp] = useState("")
  const [rates, setRates] = useState([])
  const [ld, setLd] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [fm, setFm] = useState({ business_type: "", custom_type: "", hourly_rate: "", effective_from: new Date().toISOString().split("T")[0], note: "" })
  const [sub, setSub] = useState(false)
  const [expandedType, setExpandedType] = useState(null)
  const [history, setHistory] = useState({})
  const [raiseMode, setRaiseMode] = useState(null)
  const [raiseFm, setRaiseFm] = useState({ hourly_rate: "", effective_from: new Date().toISOString().split("T")[0], note: "涨薪" })
  const [copyFrom, setCopyFrom] = useState("")
  const [showCopy, setShowCopy] = useState(false)

  useEffect(() => {
    (async () => {
      const e = await sbGet("employees?is_active=eq.true&order=name&select=id,name,employment_type,is_teacher,company_id", tk)
      setEmps(e || [])
      setLd(false)
    })()
  }, [tk])

  const loadRates = useCallback(async () => {
    if (!selEmp) { setRates([]); setHistory({}); return }
    const all = await sbGet(`pay_rates?employee_id=eq.${selEmp}&order=business_type,effective_from.desc&select=*`, tk)
    if (!all?.length) { setRates([]); setHistory({}); return }
    const current = [], seen = new Set(), hist = {}
    for (const r of all) {
      if (!seen.has(r.business_type)) { seen.add(r.business_type); current.push(r) }
      if (!hist[r.business_type]) hist[r.business_type] = []
      hist[r.business_type].push(r)
    }    setRates(current)
    setHistory(hist)
  }, [selEmp, tk])

  useEffect(() => { loadRates() }, [loadRates])

  const submitAdd = async () => {
    const bt = fm.business_type === "__custom" ? fm.custom_type.trim() : fm.business_type
    if (!bt || !fm.hourly_rate || !fm.effective_from) return
    setSub(true)
    await sbPost("pay_rates", {
      employee_id: selEmp,
      business_type: bt,
      hourly_rate: parseFloat(fm.hourly_rate),
      effective_from: fm.effective_from,
      note: fm.note || null,
    }, tk)
    await loadRates()
    setFm({ business_type: "", custom_type: "", hourly_rate: "", effective_from: new Date().toISOString().split("T")[0], note: "" })
    setShowAdd(false)
    setSub(false)
  }

  const submitRaise = async (bt) => {
    if (!raiseFm.hourly_rate || !raiseFm.effective_from) return
    setSub(true)
    await sbPost("pay_rates", {
      employee_id: selEmp,
      business_type: bt,
      hourly_rate: parseFloat(raiseFm.hourly_rate),
      effective_from: raiseFm.effective_from,
      note: raiseFm.note || null,
    }, tk)
    await loadRates()
    setRaiseMode(null)
    setRaiseFm({ hourly_rate: "", effective_from: new Date().toISOString().split("T")[0], note: "涨薪" })
    setSub(false)
  }

  const delRate = async (id) => {
    if (!confirm("确定删除这条时薪记录？")) return
    await sbDel(`pay_rates?id=eq.${id}`, tk)
    await loadRates()
  }

  const doCopy = async () => {
    if (!copyFrom || !selEmp || copyFrom === selEmp) return
    setSub(true)
    const src = await sbGet(`pay_rates?employee_id=eq.${copyFrom}&order=business_type,effective_from.desc&select=*`, tk)
    if (!src?.length) { setSub(false); alert("来源员工没有时薪配置"); return }
    const seen = new Set()
    for (const r of src) {
      if (seen.has(r.business_type)) continue
      seen.add(r.business_type)
      await sbPost("pay_rates", {
        employee_id: selEmp,
        business_type: r.business_type,
        hourly_rate: r.hourly_rate,
        effective_from: new Date().toISOString().split("T")[0],
        note: `复制自 ${emps.find(e => e.id === copyFrom)?.name || ""}`,
      }, tk)
    }
    await loadRates()
    setShowCopy(false)
    setCopyFrom("")
    setSub(false)
  }

  if (user.role !== "admin") {
    return <div style={{ padding: 40, textAlign: "center", color: t.tm }}>仅管理员可访问</div>
  }

  const iS = { width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${t.bd}`, background: t.bgI, color: t.tx, fontSize: 13, boxSizing: "border-box" }
  const empObj = emps.find(e => e.id === selEmp)
  const nonRegular = emps.filter(e => e.employment_type !== "正社員")
  const regular = emps.filter(e => e.employment_type === "正社員")

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <DollarSign size={20} color={t.ac} />
          <h2 style={{ fontSize: 18, fontWeight: 700, color: t.tx, margin: 0 }}>时薪配置</h2>
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <label style={{ fontSize: 11, color: t.ts, display: "flex", alignItems: "center", gap: 4, marginBottom: 6 }}>
          <Users size={12} />选择员工
        </label>
        <select value={selEmp} onChange={e => { setSelEmp(e.target.value); setShowAdd(false); setRaiseMode(null); setExpandedType(null); setShowCopy(false) }} style={iS}>
          <option value="">请选择员工</option>
          {nonRegular.map(e => (
            <option key={e.id} value={e.id}>{e.name} ({e.employment_type}{e.is_teacher ? " / 講師" : ""})</option>
          ))}
          {regular.length > 0 && (
            <optgroup label="正社員（通常不需配置）">
              {regular.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </optgroup>
          )}
        </select>
      </div>

      {selEmp && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: t.tx, margin: 0 }}>{empObj?.name} 的时薪设定</h3>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => { setShowCopy(!showCopy); setShowAdd(false); setRaiseMode(null) }} style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${t.bd}`, background: "transparent", color: t.ts, fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                <Copy size={12} /> 从他人复制
              </button>
              <button onClick={() => { setShowAdd(!showAdd); setRaiseMode(null); setShowCopy(false) }} style={{ padding: "6px 14px", borderRadius: 8, border: showAdd ? `1px solid ${t.bd}` : "none", background: showAdd ? "transparent" : t.ac, color: showAdd ? t.ts : "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                {showAdd ? "✕ 取消" : <><Plus size={13} /> 添加工种</>}
              </button>
            </div>
          </div>

          {showCopy && (
            <div style={{ background: t.bgC, borderRadius: 10, padding: 16, border: `1px solid ${t.bd}`, marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: t.ts, marginBottom: 8 }}>将另一位员工的当前时薪配置复制到 {empObj?.name}</div>
              <div style={{ display: "flex", gap: 8 }}>
                <select value={copyFrom} onChange={e => setCopyFrom(e.target.value)} style={{ ...iS, flex: 1 }}>
                  <option value="">选择来源员工</option>
                  {emps.filter(e => e.id !== selEmp).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
                <button onClick={doCopy} disabled={!copyFrom || sub} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: t.ac, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: (!copyFrom || sub) ? 0.5 : 1, whiteSpace: "nowrap" }}>
                  {sub ? "复制中..." : "确认复制"}
                </button>
              </div>
            </div>
          )}

          {showAdd && (
            <div style={{ background: t.bgC, borderRadius: 12, padding: 18, border: `2px solid ${t.ac}33`, marginBottom: 16 }}>
              <h4 style={{ fontSize: 13, fontWeight: 600, color: t.tx, margin: "0 0 12px" }}>添加新工种时薪</h4>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                <div>
                  <label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>工种类型</label>
                  <select value={fm.business_type} onChange={e => setFm(p => ({ ...p, business_type: e.target.value }))} style={iS}>
                    <option value="">请选择</option>
                    {COMMON_TYPES.map(bt => <option key={bt} value={bt}>{bt}</option>)}
                    <option value="__custom">自定义...</option>
                  </select>
                </div>
                {fm.business_type === "__custom" && (
                  <div>
                    <label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>自定义工种名</label>
                    <input value={fm.custom_type} onChange={e => setFm(p => ({ ...p, custom_type: e.target.value }))} placeholder="例：VIP辅导" style={iS} />
                  </div>
                )}
                <div>
                  <label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>时薪（日元）</label>
                  <input type="number" value={fm.hourly_rate} onChange={e => setFm(p => ({ ...p, hourly_rate: e.target.value }))} placeholder="1200" style={iS} />
                </div>
                <div>
                  <label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>生效日期</label>
                  <input type="date" value={fm.effective_from} onChange={e => setFm(p => ({ ...p, effective_from: e.target.value }))} style={iS} />
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>备注</label>
                <input value={fm.note} onChange={e => setFm(p => ({ ...p, note: e.target.value }))} placeholder="初始设定" style={iS} />
              </div>
              <button onClick={submitAdd} disabled={sub || (!fm.business_type || (fm.business_type === "__custom" && !fm.custom_type.trim())) || !fm.hourly_rate} style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: t.ac, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: sub ? 0.5 : 1 }}>
                {sub ? "保存中..." : "保存"}
              </button>
            </div>
          )}

          {!rates.length ? (
            <div style={{ background: t.bgC, borderRadius: 10, padding: 24, textAlign: "center", color: t.tm, fontSize: 12, border: `1px solid ${t.bd}` }}>
              暂未配置任何工种时薪，点击上方「添加工种」开始设定
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {rates.map(r => (
                <div key={r.business_type} style={{ background: t.bgC, borderRadius: 10, border: `1px solid ${t.bd}`, overflow: "hidden" }}>
                  <div style={{ padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, color: "#8B5CF6", background: "#8B5CF620" }}>{r.business_type}</span>
                      <span style={{ fontSize: 22, fontWeight: 700, color: t.ac }}>¥{Number(r.hourly_rate).toLocaleString()}</span>
                      <span style={{ fontSize: 10, color: t.tm }}>/時</span>
                      <span style={{ fontSize: 10, color: t.td }}>生效: {r.effective_from}</span>
                      {r.note && <span style={{ fontSize: 10, color: t.td }}>({r.note})</span>}
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => { setRaiseMode(raiseMode === r.business_type ? null : r.business_type); setRaiseFm({ hourly_rate: "", effective_from: new Date().toISOString().split("T")[0], note: "涨薪" }); setShowAdd(false) }} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${t.ac}44`, background: "transparent", color: t.ac, fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", gap: 3 }}>
                        <Pencil size={10} /> 涨薪
                      </button>
                      <button onClick={() => setExpandedType(expandedType === r.business_type ? null : r.business_type)} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${t.bd}`, background: "transparent", color: t.ts, fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", gap: 3 }}>
                        <History size={10} /> 历史 {history[r.business_type]?.length > 1 ? `(${history[r.business_type].length})` : ""}
                        {expandedType === r.business_type ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                      </button>
                    </div>
                  </div>

                  {raiseMode === r.business_type && (
                    <div style={{ padding: "0 16px 14px", borderTop: `1px solid ${t.bl}` }}>
                      <div style={{ padding: "12px 0 0", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                        <div>
                          <label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>新时薪（日元）</label>
                          <input type="number" value={raiseFm.hourly_rate} onChange={e => setRaiseFm(p => ({ ...p, hourly_rate: e.target.value }))} placeholder={`现 ¥${Number(r.hourly_rate).toLocaleString()}`} style={iS} />
                        </div>
                        <div>
                          <label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>新生效日期</label>
                          <input type="date" value={raiseFm.effective_from} onChange={e => setRaiseFm(p => ({ ...p, effective_from: e.target.value }))} style={iS} />
                        </div>
                        <div>
                          <label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>备注</label>
                          <input value={raiseFm.note} onChange={e => setRaiseFm(p => ({ ...p, note: e.target.value }))} style={iS} />
                        </div>
                      </div>
                      <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                        <button onClick={() => submitRaise(r.business_type)} disabled={sub || !raiseFm.hourly_rate} style={{ padding: "6px 16px", borderRadius: 6, border: "none", background: t.ac, color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", opacity: (!raiseFm.hourly_rate || sub) ? 0.5 : 1 }}>
                          {sub ? "保存中..." : "确认涨薪"}
                        </button>
                        <button onClick={() => setRaiseMode(null)} style={{ padding: "6px 16px", borderRadius: 6, border: `1px solid ${t.bd}`, background: "transparent", color: t.ts, fontSize: 11, cursor: "pointer" }}>取消</button>
                      </div>
                    </div>
                  )}

                  {expandedType === r.business_type && history[r.business_type] && (
                    <div style={{ borderTop: `1px solid ${t.bl}` }}>
                      {history[r.business_type].map((h, i) => (
                        <div key={h.id} style={{ padding: "8px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", background: i === 0 ? `${t.ac}08` : "transparent", borderBottom: `1px solid ${t.bl}` }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            {i === 0 && <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 4, background: `${t.ac}20`, color: t.ac, fontWeight: 700 }}>当前</span>}
                            <span style={{ fontSize: 13, fontWeight: i === 0 ? 700 : 400, color: i === 0 ? t.tx : t.ts }}>¥{Number(h.hourly_rate).toLocaleString()}/時</span>
                            <span style={{ fontSize: 10, color: t.tm }}>生效: {h.effective_from}</span>
                            {h.note && <span style={{ fontSize: 10, color: t.td }}>({h.note})</span>}
                          </div>
                          {i !== 0 && (
                            <button onClick={() => delRate(h.id)} style={{ padding: "2px 8px", borderRadius: 4, border: `1px solid ${t.rd}33`, background: "transparent", color: t.rd, fontSize: 9, cursor: "pointer", display: "flex", alignItems: "center" }}>
                              <Trash2 size={9} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
