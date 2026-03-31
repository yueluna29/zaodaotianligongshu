import { useState } from "react"
import { sbAuth, sbGet } from "../../api/supabase"

export default function Login({ onAuth, theme, t, toggleTheme }) {
  const [mode, setMode] = useState("login")
  const [email, setEmail] = useState("")
  const [pass, setPass] = useState("")
  const [name, setName] = useState("")
  const [ld, setLd] = useState(false)
  const [err, setErr] = useState("")
  const [msg, setMsg] = useState("")

  const login = async () => {
    setLd(true); setErr("")
    try {
      const r = await sbAuth("token?grant_type=password", { email, password: pass })
      if (r.error || !r.access_token) { setErr(r.error_description || r.error?.message || r.error || "登录失败"); setLd(false); return }
      const e = await sbGet(`employees?auth_user_id=eq.${r.user?.id}&select=*`, r.access_token)
      if (!e?.length) { setErr("未找到社员信息"); setLd(false); return }
      onAuth({ ...e[0], token: r.access_token })
    } catch (e) { setErr(e.message) }
    setLd(false)
  }

  const reg = async () => {
    if (!name.trim()) { setErr("请输入姓名"); return }
    setLd(true); setErr("")
    try {
      const r = await sbAuth("signup", { email, password: pass, data: { name: name.trim() } })
      if (r.error || r.error_description) { setErr(r.error_description || r.error?.message || r.error || "注册失败"); setLd(false); return }
      if (r.access_token) {
        await new Promise((r) => setTimeout(r, 1500))
        const e = await sbGet(`employees?auth_user_id=eq.${r.user?.id}&select=*`, r.access_token)
        if (e?.length) onAuth({ ...e[0], token: r.access_token })
        else { setMsg("注册完成！请登录"); setMode("login") }
      } else { setMsg("确认邮件已发送"); setMode("login") }
    } catch (e) { setErr(e.message) }
    setLd(false)
  }

  const iS = { padding: "12px 16px", borderRadius: 10, border: `1px solid ${t.bd}`, background: t.bgI, color: t.tx, fontSize: 14, outline: "none", width: "100%", boxSizing: "border-box" }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: theme === "dark" ? "linear-gradient(135deg,#0B1120,#162032,#0B1120)" : "linear-gradient(135deg,#EFF6FF,#F8FAFC,#EFF6FF)" }}>
      <button onClick={toggleTheme} style={{ position: "fixed", top: 20, right: 20, background: "none", border: "none", fontSize: 22, cursor: "pointer", zIndex: 10 }}>{theme === "dark" ? "☀️" : "🌙"}</button>
      <div style={{ width: "100%", maxWidth: 400, margin: "0 16px", background: t.bgC, borderRadius: 20, border: `1px solid ${t.bd}`, padding: "44px 36px", boxShadow: theme === "dark" ? "0 25px 60px rgba(0,0,0,.5)" : "0 25px 60px rgba(0,0,0,.08)" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: t.ac, letterSpacing: ".08em", marginBottom: 6 }}>早稲田理工塾</div>
          <h1 style={{ fontSize: 21, fontWeight: 700, color: t.tx, margin: 0 }}>勤怠管理系统</h1>
          <p style={{ fontSize: 12, color: t.tm, marginTop: 8 }}>{mode === "login" ? "登录" : "新员工注册"}</p>
        </div>
        {err && <div style={{ background: `${t.rd}12`, border: `1px solid ${t.rd}30`, borderRadius: 8, padding: "8px 14px", marginBottom: 12, fontSize: 12, color: t.rd }}>{err}</div>}
        {msg && <div style={{ background: `${t.gn}12`, border: `1px solid ${t.gn}30`, borderRadius: 8, padding: "8px 14px", marginBottom: 12, fontSize: 12, color: t.gn }}>{msg}</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {mode === "register" && <input placeholder="姓名" value={name} onChange={(e) => setName(e.target.value)} style={iS} />}
          <input placeholder="邮箱" type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={iS} />
          <input placeholder="密码" type="password" value={pass} onChange={(e) => setPass(e.target.value)} style={iS} onKeyDown={(e) => e.key === "Enter" && (mode === "login" ? login() : reg())} />
          <button onClick={mode === "login" ? login : reg} disabled={ld} style={{ padding: 13, borderRadius: 10, border: "none", background: `linear-gradient(135deg,${t.ac},${t.ah})`, color: "#fff", fontSize: 14, fontWeight: 600, cursor: ld ? "wait" : "pointer", opacity: ld ? 0.7 : 1 }}>{ld ? "..." : mode === "login" ? "登录" : "注册"}</button>
        </div>
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <button onClick={() => { setMode(mode === "login" ? "register" : "login"); setErr(""); setMsg("") }} style={{ background: "none", border: "none", color: t.ac, fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>
            {mode === "login" ? "新员工注册 →" : "← 返回登录"}
          </button>
        </div>
      </div>
    </div>
  )
}
