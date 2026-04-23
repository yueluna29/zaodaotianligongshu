import { useState } from "react"
import { IdCard, X as XIcon, Upload, Check } from "lucide-react"
import { sbFn, sbPatch, sbGet } from "../api/supabase"

export default function UpdateResidenceCardModal({ t, user, token, onDone, onClose }) {
  const [newExpiry, setNewExpiry] = useState(user.residence_expiry || "")
  const [file, setFile] = useState(null)
  const [uploadedId, setUploadedId] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState("")

  const chooseFile = async (f) => {
    if (!f) return
    if (!/\.pdf$/i.test(f.name)) { setErr("请上传 PDF 格式（在留卡正反面合成一个 PDF）"); return }
    if (f.size > 20 * 1024 * 1024) { setErr("文件过大（> 20MB）"); return }
    setErr(""); setFile(f); setUploadedId(null)
    setUploading(true)
    try {
      const n = new Date(), pad = (x) => String(x).padStart(2, "0")
      const ts = `${n.getFullYear()}-${pad(n.getMonth()+1)}-${pad(n.getDate())}_${pad(n.getHours())}-${pad(n.getMinutes())}-${pad(n.getSeconds())}`
      const safeName = (user.name || "teacher").replace(/[\\/:*?"<>|]/g, "_")
      const filename = `${safeName}_在留卡正反面_${ts}.pdf`
      const fd = new FormData()
      fd.append("file", f, filename)
      fd.append("filename", filename)
      fd.append("folder", "zairyuu")
      const res = await sbFn("upload-onboarding-file", fd)
      if (!res?.id) { setErr("上传失败：" + (res?.error || "未知错误")); setUploading(false); return }
      setUploadedId(res.id)
    } catch (e) {
      setErr("上传异常：" + e.message)
    }
    setUploading(false)
  }

  const submit = async () => {
    const patch = {}
    if (uploadedId) patch.residence_card_drive_id = uploadedId
    if (newExpiry && newExpiry !== user.residence_expiry) patch.residence_expiry = newExpiry
    if (Object.keys(patch).length === 0) { setErr("没有可更新的内容（请选择文件或修改期限）"); return }
    setSubmitting(true); setErr("")
    try {
      await sbPatch(`employees?id=eq.${user.id}`, patch, token)
      const fresh = await sbGet(`employees?id=eq.${user.id}&select=*`, token)
      if (fresh?.length) onDone?.({ ...fresh[0], token })
      onClose?.()
    } catch (e) {
      setErr("提交失败：" + e.message)
      setSubmitting(false)
    }
  }

  const iS = { width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${t.bd}`, background: t.bgI, color: t.tx, fontSize: 13, boxSizing: "border-box", minHeight: 40, fontFamily: "inherit" }

  return (
    <div onClick={() => !submitting && !uploading && onClose()} style={{
      position: "fixed", inset: 0, zIndex: 1300, background: "rgba(15,23,42,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "rgba(255,255,255,0.98)", borderRadius: 18, maxWidth: 440, width: "100%",
        padding: 24, boxShadow: "0 30px 80px -20px rgba(15,23,42,0.3)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: t.tx, display: "flex", alignItems: "center", gap: 6 }}>
            <IdCard size={16} color={t.ac} /> 更新在留卡
          </h3>
          <button onClick={onClose} disabled={submitting || uploading} style={{ background: "transparent", border: "none", color: t.tm, cursor: (submitting || uploading) ? "wait" : "pointer", fontFamily: "inherit", display: "inline-flex" }}><XIcon size={18} /></button>
        </div>

        <div style={{ fontSize: 11, color: t.tm, lineHeight: 1.7, padding: "10px 12px", borderRadius: 8, background: t.bl, marginBottom: 14 }}>
          旧期限：{user.residence_expiry || "—"} · 续签或更新了在留卡后，请在这里上传新的正反面 PDF + 更新期限。admin 和你之后都能在档案里看到新版本。
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: t.ts, display: "block", marginBottom: 4 }}>新在留卡正反面 PDF</label>
          <div style={{ padding: 12, borderRadius: 10, border: `1px dashed ${uploadedId ? t.gn : t.bd}`, background: uploadedId ? `${t.gn}08` : t.bgI }}>
            {uploadedId ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: t.gn }}>
                <Check size={14} /> 已上传：{file?.name}
                <label style={{ marginLeft: "auto", cursor: "pointer", padding: "3px 8px", borderRadius: 5, border: `1px solid ${t.bd}`, color: t.ts, fontSize: 10 }}>
                  重新选择
                  <input type="file" accept="application/pdf,.pdf" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) chooseFile(f); e.target.value = "" }} />
                </label>
              </div>
            ) : (
              <label style={{ cursor: uploading ? "wait" : "pointer", display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: t.ac }}>
                <Upload size={14} />
                {uploading ? "上传中..." : "选择 PDF 文件（正反面合成一个）"}
                <input type="file" accept="application/pdf,.pdf" disabled={uploading} style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) chooseFile(f); e.target.value = "" }} />
              </label>
            )}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, color: t.ts, display: "block", marginBottom: 4 }}>新的在留期限</label>
          <input type="date" value={newExpiry} onChange={(e) => setNewExpiry(e.target.value)} style={iS} />
        </div>

        {err && <div style={{ padding: "8px 12px", borderRadius: 8, background: `${t.rd}12`, border: `1px solid ${t.rd}40`, color: t.rd, fontSize: 12, marginBottom: 12 }}>{err}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} disabled={submitting || uploading} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${t.bd}`, background: "transparent", color: t.ts, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>取消</button>
          <button onClick={submit} disabled={submitting || uploading || (!uploadedId && newExpiry === user.residence_expiry)} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: t.ac, color: "#fff", fontSize: 12, fontWeight: 600, cursor: submitting ? "wait" : "pointer", fontFamily: "inherit", opacity: (submitting || uploading || (!uploadedId && newExpiry === user.residence_expiry)) ? 0.5 : 1 }}>
            {submitting ? "提交中..." : "确认更新"}
          </button>
        </div>
      </div>
    </div>
  )
}
