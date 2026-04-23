import { useState, useEffect } from "react"
import { UserCog, X as XIcon } from "lucide-react"
import { sbFn, sbGet } from "../api/supabase"

const ID_PATTERN = /^[a-zA-Z0-9]{4,20}$/

export default function ChangeLoginIdModal({ t, user, token, onLogout, onClose }) {
  const [currentId, setCurrentId] = useState(user.login_id || "")
  const [changedAt, setChangedAt] = useState(user.login_id_changed_at || null)
  const [newId, setNewId] = useState("")
  const [confirmId, setConfirmId] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [msg, setMsg] = useState(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    (async () => {
      const rows = await sbGet(`employees?id=eq.${user.id}&select=login_id,login_id_changed_at`, token)
      if (rows?.length) {
        setCurrentId(rows[0].login_id || "")
        setChangedAt(rows[0].login_id_changed_at || null)
      }
    })()
  }, [user.id, token])

  const locked = !!changedAt

  const submit = async () => {
    setMsg(null)
    const v = newId.trim().toLowerCase()
    if (!ID_PATTERN.test(v)) { setMsg({ kind: "err", text: "新 ID 需 4-20 位英文字母或数字" }); return }
    if (v === currentId) { setMsg({ kind: "err", text: "新 ID 不能与当前 ID 相同" }); return }
    if (v !== confirmId.trim().toLowerCase()) { setMsg({ kind: "err", text: "两次输入的 ID 不一致" }); return }
    if (!confirm(`确认要把登录 ID 改为「${v}」吗？\n此操作只能进行一次，无法撤销。`)) return

    setSubmitting(true)
    const r = await sbFn("change-login-id", { new_login_id: v }, token)
    setSubmitting(false)

    if (r?.ok) {
      setDone(true)
      setMsg({ kind: "ok", text: `修改成功！请使用新 ID「${v}」重新登录。3 秒后自动退出。` })
      setTimeout(() => { onLogout?.() }, 3000)
      return
    }
    const code = r?.error
    const map = {
      already_changed: "你已经改过一次登录 ID，无法再次修改。",
      same_id: "新 ID 不能与当前 ID 相同。",
      id_taken: "该 ID 已被其他用户占用，请换一个。",
      invalid_format: "ID 格式不合法（4-20 位英文/数字）。",
      not_found: "未找到员工档案。",
    }
    setMsg({ kind: "err", text: map[code] || ("修改失败：" + (r?.error || "未知错误")) })
  }

  const iS = { width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${t.bd}`, background: t.bgI, color: t.tx, fontSize: 13, boxSizing: "border-box", fontFamily: "monospace" }

  return (
    <div onClick={() => !submitting && !done && onClose()} style={{
      position: "fixed", inset: 0, zIndex: 1300, background: "rgba(15,23,42,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "rgba(255,255,255,0.98)", borderRadius: 18, maxWidth: 400, width: "100%",
        padding: 24, boxShadow: "0 30px 80px -20px rgba(15,23,42,0.3)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: t.tx, display: "flex", alignItems: "center", gap: 6 }}>
            <UserCog size={16} color={t.ac} /> 修改登录 ID
          </h3>
          <button onClick={onClose} disabled={submitting || done} style={{ background: "transparent", border: "none", color: t.tm, cursor: (submitting || done) ? "wait" : "pointer", fontFamily: "inherit", display: "inline-flex" }}><XIcon size={18} /></button>
        </div>

        <div style={{ fontSize: 11, color: locked ? t.rd : t.wn, padding: "8px 12px", borderRadius: 8, background: locked ? `${t.rd}10` : `${t.wn}10`, border: `1px solid ${locked ? t.rd : t.wn}30`, marginBottom: 14, lineHeight: 1.6 }}>
          {locked
            ? `已于 ${new Date(changedAt).toLocaleString()} 修改过登录 ID，无法再次修改。如需调整请联系管理员。`
            : "登录 ID 只能修改一次，请慎重填写。修改成功后会自动退出，请用新 ID 重新登录。"}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
          <div>
            <label style={{ fontSize: 11, color: t.ts, display: "block", marginBottom: 4 }}>当前登录 ID</label>
            <div style={{ ...iS, color: t.tm, background: t.bl }}>{currentId || "—"}</div>
          </div>
          <div>
            <label style={{ fontSize: 11, color: t.ts, display: "block", marginBottom: 4 }}>新登录 ID（4-20 位英文/数字）</label>
            <input value={newId} onChange={(e) => setNewId(e.target.value)} autoCapitalize="none" autoCorrect="off" disabled={locked || submitting || done} style={iS} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: t.ts, display: "block", marginBottom: 4 }}>确认新 ID</label>
            <input value={confirmId} onChange={(e) => setConfirmId(e.target.value)} autoCapitalize="none" autoCorrect="off" disabled={locked || submitting || done}
              onKeyDown={(e) => e.key === "Enter" && !locked && submit()} style={iS} />
          </div>
        </div>

        {msg && (
          <div style={{
            padding: "8px 12px", borderRadius: 8,
            background: msg.kind === "ok" ? `${t.gn}15` : `${t.rd}12`,
            border: `1px solid ${msg.kind === "ok" ? `${t.gn}40` : `${t.rd}40`}`,
            color: msg.kind === "ok" ? t.gn : t.rd, fontSize: 12, marginBottom: 12, lineHeight: 1.6,
          }}>{msg.text}</div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} disabled={submitting || done} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${t.bd}`, background: "transparent", color: t.ts, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>{done ? "" : "取消"}</button>
          {!locked && !done && (
            <button onClick={submit} disabled={submitting || !newId || !confirmId} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: t.ac, color: "#fff", fontSize: 12, fontWeight: 600, cursor: submitting ? "wait" : "pointer", fontFamily: "inherit", opacity: (!newId || !confirmId || submitting) ? 0.5 : 1 }}>
              {submitting ? "修改中..." : "确定修改"}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
