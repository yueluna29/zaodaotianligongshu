import { useState, useEffect } from "react"
import { ShieldAlert, X as XIcon } from "lucide-react"
import { sbGet, sbPatch } from "../api/supabase"

export default function MaintenanceModeModal({ t, token, onClose, onChange }) {
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [on, setOn] = useState(false)
  const [message, setMessage] = useState("")
  const [updatedAt, setUpdatedAt] = useState(null)
  const [err, setErr] = useState("")

  useEffect(() => {
    (async () => {
      const rows = await sbGet("system_state?id=eq.1&select=*", token)
      if (rows?.length) {
        setOn(!!rows[0].maintenance_mode)
        setMessage(rows[0].maintenance_message || "")
        setUpdatedAt(rows[0].updated_at)
      }
      setLoading(false)
    })()
  }, [token])

  const submit = async (newOn) => {
    const label = newOn ? "开启" : "关闭"
    if (!confirm(`确定${label}维护模式？${newOn ? "开启后所有非超级管理员的用户都会被锁定，正在编辑的工作会丢失。" : ""}`)) return
    setSubmitting(true); setErr("")
    const r = await sbPatch("system_state?id=eq.1", {
      maintenance_mode: newOn,
      maintenance_message: message.trim() || null,
      updated_at: new Date().toISOString(),
    }, token)
    setSubmitting(false)
    if (!Array.isArray(r) || !r.length) {
      setErr(`${label}失败：${r?.message || "未知错误"}`)
      return
    }
    setOn(newOn)
    setUpdatedAt(r[0].updated_at)
    onChange?.(newOn)
  }

  const iS = { width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${t.bd}`, background: t.bgI, color: t.tx, fontSize: 13, boxSizing: "border-box", minHeight: 40, fontFamily: "inherit" }

  return (
    <div onClick={() => !submitting && onClose()} style={{
      position: "fixed", inset: 0, zIndex: 1300, background: "rgba(15,23,42,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "rgba(255,255,255,0.98)", borderRadius: 18, maxWidth: 440, width: "100%",
        padding: 24, boxShadow: "0 30px 80px -20px rgba(15,23,42,0.3)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: t.tx, display: "flex", alignItems: "center", gap: 6 }}>
            <ShieldAlert size={16} color={on ? t.rd : t.ac} /> 维护模式
          </h3>
          <button onClick={onClose} disabled={submitting} style={{ background: "transparent", border: "none", color: t.tm, cursor: submitting ? "wait" : "pointer", fontFamily: "inherit", display: "inline-flex" }}><XIcon size={18} /></button>
        </div>

        {loading ? (
          <div style={{ fontSize: 12, color: t.tm, padding: "16px 0" }}>读取状态中...</div>
        ) : (
          <>
            <div style={{ padding: "12px 14px", borderRadius: 10, background: on ? `${t.rd}10` : `${t.gn}10`, border: `1px solid ${on ? t.rd : t.gn}30`, marginBottom: 14, fontSize: 12, lineHeight: 1.6 }}>
              <div style={{ fontWeight: 700, color: on ? t.rd : t.gn, marginBottom: 4 }}>
                当前状态：{on ? "维护中" : "正常运行"}
              </div>
              <div style={{ color: t.tm, fontSize: 11 }}>
                {updatedAt && <>最后变更：{new Date(updatedAt).toLocaleString()}<br /></>}
                开启后：其他所有用户（包括普通 admin）都会被锁定在维护页面，无法使用系统。只有超级管理员（你）可以继续操作。
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, color: t.ts, display: "block", marginBottom: 4 }}>维护提示（选填，用户在维护页看到）</label>
              <textarea rows={2} value={message} onChange={(e) => setMessage(e.target.value)}
                placeholder="例：系统升级中，预计 20 分钟后恢复"
                style={{ ...iS, resize: "vertical", minHeight: 52 }} />
            </div>

            {err && <div style={{ padding: "8px 12px", borderRadius: 8, background: `${t.rd}12`, border: `1px solid ${t.rd}40`, color: t.rd, fontSize: 12, marginBottom: 12 }}>{err}</div>}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={onClose} disabled={submitting} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${t.bd}`, background: "transparent", color: t.ts, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>关闭</button>
              {on ? (
                <button onClick={() => submit(false)} disabled={submitting} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: t.gn, color: "#fff", fontSize: 12, fontWeight: 600, cursor: submitting ? "wait" : "pointer", fontFamily: "inherit", opacity: submitting ? 0.5 : 1 }}>
                  {submitting ? "处理中..." : "关闭维护模式"}
                </button>
              ) : (
                <button onClick={() => submit(true)} disabled={submitting} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: t.rd, color: "#fff", fontSize: 12, fontWeight: 600, cursor: submitting ? "wait" : "pointer", fontFamily: "inherit", opacity: submitting ? 0.5 : 1 }}>
                  {submitting ? "处理中..." : "开启维护模式"}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
