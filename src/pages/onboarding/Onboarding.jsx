import { useState } from "react"
import { sbFn, sbGet, sbPatch } from "../../api/supabase"

const DEPTS_BAITO = ["大学院", "学部", "文书", "语言类"]
const GENDERS = ["男", "女"]
const ACCT_TYPES = ["普通", "当座"]

export default function Onboarding({ user, t, onDone, onLogout }) {
  const [fm, setFm] = useState({
    name: user.name || "",
    pinyin: user.pinyin || "",
    name_kana: user.name_kana || user.furigana || "",
    gender: user.gender || "",
    birth_date: user.birth_date || "",
    phone: user.phone || "",
    email: user.email || "",
    postal_code: user.postal_code || "",
    address: user.address || "",
    department: user.department || "",
    nationality: user.nationality || "",
    hire_date: user.hire_date || new Date().toISOString().split("T")[0],
    residence_status: user.residence_status || "",
    residence_card_number: user.residence_card_number || "",
    residence_expiry: user.residence_expiry || "",
    has_extra_work_permit: !!user.has_extra_work_permit,
    residence_card_drive_id: user.residence_card_drive_id || "",
    student_doc_drive_id: user.student_doc_drive_id || "",
    bank_name: user.bank_name || "",
    bank_branch: user.bank_branch || "",
    bank_branch_code: user.bank_branch_code || "",
    bank_account_type: user.bank_account_type || "普通",
    bank_account_number: user.bank_account_number || "",
    bank_account_holder: user.bank_account_holder || "",
    onboarding_note: user.onboarding_note || "",
  })
  const [up1, setUp1] = useState(false) // 在留卡 uploading
  const [up2, setUp2] = useState(false) // 学生证 uploading
  const [err, setErr] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const set = (k, v) => setFm((p) => ({ ...p, [k]: v }))
  const isForeign = fm.nationality && fm.nationality !== "日本"

  const uploadPdf = async (file, folderKey, suffix, slot) => {
    if (!file) return
    if (!/\.pdf$/i.test(file.name)) { setErr("请上传 PDF 格式（不要上传图片）"); return }
    if (file.size > 20 * 1024 * 1024) { setErr("文件过大（> 20MB）"); return }
    setErr("")
    const setBusy = slot === 1 ? setUp1 : setUp2
    setBusy(true)
    try {
      const safeName = (fm.name || user.name || "unknown").replace(/[\\/:*?"<>|]/g, "_")
      const filename = `${safeName}_${suffix}.pdf`
      const fd = new FormData()
      fd.append("file", file, filename)
      fd.append("filename", filename)
      fd.append("folder", folderKey)
      const res = await sbFn("upload-onboarding-file", fd)
      if (!res?.id) { setErr("上传失败：" + (res?.error || "未知错误")); setBusy(false); return }
      const col = slot === 1 ? "residence_card_drive_id" : "student_doc_drive_id"
      await sbPatch(`employees?id=eq.${user.id}`, { [col]: res.id }, user.token)
      set(col, res.id)
    } catch (e) {
      setErr("上传异常：" + e.message)
    }
    setBusy(false)
  }

  const validate = () => {
    if (!fm.name.trim()) return "请填写姓名（汉字）"
    if (!fm.name_kana.trim()) return "请填写姓名（カタカナ）"
    if (!fm.phone.trim()) return "请填写电话号码"
    if (!fm.postal_code.trim() || !fm.address.trim()) return "请填写邮编和住址"
    if (!fm.department) return "请选择负责部门"
    if (!fm.nationality.trim()) return "请填写国籍/地域"
    if (!fm.hire_date) return "请填写入职日期"
    if (isForeign) {
      if (!fm.residence_status.trim()) return "请填写在留资格"
      if (!fm.residence_card_number.trim()) return "请填写在留卡号码"
      if (!fm.residence_expiry) return "请填写在留卡期限"
      if (!fm.has_extra_work_permit) return "没有资格外许可的打工属于违法行为，请先申请后再入职"
    }
    if (!fm.residence_card_drive_id) return "请上传在留卡正反面 PDF"
    if (!fm.student_doc_drive_id) return "请上传合格通知书或学生卡 PDF"
    if (!fm.email.trim()) return "请填写邮箱"
    if (!fm.bank_name.trim()) return "请填写银行名"
    if (!fm.bank_branch.trim()) return "请填写支店名"
    if (!fm.bank_account_number.trim()) return "请填写银行口座番号"
    if (!fm.bank_account_holder.trim()) return "请填写口座名义（カタカナ）"
    return null
  }

  const submit = async () => {
    const e = validate()
    if (e) { setErr(e); window.scrollTo({ top: 0, behavior: "smooth" }); return }
    setErr(""); setSubmitting(true)
    try {
      await sbPatch(`employees?id=eq.${user.id}`, {
        name: fm.name.trim(),
        pinyin: fm.pinyin.trim() || null,
        name_kana: fm.name_kana.trim(),
        furigana: fm.name_kana.trim(),
        gender: fm.gender || null,
        birth_date: fm.birth_date || null,
        phone: fm.phone.trim(),
        email: fm.email.trim() || null,
        postal_code: fm.postal_code.trim(),
        address: fm.address.trim(),
        department: fm.department,
        nationality: fm.nationality.trim(),
        hire_date: fm.hire_date,
        residence_status: isForeign ? fm.residence_status.trim() : null,
        residence_card_number: isForeign ? fm.residence_card_number.trim() : null,
        residence_expiry: isForeign ? fm.residence_expiry : null,
        has_extra_work_permit: !!fm.has_extra_work_permit,
        residence_card_drive_id: fm.residence_card_drive_id,
        student_doc_drive_id: fm.student_doc_drive_id,
        bank_name: fm.bank_name.trim(),
        bank_branch: fm.bank_branch.trim(),
        bank_branch_code: fm.bank_branch_code.trim() || null,
        bank_account_type: fm.bank_account_type,
        bank_account_number: fm.bank_account_number.trim(),
        bank_account_holder: fm.bank_account_holder.trim(),
        onboarding_note: fm.onboarding_note.trim() || null,
        onboarding_completed_at: new Date().toISOString(),
      }, user.token)
      const fresh = await sbGet(`employees?id=eq.${user.id}&select=*`, user.token)
      if (fresh?.length) onDone({ ...fresh[0], token: user.token })
    } catch (e) {
      setErr("提交失败：" + e.message)
    }
    setSubmitting(false)
  }

  const iS = { padding: "11px 14px", borderRadius: 10, border: `1px solid ${t.bd}`, background: t.bgI, color: t.tx, fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box", minHeight: 43 }
  const labelS = { fontSize: 10, color: t.ts, display: "block", marginBottom: 4, fontWeight: 500 }
  const field = (label, body, req) => (
    <div style={{ marginBottom: 10 }}>
      <label style={labelS}>{label}{req && <span style={{ color: t.rd, marginLeft: 3 }}>*</span>}</label>
      {body}
    </div>
  )
  const sectionTitle = (title, hint) => (
    <div style={{ margin: "22px 0 10px", paddingBottom: 8, borderBottom: `1px solid ${t.bl}` }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: t.tx }}>{title}</div>
      {hint && <div style={{ fontSize: 11, color: t.tm, marginTop: 3 }}>{hint}</div>}
    </div>
  )

  const UploadBox = ({ slot, label, folderKey, suffix, busy, currentId }) => (
    <div style={{ padding: 14, borderRadius: 10, border: `1px dashed ${currentId ? t.gn : t.bd}`, background: currentId ? `${t.gn}08` : t.bgI, marginBottom: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: t.tx, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 10, color: t.tm, lineHeight: 1.6, marginBottom: 10 }}>
        文件名会自动改为：<span style={{ fontFamily: "monospace" }}>{fm.name || "老师名字"}_{suffix}.pdf</span><br />
        请上传 PDF 文件（不要上传图片）
      </div>
      {currentId ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: t.gn }}>
          <span>✓ 已上传</span>
          <label style={{ marginLeft: "auto", cursor: "pointer", padding: "4px 10px", borderRadius: 6, border: `1px solid ${t.bd}`, color: t.ts, fontSize: 11 }}>
            重新上传
            <input type="file" accept="application/pdf,.pdf" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPdf(f, folderKey, suffix, slot); e.target.value = "" }} />
          </label>
        </div>
      ) : (
        <label style={{ display: "inline-block", cursor: busy ? "wait" : "pointer", padding: "8px 14px", borderRadius: 8, background: busy ? t.bl : `${t.ac}15`, border: `1px solid ${t.ac}40`, color: t.ac, fontSize: 12, fontWeight: 600 }}>
          {busy ? "上传中..." : "选择 PDF 文件"}
          <input type="file" accept="application/pdf,.pdf" disabled={busy} style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPdf(f, folderKey, suffix, slot); e.target.value = "" }} />
        </label>
      )}
    </div>
  )

  return (
    <div style={{ minHeight: "100vh", background: t.bg, color: t.tx, padding: "32px 16px 60px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: t.ac, letterSpacing: ".08em", marginBottom: 4 }}>早稲田理工塾 OS</div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>入职手续</h1>
            <div style={{ fontSize: 12, color: t.tm, marginTop: 6 }}>
              欢迎加入！请完整填写以下信息并上传必要材料。完成后才能开始使用系统。
            </div>
          </div>
          <button onClick={onLogout} style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${t.bd}`, background: "transparent", color: t.tm, fontSize: 11, cursor: "pointer" }}>退出</button>
        </div>

        <div style={{ background: t.bgC, borderRadius: 16, border: `1px solid ${t.bd}`, padding: "20px 24px 28px" }}>

          {err && <div style={{ background: `${t.rd}12`, border: `1px solid ${t.rd}30`, borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 12, color: t.rd }}>{err}</div>}

          {sectionTitle("基本信息")}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {field("姓名（汉字）", <input value={fm.name} onChange={(e) => set("name", e.target.value)} style={iS} />, true)}
            {field("姓名（カタカナ）", <input placeholder="セイ メイ" value={fm.name_kana} onChange={(e) => set("name_kana", e.target.value)} style={iS} />, true)}
            {field("名字（罗马字/拼音）", <input placeholder="Xing Ming" value={fm.pinyin} onChange={(e) => set("pinyin", e.target.value)} style={iS} />)}
            {field("性别", <select value={fm.gender} onChange={(e) => set("gender", e.target.value)} style={iS}><option value="">—</option>{GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}</select>)}
            {field("出生年月日", <input type="date" value={fm.birth_date} onChange={(e) => set("birth_date", e.target.value)} style={iS} />)}
            {field("电话号码（中国/日本均可）", <input value={fm.phone} onChange={(e) => set("phone", e.target.value)} style={iS} />, true)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 3fr", gap: 10 }}>
            {field("邮编", <input placeholder="123-4567" value={fm.postal_code} onChange={(e) => set("postal_code", e.target.value)} style={iS} />, true)}
            {field("住址", <input value={fm.address} onChange={(e) => set("address", e.target.value)} style={iS} />, true)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {field("负责部门", <select value={fm.department} onChange={(e) => set("department", e.target.value)} style={iS}><option value="">—</option>{DEPTS_BAITO.map((d) => <option key={d} value={d}>{d}</option>)}</select>, true)}
            {field("国籍/地域", <input placeholder="日本 / 中国 / 韓国 …" value={fm.nationality} onChange={(e) => set("nationality", e.target.value)} style={iS} />, true)}
          </div>
          {field("入职日期（填写当天日期，特殊情况请联系人事老师）", <input type="date" value={fm.hire_date} onChange={(e) => set("hire_date", e.target.value)} style={iS} />, true)}

          {isForeign && (
            <>
              {sectionTitle("在留信息", "请按照在留卡所记载的如实填写")}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {field("在留资格", <input placeholder="按在留卡填写" value={fm.residence_status} onChange={(e) => set("residence_status", e.target.value)} style={iS} />, true)}
                {field("在留卡号码", <input value={fm.residence_card_number} onChange={(e) => set("residence_card_number", e.target.value)} style={iS} />, true)}
                {field("在留卡期限", <input type="date" value={fm.residence_expiry} onChange={(e) => set("residence_expiry", e.target.value)} style={iS} />, true)}
                <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 14 }}>
                  <label style={{ fontSize: 12, color: t.ts, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                    <input type="checkbox" checked={fm.has_extra_work_permit} onChange={(e) => set("has_extra_work_permit", e.target.checked)} /> 资格外许可（留学签证必须）
                  </label>
                </div>
              </div>
              <div style={{ fontSize: 11, color: t.wn, padding: "8px 10px", borderRadius: 6, background: `${t.wn}08`, border: `1px solid ${t.wn}20`, marginTop: 4 }}>
                注意：没有资格外许可的打工属于违法行为，请在填表前确保已申请资格外许可。
              </div>
            </>
          )}

          {sectionTitle("提交材料", "两份材料分别做成 PDF（不要上传图片）")}
          <UploadBox
            slot={1}
            label="在留卡正反面 PDF"
            folderKey="zairyuu"
            suffix="在留卡正反面"
            busy={up1}
            currentId={fm.residence_card_drive_id}
          />
          <UploadBox
            slot={2}
            label="合格通知书或学生卡 PDF"
            folderKey="student"
            suffix="合格通知书或学生卡"
            busy={up2}
            currentId={fm.student_doc_drive_id}
          />

          {sectionTitle("邮箱", "用于系统通知和找回密码")}
          {field("邮箱", <input type="email" value={fm.email} onChange={(e) => set("email", e.target.value)} style={iS} />, true)}

          {sectionTitle("银行信息", "用于发放工资，全部必填")}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {field("银行名", <input placeholder="例：三菱UFJ銀行" value={fm.bank_name} onChange={(e) => set("bank_name", e.target.value)} style={iS} />, true)}
            {field("支店名", <input value={fm.bank_branch} onChange={(e) => set("bank_branch", e.target.value)} style={iS} />, true)}
            {field("支店番号", <input placeholder="3 位数字" value={fm.bank_branch_code} onChange={(e) => set("bank_branch_code", e.target.value)} style={iS} />)}
            {field("口座类别", <select value={fm.bank_account_type} onChange={(e) => set("bank_account_type", e.target.value)} style={iS}>{ACCT_TYPES.map((a) => <option key={a} value={a}>{a}</option>)}</select>)}
            {field("口座番号（7 位）", <input value={fm.bank_account_number} onChange={(e) => set("bank_account_number", e.target.value)} style={iS} />, true)}
            {field("口座名义（カタカナ）", <input placeholder="ヤマダ タロウ" value={fm.bank_account_holder} onChange={(e) => set("bank_account_holder", e.target.value)} style={iS} />, true)}
          </div>

          {sectionTitle("其他备注信息（选填）")}
          {field("备注", <textarea rows={3} value={fm.onboarding_note} onChange={(e) => set("onboarding_note", e.target.value)} style={{ ...iS, fontFamily: "inherit", resize: "vertical" }} />)}

          <div style={{ display: "flex", marginTop: 24 }}>
            <div style={{ flex: 1 }} />
            <button onClick={submit} disabled={submitting} style={{ padding: "13px 28px", borderRadius: 10, border: "none", background: `linear-gradient(135deg,${t.gn},${t.gn})`, color: "#fff", fontSize: 14, fontWeight: 600, cursor: submitting ? "wait" : "pointer", opacity: submitting ? 0.7 : 1 }}>
              {submitting ? "提交中..." : "完成入职手续"}
            </button>
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: 14, fontSize: 11, color: t.tm }}>
          如遇问题请联系人事老师
        </div>
      </div>
    </div>
  )
}
