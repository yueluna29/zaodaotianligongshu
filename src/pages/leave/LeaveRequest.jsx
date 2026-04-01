import { useState, useEffect, useCallback } from "react"
import { sbGet, sbPost, sbPatch, sbDel } from "../../api/supabase"
import { LEAVE_TYPES } from "../../config/constants"
import { calcPaidLeave } from "../../config/leaveCalc"
import DateMultiPicker from "../../components/DateMultiPicker"

export default function LeaveRequest({ user, t, tk }) {
  const [reqs, sReqs] = useState([])
  const [ld, sLd] = useState(true)
  const [show, sShow] = useState(false)
  const [fm, sFm] = useState({ leave_type: "有休", dates: [], reason: "", is_half_day: false })
  const [sub, sSub] = useState(false)
  const [bal, sBal] = useState({ currentGrant: 0, carryOver: 0, used: 0, balance: 0, totalAvailable: 0 })
  const [compBal, setCompBal] = useState(0)
  const [editId, setEditId] = useState(null)
  const [showTL, setShowTL] = useState(false)
  const [histMode, setHistMode] = useState(false)
  const [allEmps, setAllEmps] = useState([])
  const [selEmp, setSelEmp] = useState("")
  const isAdmin = user.role === "admin"

  const load = useCallback(async () => {
    sLd(true)
    const [r, usedReqs, compReqs] = await Promise.all([
      sbGet(`leave_requests?employee_id=eq.${user.id}&order=created_at.desc&select=*`, tk),
      sbGet(`leave_requests?employee_id=eq.${user.id}&status=eq.承認&leave_type=eq.有休&select=leave_date,is_half_day`, tk),
      sbGet(`day_swap_requests?employee_id=eq.${user.id}&swap_type=eq.休日出勤&compensation_type=eq.換休&status=eq.承認&select=id,swap_date`, tk),
    ])
    sReqs(r || [])
    sBal(calcPaidLeave(user.hire_date, usedReqs || []))
    const unused = (compReqs || []).filter(c => !c.swap_date).length
    setCompBal(unused)
    if (user.role === "admin") {
      const emps = await sbGet("employees?is_active=eq.true&order=name&select=id,name", tk)
      setAllEmps(emps || [])
    }
    sLd(false)
  }, [user.id, tk])

  useEffect(() => { load() }, [load])

  const resetForm = () => {
    sFm({ leave_type: "有休", dates: [], reason: "", is_half_day: false })
    setEditId(null)
    sShow(false)
  }

  const submit = async () => {
    if (!fm.dates.length) return
    sSub(true)
    const targetId = histMode && selEmp ? selEmp : user.id
    if (editId) {
      await sbPatch(`leave_requests?id=eq.${editId}`, {
        leave_type: fm.leave_type,
        leave_date: fm.dates[0],
        reason: fm.reason || null,
        is_half_day: fm.is_half_day,
      }, tk)
    } else {
      for (const date of fm.dates) {
        const rec = {
          employee_id: targetId,
          leave_type: fm.leave_type,
          leave_date: date,
          reason: fm.reason || null,
          is_half_day: fm.is_half_day,
        }
        if (histMode) {
          rec.status = "承認"
          rec.approved_at = new Date().toISOString()
        }
        await sbPost("leave_requests", rec, tk)
      }
    }
    await load()
    resetForm()
    setHistMode(false)
    setSelEmp("")
    sSub(false)
  }

  const startEdit = (r) => {
    sFm({
      leave_type: r.leave_type,
      dates: [r.leave_date],
      reason: r.reason || "",
      is_half_day: r.is_half_day || false,
    })
    setEditId(r.id)
    sShow(true)
  }

  const delReq = async (id) => {
    if (!confirm("确定要取消这条申请吗？")) return
    await sbDel(`leave_requests?id=eq.${id}`, tk)
    await load()
  }

  const sB = (s) => {
    const c = s === "承認" ? t.gn : s === "却下" ? t.rd : t.wn
    return { padding: "3px 8px", borderRadius: 5, fontSize: 10, fontWeight: 600, color: c, background: `${c}18` }
  }

  const iS = { width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${t.bd}`, background: t.bgI, color: t.tx, fontSize: 13, boxSizing: "border-box" }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: t.tx, margin: 0 }}>🌴 假期管理</h2>
        <button onClick={() => { if (show) resetForm(); else sShow(true) }} style={{ padding: "8px 18px", borderRadius: 8, border: show ? `1px solid ${t.bd}` : "none", background: show ? "transparent" : t.ac, color: show ? t.ts : "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{show ? "✕ 关闭" : "+ 新申请"}</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 8, marginBottom: 20 }}>
      <div style={{ background: t.bgC, borderRadius: 10, padding: "14px 16px", border: `1px solid ${t.bd}`, cursor: "pointer" }} onClick={() => setShowTL(p => !p)}>
        <div style={{ fontSize: 10, color: t.tm }}>有休余额 <span style={{ color: t.ac }}>▾ 详情</span></div>
        <div style={{ fontSize: 26, fontWeight: 700, color: t.ac, marginTop: 4 }}>{bal.balance}天</div>
        <div style={{ fontSize: 10, color: t.td }}>本年{bal.currentGrant} + 繰越{bal.carryOver} - 已用{bal.used}</div>
      </div>

      {showTL && bal.timeline?.length > 0 && (
  <div style={{ background: t.bgC, borderRadius: 10, border: `1px solid ${t.bd}`, padding: 16, marginBottom: 20 }}>
    <h3 style={{ fontSize: 13, fontWeight: 600, color: t.tx, margin: "0 0 12px" }}>有休付与时间线</h3>
    <div style={{ fontSize: 10, color: t.tm, marginBottom: 10 }}>入职日: {user.hire_date || "未设定"}</div>
    {bal.timeline.map((item, i) => {
      const sc = item.status === "当前" ? t.ac : item.status === "繰越中" ? "#8B5CF6" : item.status === "已过期" ? t.rd : t.td
      return (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${t.bl}` }}>
          <div style={{ width: 8, height: 8, borderRadius: 4, background: sc, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: item.status === "当前" ? 700 : 400, color: item.status === "未到达" ? t.td : t.tx }}>
              {item.label} — {item.days}天
            </div>
            <div style={{ fontSize: 10, color: t.tm }}>
              付与: {item.grantDate} → 期限: {item.expiresDate}
            </div>
          </div>
          <span style={{ padding: "2px 7px", borderRadius: 5, fontSize: 9, fontWeight: 600, color: sc, background: `${sc}18` }}>{item.status}</span>
        </div>
      )
    })}
  </div>
)}

        <div style={{ background: t.bgC, borderRadius: 10, padding: "14px 16px", border: `1px solid ${t.bd}` }}><div style={{ fontSize: 10, color: t.tm }}>申请中</div><div style={{ fontSize: 26, fontWeight: 700, color: t.wn, marginTop: 4 }}>{reqs.filter((r) => r.status === "申請中").length}件</div></div>
        <div style={{ background: t.bgC, borderRadius: 10, padding: "14px 16px", border: `1px solid ${t.bd}` }}><div style={{ fontSize: 10, color: t.tm }}>已批准</div><div style={{ fontSize: 26, fontWeight: 700, color: t.gn, marginTop: 4 }}>{reqs.filter((r) => r.status === "承認").length}件</div></div>
        <div style={{ background: t.bgC, borderRadius: 10, padding: "14px 16px", border: `1px solid ${t.bd}` }}><div style={{ fontSize: 10, color: t.tm }}>代休余额</div><div style={{ fontSize: 26, fontWeight: 700, color: "#8B5CF6", marginTop: 4 }}>{compBal}天</div><div style={{ fontSize: 10, color: t.td }}>未消化的换休</div></div>
      </div>

      {show && (
        <div style={{ background: t.bgC, borderRadius: 12, padding: 22, border: `2px solid ${t.ac}33`, marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: t.tx, margin: 0 }}>{editId ? "📝 编辑申请" : histMode ? "📂 历史录入" : "📝 新申请"}</h3>
            {isAdmin && !editId && (
              <button type="button" onClick={() => setHistMode(p => !p)} style={{ padding: "4px 12px", borderRadius: 6, border: `1px solid ${histMode ? "#8B5CF6" : t.bd}`, background: histMode ? "#8B5CF620" : "transparent", color: histMode ? "#8B5CF6" : t.ts, fontSize: 10, cursor: "pointer" }}>
                {histMode ? "切回普通申请" : "历史录入模式"}
              </button>
            )}
</div>

{histMode && (
  <div style={{ marginBottom: 12, padding: 12, borderRadius: 8, background: `#8B5CF610`, border: `1px solid #8B5CF630` }}>
    <div style={{ fontSize: 10, color: "#8B5CF6", marginBottom: 6, fontWeight: 600 }}>管理者历史录入模式 — 记录将自动设为已批准</div>
    <label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>选择社员</label>
    <select value={selEmp} onChange={(e) => setSelEmp(e.target.value)} style={iS}>
      <option value="">请选择社员</option>
      {allEmps.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
    </select>
  </div>
)}

          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>类型</label>
            <select value={fm.leave_type} onChange={(e) => sFm((p) => ({ ...p, leave_type: e.target.value }))} style={iS}>{LEAVE_TYPES.map((l) => <option key={l.v} value={l.v}>{l.i} {l.l}</option>)}</select>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>{editId ? "日期" : "选择日期（点击选取，可多选）"}</label>
            {editId ? (
              <input type="date" value={fm.dates[0] || ""} onChange={(e) => sFm(p => ({ ...p, dates: [e.target.value] }))} style={iS} />
            ) : (
              <DateMultiPicker selected={fm.dates} onChange={(dates) => sFm(p => ({ ...p, dates }))} t={t} />
            )}
          </div>
          <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{ fontSize: 10, color: t.ts }}>半天休</label>
            <button type="button" onClick={() => sFm((p) => ({ ...p, is_half_day: !p.is_half_day }))} style={{ width: 40, height: 22, borderRadius: 11, border: "none", background: fm.is_half_day ? t.ac : t.bd, position: "relative", cursor: "pointer", transition: "background 0.2s" }}>
              <div style={{ width: 16, height: 16, borderRadius: 8, background: "#fff", position: "absolute", top: 3, left: fm.is_half_day ? 21 : 3, transition: "left 0.2s" }} />
            </button>
            <span style={{ fontSize: 10, color: t.tm }}>{fm.is_half_day ? "0.5天" : "1天"}</span>
          </div>
          <div style={{ marginBottom: 14 }}><label style={{ fontSize: 10, color: t.ts, display: "block", marginBottom: 4 }}>理由</label><input placeholder="例：私事、身体不适" value={fm.reason} onChange={(e) => sFm((p) => ({ ...p, reason: e.target.value }))} style={iS} /></div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={submit} disabled={sub || !fm.dates.length || (histMode && !selEmp)} style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: t.ac, color: "#fff", fontSize: 13, fontWeight: 600, cursor: (sub || !fm.dates.length) ? "not-allowed" : "pointer", opacity: (sub || !fm.dates.length || (histMode && !selEmp)) ? 0.5 : 1 }}>{sub ? "提交中..." : editId ? "保存修改" : `提交申请（${fm.dates.length}天）`}</button>
            {editId && <button onClick={resetForm} style={{ padding: "10px 24px", borderRadius: 8, border: `1px solid ${t.bd}`, background: "transparent", color: t.ts, fontSize: 13, cursor: "pointer" }}>取消编辑</button>}
          </div>
        </div>
      )}

      {ld ? <div style={{ textAlign: "center", padding: 40, color: t.tm }}>加载中...</div> :
        <div style={{ background: t.bgC, borderRadius: 10, border: `1px solid ${t.bd}`, overflow: "hidden" }}>
          {!reqs.length ? <div style={{ padding: 24, textAlign: "center", color: t.tm, fontSize: 12 }}>暂无申请记录</div> : reqs.map((r) => {
            const lt = LEAVE_TYPES.find((l) => l.v === r.leave_type)
            const isPending = r.status === "申請中"
            return (
              <div key={r.id} style={{ padding: "12px 16px", borderBottom: `1px solid ${t.bl}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ padding: "2px 7px", borderRadius: 5, fontSize: 10, fontWeight: 600, color: lt?.c, background: (lt?.bg || "#eee") + "33" }}>{lt?.i} {r.leave_type}</span>
                  <span style={{ fontSize: 12, color: t.tx, fontFamily: "monospace" }}>{r.leave_date}{r.is_half_day && <span style={{ fontSize: 9, color: t.ac, marginLeft: 4 }}>半天</span>}</span>
                  {r.reason && <span style={{ fontSize: 11, color: t.ts }}>{r.reason}</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {isPending && (
                    <>
                      <button onClick={() => startEdit(r)} style={{ padding: "3px 10px", borderRadius: 5, border: `1px solid ${t.bd}`, background: "transparent", color: t.ac, fontSize: 10, cursor: "pointer" }}>编辑</button>
                      <button onClick={() => delReq(r.id)} style={{ padding: "3px 10px", borderRadius: 5, border: `1px solid ${t.rd}33`, background: "transparent", color: t.rd, fontSize: 10, cursor: "pointer" }}>取消</button>
                    </>
                  )}
                  <span style={sB(r.status)}>{r.status}</span>
                </div>
              </div>
            )
          })}
        </div>}
    </div>
  )
}