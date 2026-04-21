import { useState, useEffect, useCallback } from "react"
import { sbGet, sbPost, sbPatch, sbDel } from "../api/supabase"
import { Plus, TrendingUp, History, ChevronDown, ChevronUp, Edit3, Trash2, Check, X } from "lucide-react"
import { fmtDateW } from "../config/constants"

const COMMON_TYPES = ["事務", "講師（大課）", "講師（一対一）", "答疑做題", "研究計画書修改"]

export default function PayRateSection({ empId, isAdmin, t, tk }) {
  const [rates, setRates] = useState([])
  const [history, setHistory] = useState({})
  const [showAdd, setShowAdd] = useState(false)
  const [fm, setFm] = useState({ business_type: "", custom_type: "", hourly_rate: "", effective_from: new Date().toISOString().split("T")[0], note: "" })
  const [sub, setSub] = useState(false)
  const [expandedType, setExpandedType] = useState(null)
  const [raiseTarget, setRaiseTarget] = useState(null)
  const [raiseFm, setRaiseFm] = useState({ hourly_rate: "", effective_from: new Date().toISOString().split("T")[0], note: "涨薪" })
  const [editId, setEditId] = useState(null)
  const [editFm, setEditFm] = useState({ hourly_rate: "", effective_from: "", note: "" })

  const loadRates = useCallback(async () => {
    if (!empId) return
    const all = await sbGet(`pay_rates?employee_id=eq.${empId}&order=business_type,effective_from.desc&select=*`, tk)
    if (!all?.length) { setRates([]); setHistory({}); return }
    const current = [], seen = new Set(), hist = {}
    for (const r of all) {
      if (!seen.has(r.business_type)) { seen.add(r.business_type); current.push(r) }
      if (!hist[r.business_type]) hist[r.business_type] = []
      hist[r.business_type].push(r)
    }
    setRates(current)
    setHistory(hist)
  }, [empId, tk])

  useEffect(() => { loadRates() }, [loadRates])

  const submitAdd = async () => {
    const bt = fm.business_type === "__custom" ? fm.custom_type.trim() : fm.business_type
    if (!bt || !fm.hourly_rate || !fm.effective_from) return
    setSub(true)
    await sbPost("pay_rates", {
      employee_id: empId, business_type: bt,
      hourly_rate: parseFloat(fm.hourly_rate), effective_from: fm.effective_from, note: fm.note || null,
    }, tk)
    await loadRates()
    setFm({ business_type: "", custom_type: "", hourly_rate: "", effective_from: new Date().toISOString().split("T")[0], note: "" })
    setShowAdd(false); setSub(false)
  }

  const submitRaise = async () => {
    if (!raiseTarget || !raiseFm.hourly_rate || !raiseFm.effective_from) return
    setSub(true)
    await sbPost("pay_rates", {
      employee_id: empId, business_type: raiseTarget.business_type,
      hourly_rate: parseFloat(raiseFm.hourly_rate), effective_from: raiseFm.effective_from, note: raiseFm.note || null,
    }, tk)
    await loadRates()
    setRaiseTarget(null)
    setRaiseFm({ hourly_rate: "", effective_from: new Date().toISOString().split("T")[0], note: "涨薪" })
    setSub(false)
  }

  const startEdit = (r) => {
    setEditId(r.id)
    setEditFm({ hourly_rate: String(r.hourly_rate), effective_from: r.effective_from, note: r.note || "" })
    setShowAdd(false); setRaiseTarget(null)
  }

  const submitEdit = async () => {
    if (!editFm.hourly_rate || !editFm.effective_from) return
    setSub(true)
    await sbPatch(`pay_rates?id=eq.${editId}`, {
      hourly_rate: parseFloat(editFm.hourly_rate), effective_from: editFm.effective_from, note: editFm.note || null,
    }, tk)
    await loadRates()
    setEditId(null); setSub(false)
  }

  const delRate = async (id) => {
    if (!confirm("确定删除这条时薪记录？")) return
    await sbDel(`pay_rates?id=eq.${id}`, tk)
    await loadRates()
  }

  const iS = {
    width: "100%", padding: "11px 14px", borderRadius: 12,
    border: `1px solid ${t.bd}`, background: "rgba(255,255,255,0.85)", color: t.tx,
    fontSize: 14, boxSizing: "border-box", fontFamily: "inherit", outline: "none",
  }
  const lblS = { fontSize: 13, color: t.ts, fontWeight: 500, display: "block", marginBottom: 8 }
  const cardS = {
    background: "rgba(255,255,255,0.72)",
    border: `1px solid ${t.bd}`,
    borderRadius: 16, overflow: "hidden",
    boxShadow: "0 4px 12px rgba(0,0,0,0.02)",
  }

  return (
    <div>
      {/* 添加工种按钮 / 表单 */}
      {isAdmin && (
        <div style={{ marginBottom: showAdd ? 16 : 20 }}>
          {!showAdd ? (
            <button onClick={() => { setShowAdd(true); setRaiseTarget(null); setEditId(null) }} style={{
              padding: "9px 16px", borderRadius: 12, border: "none", background: t.ac, color: "#fff",
              fontSize: 13, fontWeight: 600, cursor: "pointer",
              display: "inline-flex", alignItems: "center", gap: 6,
              boxShadow: `0 4px 12px ${t.ac}30`, fontFamily: "inherit",
            }}><Plus size={15} /> 添加工种</button>
          ) : (
            <div style={{ ...cardS, padding: 20, border: `1px solid ${t.ac}40`, background: "rgba(255,255,255,0.9)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: t.tx, display: "flex", alignItems: "center", gap: 6 }}>
                  <Plus size={16} color={t.ac} /> 新增工种时薪
                </h4>
                <button onClick={() => setShowAdd(false)} style={{ background: "transparent", border: "none", cursor: "pointer", color: t.td, padding: 4, fontFamily: "inherit" }}>
                  <X size={16} />
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: fm.business_type === "__custom" ? "1fr 1fr 1fr 1fr" : "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={lblS}>工种 <span style={{ color: t.rd }}>*</span></label>
                  <select value={fm.business_type} onChange={e => setFm(p => ({ ...p, business_type: e.target.value }))} style={iS}>
                    <option value="">请选择</option>
                    {COMMON_TYPES.map(bt => <option key={bt} value={bt}>{bt}</option>)}
                    <option value="__custom">自定义...</option>
                  </select>
                </div>
                {fm.business_type === "__custom" && (
                  <div>
                    <label style={lblS}>自定义名</label>
                    <input value={fm.custom_type} onChange={e => setFm(p => ({ ...p, custom_type: e.target.value }))} placeholder="VIP辅导" style={iS} />
                  </div>
                )}
                <div>
                  <label style={lblS}>时薪 (¥) <span style={{ color: t.rd }}>*</span></label>
                  <input type="number" value={fm.hourly_rate} onChange={e => setFm(p => ({ ...p, hourly_rate: e.target.value }))} placeholder="1200" style={iS} />
                </div>
                <div>
                  <label style={lblS}>生效日期 <span style={{ color: t.rd }}>*</span></label>
                  <input type="date" value={fm.effective_from} onChange={e => setFm(p => ({ ...p, effective_from: e.target.value }))} style={iS} />
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={lblS}>备注</label>
                <input value={fm.note} onChange={e => setFm(p => ({ ...p, note: e.target.value }))} placeholder="初始设定" style={iS} />
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button onClick={() => setShowAdd(false)} style={{ padding: "9px 18px", borderRadius: 12, border: `1px solid ${t.bd}`, background: "rgba(255,255,255,0.8)", color: t.tx, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>取消</button>
                <button onClick={submitAdd} disabled={sub || (!fm.business_type || (fm.business_type === "__custom" && !fm.custom_type.trim())) || !fm.hourly_rate} style={{
                  padding: "9px 20px", borderRadius: 12, border: "none", background: t.ac, color: "#fff",
                  fontSize: 13, fontWeight: 600, cursor: sub ? "wait" : "pointer", opacity: sub ? 0.6 : 1,
                  boxShadow: `0 4px 12px ${t.ac}30`, fontFamily: "inherit",
                }}>{sub ? "保存中..." : "保存"}</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 空状态 */}
      {!rates.length && !showAdd && (
        <div style={{
          padding: "40px 20px", textAlign: "center", borderRadius: 16,
          border: `1px dashed ${t.bd}`, background: "rgba(255,255,255,0.4)",
          color: t.tm, fontSize: 13,
        }}>
          {isAdmin ? "尚未配置任何业务类型的时薪，点击上方「添加工种」开始设定" : "暂无时薪配置"}
        </div>
      )}

      {/* 时薪卡片列表 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {rates.map(r => {
          const hist = history[r.business_type] || []
          const isExpanded = expandedType === r.business_type
          const isEditingThis = editId === r.id

          return (
            <div key={r.business_type} style={cardS}>
              {isEditingThis ? (
                <div style={{ padding: 20 }}>
                  <div style={{ fontSize: 12, color: t.tm, marginBottom: 12, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
                    <Edit3 size={13} color={t.ac} /> 编辑「{r.business_type}」当前时薪
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                    <div>
                      <label style={lblS}>时薪 (¥)</label>
                      <input type="number" value={editFm.hourly_rate} onChange={e => setEditFm(p => ({ ...p, hourly_rate: e.target.value }))} style={iS} />
                    </div>
                    <div>
                      <label style={lblS}>生效日</label>
                      <input type="date" value={editFm.effective_from} onChange={e => setEditFm(p => ({ ...p, effective_from: e.target.value }))} style={iS} />
                    </div>
                    <div>
                      <label style={lblS}>备注</label>
                      <input value={editFm.note} onChange={e => setEditFm(p => ({ ...p, note: e.target.value }))} style={iS} />
                    </div>
                  </div>
                  <div style={{ marginTop: 14, display: "flex", gap: 10, justifyContent: "flex-end" }}>
                    <button onClick={() => setEditId(null)} style={{ padding: "8px 16px", borderRadius: 10, border: `1px solid ${t.bd}`, background: "rgba(255,255,255,0.8)", color: t.tx, fontSize: 12, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "inherit" }}>
                      <X size={13} /> 取消
                    </button>
                    <button onClick={submitEdit} disabled={sub} style={{ padding: "8px 18px", borderRadius: 10, border: "none", background: t.gn, color: "#fff", fontSize: 12, fontWeight: 600, cursor: sub ? "wait" : "pointer", opacity: sub ? 0.6 : 1, display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "inherit" }}>
                      <Check size={13} /> {sub ? "..." : "保存"}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", flexWrap: "wrap", gap: 14 }}>
                  <span style={{ padding: "4px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, background: "rgba(139,92,246,0.1)", color: "#7C3AED", whiteSpace: "nowrap" }}>
                    {r.business_type}
                  </span>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 4, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 24, fontWeight: 800, color: t.ac, letterSpacing: -0.5 }}>¥{Number(r.hourly_rate).toLocaleString()}</span>
                    <span style={{ fontSize: 13, color: t.ts, fontWeight: 500 }}>/時</span>
                    <span style={{ fontSize: 11, color: t.tm, marginLeft: 10 }}>生效: {fmtDateW(r.effective_from)}</span>
                  </div>
                  <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    {isAdmin && (
                      <>
                        <button onClick={() => startEdit(r)} style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${t.bd}`, background: "rgba(255,255,255,0.8)", color: t.ts, fontSize: 12, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "inherit" }}>
                          <Edit3 size={12} /> 编辑
                        </button>
                        <button onClick={() => { setRaiseTarget(r); setRaiseFm({ hourly_rate: "", effective_from: new Date().toISOString().split("T")[0], note: "涨薪" }); setShowAdd(false); setEditId(null) }} style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${t.ac}50`, background: "rgba(37,99,235,0.06)", color: t.ac, fontSize: 12, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "inherit" }}>
                          <TrendingUp size={12} /> 涨薪
                        </button>
                      </>
                    )}
                    <button onClick={() => setExpandedType(isExpanded ? null : r.business_type)} style={{
                      padding: "6px 10px", borderRadius: 8,
                      border: `1px solid ${isExpanded ? t.ac : t.bd}`,
                      background: isExpanded ? t.tb : "rgba(255,255,255,0.8)",
                      color: isExpanded ? t.ac : t.ts,
                      fontSize: 12, fontWeight: 600, cursor: "pointer",
                      display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "inherit",
                    }}>
                      <History size={12} /> {hist.length > 1 ? `(${hist.length})` : ""}
                      {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                  </div>
                </div>
              )}

              {/* 历史记录展开 */}
              {isExpanded && (
                <div style={{ padding: "4px 20px 16px", background: t.bgI, borderTop: `1px solid ${t.bd}` }}>
                  {hist.map((h, i) => (
                    <div key={h.id} style={{
                      display: "flex", alignItems: "center", gap: 14, padding: "10px 0",
                      borderBottom: i === hist.length - 1 ? "none" : `1px dashed ${t.bd}`, flexWrap: "wrap",
                    }}>
                      <span style={{
                        padding: "2px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                        background: i === 0 ? `${t.ac}15` : t.bl,
                        color: i === 0 ? t.ac : t.ts,
                      }}>
                        {i === 0 ? "当前" : "历史"}
                      </span>
                      <span style={{ fontSize: 15, fontWeight: 700, color: t.tx }}>¥{Number(h.hourly_rate).toLocaleString()}<span style={{ fontSize: 11, color: t.tm, fontWeight: 500 }}>/時</span></span>
                      <span style={{ fontSize: 12, color: t.tm, fontFamily: "monospace" }}>{fmtDateW(h.effective_from)}</span>
                      {h.note && <span style={{ fontSize: 12, color: t.ts, marginLeft: "auto", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.note}</span>}
                      {isAdmin && i !== 0 && (
                        <button onClick={() => delRate(h.id)} style={{ background: "transparent", border: "none", color: t.rd, cursor: "pointer", padding: 4, fontFamily: "inherit", display: "inline-flex", alignItems: "center" }}>
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* 涨薪 Modal */}
      {raiseTarget && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
          backgroundColor: "rgba(15,23,42,0.4)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
          padding: 20,
        }} onClick={() => !sub && setRaiseTarget(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{
            background: "#fff", width: "100%", maxWidth: 440, padding: 28, borderRadius: 20,
            boxShadow: "0 25px 50px -12px rgba(37,99,235,0.15)",
            border: "1px solid rgba(255,255,255,0.9)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 17, color: t.tx, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
                <TrendingUp size={19} color={t.ac} /> 调整时薪
              </h3>
              <button onClick={() => setRaiseTarget(null)} style={{ background: "transparent", border: "none", cursor: "pointer", color: t.td, padding: 4, fontFamily: "inherit" }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 16, background: t.bl, borderRadius: 12 }}>
                <div>
                  <div style={{ fontSize: 11, color: t.tm, marginBottom: 4 }}>当前工种 / 时薪</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: t.tx }}>{raiseTarget.business_type}</div>
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, color: t.ts, fontFamily: "monospace" }}>¥{Number(raiseTarget.hourly_rate).toLocaleString()}</div>
              </div>

              <div>
                <label style={lblS}>新时薪金额 (¥) <span style={{ color: t.rd }}>*</span></label>
                <input type="number" value={raiseFm.hourly_rate} onChange={(e) => setRaiseFm(p => ({ ...p, hourly_rate: e.target.value }))} placeholder={String(Number(raiseTarget.hourly_rate) + 100)}
                  style={{ ...iS, fontSize: 17, fontWeight: 700, color: t.ac }} />
              </div>

              <div>
                <label style={lblS}>生效日期 <span style={{ color: t.rd }}>*</span></label>
                <input type="date" value={raiseFm.effective_from} onChange={(e) => setRaiseFm(p => ({ ...p, effective_from: e.target.value }))} style={iS} />
              </div>

              <div>
                <label style={lblS}>调薪备注</label>
                <input value={raiseFm.note} onChange={(e) => setRaiseFm(p => ({ ...p, note: e.target.value }))} placeholder="例如：能力提升，常规调薪..." style={iS} />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
              <button onClick={() => setRaiseTarget(null)} disabled={sub} style={{ padding: "10px 18px", borderRadius: 12, border: `1px solid ${t.bd}`, background: "rgba(255,255,255,0.8)", color: t.tx, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>取消</button>
              <button onClick={submitRaise} disabled={sub || !raiseFm.hourly_rate} style={{
                padding: "10px 22px", borderRadius: 12, border: "none", background: t.ac, color: "#fff",
                fontSize: 13, fontWeight: 600, cursor: sub ? "wait" : "pointer", opacity: (!raiseFm.hourly_rate || sub) ? 0.6 : 1,
                boxShadow: `0 4px 12px ${t.ac}30`, fontFamily: "inherit",
              }}>{sub ? "保存中..." : "确认涨薪"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
