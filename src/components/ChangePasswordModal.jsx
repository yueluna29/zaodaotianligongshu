import { useState } from "react"
import { KeyRound, X as XIcon } from "lucide-react"
import { sbUpdateUser } from "../api/supabase"

export default function ChangePasswordModal({ t, token, onClose }) {
  const [pwd1, setPwd1] = useState("")
  const [pwd2, setPwd2] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [msg, setMsg] = useState(null)

  const submit = async () => {
    setMsg(null)
    if (pwd1.length < 6) { setMsg({ kind: "err", text: "新密码至少 6 位" }); return }
    if (pwd1 !== pwd2) { setMsg({ kind: "err", text: "两次输入的密码不一致" }); return }
    setSubmitting(true)
    const r = await sbUpdateUser({ password: pwd1 }, token)
    setSubmitting(false)
    if (r?.error || r?.error_description || r?.msg) {
      setMsg({ kind: "err", text: r.error_description || r.msg || r.error || "修改失败。登录时间过久请重新登录后再试。" })
      return
    }
    setMsg({ kind: "ok", text: "修改成功，下次登录使用新密码" })
    setPwd1(""); setPwd2("")
  }

  return (
    <div onClick={() => !submitting && onClose()} style={{
      position: "fixed", inset: 0, zIndex: 1300, background: "rgba(15,23,42,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "rgba(255,255,255,0.98)", borderRadius: 18, maxWidth: 380, width: "100%",
        padding: 24, boxShadow: "0 30px 80px -20px rgba(15,23,42,0.3)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: t.tx, display: "flex", alignItems: "center", gap: 6 }}>
            <KeyRound size={16} color={t.ac} /> 修改密码
          </h3>
          <button onClick={onClose} disabled={submitting} style={{ background: "transparent", border: "none", color: t.tm, cursor: submitting ? "wait" : "pointer", fontFamily: "inherit", display: "inline-flex" }}><XIcon size={18} /></button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
          <div>
            <label style={{ fontSize: 11, color: t.ts, display: "block", marginBottom: 4 }}>新密码（至少 6 位）</label>
            <input type="password" value={pwd1} onChange={(e) => setPwd1(e.target.value)} autoFocus
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${t.bd}`, background: t.bgI, color: t.tx, fontSize: 13, boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: t.ts, display: "block", marginBottom: 4 }}>确认新密码</label>
            <input type="password" value={pwd2} onChange={(e) => setPwd2(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${t.bd}`, background: t.bgI, color: t.tx, fontSize: 13, boxSizing: "border-box" }} />
          </div>
        </div>
        {msg && (
          <div style={{
            padding: "8px 12px", borderRadius: 8,
            background: msg.kind === "ok" ? `${t.gn}15` : `${t.rd}12`,
            border: `1px solid ${msg.kind === "ok" ? `${t.gn}40` : `${t.rd}40`}`,
            color: msg.kind === "ok" ? t.gn : t.rd, fontSize: 12, marginBottom: 12,
          }}>{msg.text}</div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} disabled={submitting} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${t.bd}`, background: "transparent", color: t.ts, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>取消</button>
          <button onClick={submit} disabled={submitting || !pwd1 || !pwd2} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: t.ac, color: "#fff", fontSize: 12, fontWeight: 600, cursor: submitting ? "wait" : "pointer", fontFamily: "inherit", opacity: (!pwd1 || !pwd2 || submitting) ? 0.5 : 1 }}>
            {submitting ? "修改中..." : "确定修改"}
          </button>
        </div>
      </div>
    </div>
  )
}
