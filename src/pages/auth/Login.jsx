import { useState, useEffect } from "react"
import { sbAuth, sbGet, sbPatch, sbRpc } from "../../api/supabase"

const ID_DOMAIN = "juku.local"
const ID_PATTERN = /^[a-zA-Z0-9]{4,20}$/
const COMPANIES = [{ id: 1, name: "世家学舍" }, { id: 2, name: "紫陽花教育" }]
const DEPTS_FULL = ["教务", "咨询", "宣传", "财务"]
const DEPTS_BAITO = ["大学院", "学部", "文书", "语言类"]
const REGIONS = ["日本", "中国"]
const isFullTime = (et) => et === "正社員" || et === "契約社員"
const SUBJECTS = ["物理", "数学", "机械工学", "电气电子", "情报科学", "土木建筑", "生命理工", "材料化学", "环境工学", "体育学", "大学院文科", "经营工学", "EJU数学", "EJU理科", "日语", "英语", "班主任"]
const GENDERS = ["男", "女"]
const ACCT_TYPES = ["普通", "当座"]

// 邀请 token -> { 可选雇佣类型, 所属公司 id, quick? }
// quick=true：一页极简注册，仅收 ID/密码/基本信息，其他资料之后在「入职信息」补全
const INVITE_TOKENS = {
  "full-wsdst2026": { types: ["正社員", "契約社員"], company_id: 1 }, // 世家学舍 正/契
  "pt-wsdst2026":   { types: ["アルバイト", "外部講師"], company_id: 1, quick: true }, // 世家学舍 バイト/外部
  "full-zyh2026":   { types: ["正社員", "契約社員"], company_id: 2 }, // 紫陽花教育 正/契
  "pt-zyh2026":     { types: ["アルバイト", "外部講師"], company_id: 2, quick: true }, // 紫陽花教育 バイト/外部
}

const emptyForm = () => ({
  loginId: "", password: "", passwordConfirm: "",
  name: "", furigana: "", pinyin: "", gender: "", birth_date: "",
  phone: "", email: "", postal_code: "", address: "",
  company_id: 1, employment_type: "",
  department: "", region: "", hire_date: new Date().toISOString().split("T")[0],
  subjects: [], is_teacher: false,
  nationality: "日本", residence_status: "", residence_card_number: "",
  residence_expiry: "", has_extra_work_permit: false,
  bank_name: "", bank_branch: "", bank_account_type: "普通",
  bank_account_number: "", bank_account_holder: "",
})

export default function Login({ onAuth, theme, t, toggleTheme }) {
  const [allowedTypes, setAllowedTypes] = useState(null) // 数组 or null
  const [lockedCompanyId, setLockedCompanyId] = useState(null) // 邀请链接锁定的公司 id
  const [quickMode, setQuickMode] = useState(false) // 极简注册（baito）
  const [mode, setMode] = useState("login") // "login" | "register" | "forgot"
  const [forgotFm, setForgotFm] = useState({ name: "", phone4: "" })
  const [forgotResult, setForgotResult] = useState(null) // null | { status, login_id? }
  const [step, setStep] = useState(1)
  const [fm, setFm] = useState(emptyForm())
  const [ld, setLd] = useState(false)
  const [err, setErr] = useState("")
  const [msg, setMsg] = useState("")

  // 解析 URL 邀请 token
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const tok = params.get("invite")
    if (tok && INVITE_TOKENS[tok]) {
      const { types, company_id, quick } = INVITE_TOKENS[tok]
      setAllowedTypes(types)
      setLockedCompanyId(company_id)
      setQuickMode(!!quick)
      setFm((p) => ({ ...p, employment_type: types[0], company_id }))
      setMode("register")
    }
  }, [])

  const fakeEmail = (id) => `${id.toLowerCase()}@${ID_DOMAIN}`
  const up = (k, v) => setFm((p) => ({ ...p, [k]: v }))
  const toggle = (k, v) => setFm((p) => {
    const arr = p[k] || []
    return { ...p, [k]: arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v] }
  })

  const lookupForgotId = async () => {
    setErr(""); setForgotResult(null)
    if (!forgotFm.name.trim()) { setErr("请输入姓名"); return }
    if (!/^\d{4}$/.test(forgotFm.phone4)) { setErr("请输入手机号最后 4 位"); return }
    setLd(true)
    try {
      const r = await sbRpc("lookup_login_id", { p_name: forgotFm.name.trim(), p_phone_last4: forgotFm.phone4 })
      setForgotResult(r || { status: "not_found" })
    } catch (e) { setErr("查询出错：" + e.message) }
    setLd(false)
  }

  const login = async () => {
    const id = fm.loginId.trim().toLowerCase()
    if (!id) { setErr("请输入登录ID"); return }
    setLd(true); setErr("")
    try {
      const r = await sbAuth("token?grant_type=password", { email: fakeEmail(id), password: fm.password })
      if (r.error || !r.access_token) { setErr("登录ID或密码错误"); setLd(false); return }
      const e = await sbGet(`employees?auth_user_id=eq.${r.user?.id}&select=*`, r.access_token)
      if (!e?.length) { setErr("未找到社员信息"); setLd(false); return }
      onAuth({ ...e[0], token: r.access_token })
    } catch (e) { setErr(e.message) }
    setLd(false)
  }

  // ========== 向导步骤校验 ==========
  const validate = (s) => {
    if (s === 1) {
      const id = fm.loginId.trim().toLowerCase()
      if (!ID_PATTERN.test(id)) return "登录ID 需 4-20 位英文字母或数字"
      if (fm.password.length < 6) return "密码至少 6 位"
      if (fm.password !== fm.passwordConfirm) return "两次密码输入不一致"
    }
    if (s === 2) {
      if (!fm.name.trim()) return "请填写汉字姓名"
      if (!fm.furigana.trim()) return "请填写假名（用于工资发放）"
      if (!fm.phone.trim()) return "请填写电话号码"
    }
    if (s === 3) {
      if (!fm.company_id) return "请选择所属公司"
      if (!fm.employment_type) return "雇佣类型缺失（可能是邀请链接问题）"
      if (!fm.hire_date) return "请填写入职日期"
      if (fm.nationality && fm.nationality !== "日本") {
        if (!fm.residence_status) return "外国籍需要填写在留资格"
        if (!fm.residence_card_number) return "外国籍需要填写在留卡号码"
        if (!fm.residence_expiry) return "外国籍需要填写在留期限"
      }
    }
    if (s === 4) {
      if (!fm.bank_name.trim()) return "请填写银行名称"
      if (!fm.bank_branch.trim()) return "请填写支店名"
      if (!fm.bank_account_number.trim()) return "请填写账号"
      if (!fm.bank_account_holder.trim()) return "请填写户名（カナ）"
    }
    return null
  }

  const next = () => {
    const e = validate(step)
    if (e) { setErr(e); return }
    setErr(""); setStep((s) => s + 1)
  }
  const prev = () => { setErr(""); setStep((s) => Math.max(1, s - 1)) }

  // ========== 最终提交 ==========
  const submit = async () => {
    for (let s = 1; s <= 4; s++) { const e = validate(s); if (e) { setErr(`第${s}步: ${e}`); setStep(s); return } }
    setLd(true); setErr("")
    const id = fm.loginId.trim().toLowerCase()
    try {
      const r = await sbAuth("signup", {
        email: fakeEmail(id),
        password: fm.password,
        data: {
          name: fm.name.trim(),
          login_id: id,
          real_email: fm.email.trim() || null,
          hire_date: fm.hire_date,
        },
      })
      if (r.error || r.error_description) {
        const raw = r.error_description || r.error?.message || r.error || "注册失败"
        const hint = /already registered|exists|duplicate/i.test(String(raw)) ? "该登录ID已被使用，请换一个" : String(raw)
        setErr(hint); setLd(false); return
      }
      if (!r.access_token) { setMsg("注册完成！请登录"); setMode("login"); setLd(false); return }

      // 等触发器创建 employees 行
      await new Promise((res) => setTimeout(res, 1500))
      const rows = await sbGet(`employees?auth_user_id=eq.${r.user?.id}&select=id`, r.access_token)
      if (!rows?.length) { setMsg("注册完成！请登录"); setMode("login"); setLd(false); return }
      const empId = rows[0].id

      // PATCH 填满其它字段
      await sbPatch(`employees?id=eq.${empId}`, {
        furigana: fm.furigana.trim() || null,
        pinyin: fm.pinyin.trim() || null,
        gender: fm.gender || null,
        birth_date: fm.birth_date || null,
        phone: fm.phone.trim() || null,
        postal_code: fm.postal_code.trim() || null,
        address: fm.address.trim() || null,
        company_id: Number(fm.company_id),
        employment_type: fm.employment_type,
        department: fm.department || null,
        region: fm.region || null,
        hire_date: fm.hire_date,
        subjects: fm.subjects,
        is_teacher: !!fm.is_teacher,
        nationality: fm.nationality.trim() || null,
        residence_status: fm.residence_status.trim() || null,
        residence_card_number: fm.residence_card_number.trim() || null,
        residence_expiry: fm.residence_expiry || null,
        has_extra_work_permit: !!fm.has_extra_work_permit,
        bank_name: fm.bank_name.trim(),
        bank_branch: fm.bank_branch.trim(),
        bank_account_type: fm.bank_account_type,
        bank_account_number: fm.bank_account_number.trim(),
        bank_account_holder: fm.bank_account_holder.trim(),
      }, r.access_token)

      const fresh = await sbGet(`employees?id=eq.${empId}&select=*`, r.access_token)
      if (fresh?.length) { onAuth({ ...fresh[0], token: r.access_token }); return }
      setMsg("注册完成！请登录"); setMode("login")
    } catch (e) { setErr(e.message) }
    setLd(false)
  }

  // ========== 极简注册（baito 快速入职） ==========
  const validateQuick = () => {
    const id = fm.loginId.trim().toLowerCase()
    if (!ID_PATTERN.test(id)) return "登录ID 需 4-20 位英文字母或数字"
    if (fm.password.length < 6) return "密码至少 6 位"
    if (fm.password !== fm.passwordConfirm) return "两次密码输入不一致"
    if (!fm.name.trim()) return "请填写汉字姓名"
    if (!fm.furigana.trim()) return "请填写假名（用于工资发放）"
    if (!fm.phone.trim()) return "请填写电话号码"
    if (!fm.employment_type) return "雇佣类型缺失（可能是邀请链接问题）"
    if (!fm.hire_date) return "请填写入职日期"
    return null
  }

  const submitQuick = async () => {
    const e = validateQuick(); if (e) { setErr(e); return }
    setLd(true); setErr("")
    const id = fm.loginId.trim().toLowerCase()
    try {
      const r = await sbAuth("signup", {
        email: fakeEmail(id),
        password: fm.password,
        data: {
          name: fm.name.trim(),
          login_id: id,
          real_email: fm.email.trim() || null,
          hire_date: fm.hire_date,
        },
      })
      if (r.error || r.error_description) {
        const raw = r.error_description || r.error?.message || r.error || "注册失败"
        const hint = /already registered|exists|duplicate/i.test(String(raw)) ? "该登录ID已被使用，请换一个" : String(raw)
        setErr(hint); setLd(false); return
      }
      if (!r.access_token) { setMsg("注册完成！请登录"); setMode("login"); setLd(false); return }

      await new Promise((res) => setTimeout(res, 1500))
      const rows = await sbGet(`employees?auth_user_id=eq.${r.user?.id}&select=id`, r.access_token)
      if (!rows?.length) { setMsg("注册完成！请登录"); setMode("login"); setLd(false); return }
      const empId = rows[0].id

      await sbPatch(`employees?id=eq.${empId}`, {
        furigana: fm.furigana.trim(),
        pinyin: fm.pinyin.trim() || null,
        phone: fm.phone.trim(),
        company_id: Number(fm.company_id),
        employment_type: fm.employment_type,
        hire_date: fm.hire_date,
      }, r.access_token)

      const fresh = await sbGet(`employees?id=eq.${empId}&select=*`, r.access_token)
      if (fresh?.length) { onAuth({ ...fresh[0], token: r.access_token }); return }
      setMsg("注册完成！请登录"); setMode("login")
    } catch (e) { setErr(e.message) }
    setLd(false)
  }

  // ========== 样式 ==========
  const iS = { padding: "11px 14px", borderRadius: 10, border: `1px solid ${t.bd}`, background: t.bgI, color: t.tx, fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box", minHeight: 43 }
  const labelS = { fontSize: 10, color: t.ts, display: "block", marginBottom: 4, fontWeight: 500 }
  const field = (label, body, req) => (
    <div style={{ marginBottom: 10 }}>
      <label style={labelS}>{label}{req && <span style={{ color: t.rd, marginLeft: 3 }}>*</span>}</label>
      {body}
    </div>
  )

  // ========== 渲染步骤 ==========
  const Step1 = () => (
    <div>
      <div style={{ fontSize: 11, color: t.tm, marginBottom: 12 }}>设置登录用的 ID 和密码。</div>
      {field("登录ID", <input placeholder="4-20位英文/数字" value={fm.loginId} onChange={(e) => up("loginId", e.target.value)} autoCapitalize="none" autoCorrect="off" name="username" autoComplete="username" style={iS} />, true)}
      {field("密码", <input type="password" placeholder="至少 6 位" value={fm.password} onChange={(e) => up("password", e.target.value)} name="new-password" autoComplete="new-password" style={iS} />, true)}
      {field("确认密码", <input type="password" value={fm.passwordConfirm} onChange={(e) => up("passwordConfirm", e.target.value)} autoComplete="new-password" style={iS} />, true)}
    </div>
  )

  const Step2 = () => (
    <div>
      <div style={{ fontSize: 11, color: t.tm, marginBottom: 12 }}>个人信息（姓名和假名用于工资表）。</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {field("汉字姓名", <input value={fm.name} onChange={(e) => up("name", e.target.value)} style={iS} />, true)}
        {field("假名 (Furigana)", <input placeholder="セイ メイ" value={fm.furigana} onChange={(e) => up("furigana", e.target.value)} style={iS} />, true)}
        {field("拼音 (Pinyin)", <input placeholder="Xing Ming" value={fm.pinyin} onChange={(e) => up("pinyin", e.target.value)} style={iS} />)}
        {field("性别", <select value={fm.gender} onChange={(e) => up("gender", e.target.value)} style={iS}><option value="">—</option>{GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}</select>)}
        {field("出生日期", <input type="date" value={fm.birth_date} onChange={(e) => up("birth_date", e.target.value)} style={iS} />)}
        {field("电话", <input value={fm.phone} onChange={(e) => up("phone", e.target.value)} style={iS} />, true)}
      </div>
      {field("邮箱（选填，用于找回密码）", <input type="email" value={fm.email} onChange={(e) => up("email", e.target.value)} style={iS} />)}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 3fr", gap: 10 }}>
        {field("邮编", <input placeholder="123-4567" value={fm.postal_code} onChange={(e) => up("postal_code", e.target.value)} style={iS} />)}
        {field("住址", <input value={fm.address} onChange={(e) => up("address", e.target.value)} style={iS} />)}
      </div>
    </div>
  )

  const Step3 = () => {
    const isForeign = fm.nationality && fm.nationality !== "日本"
    return (
      <div>
        <div style={{ fontSize: 11, color: t.tm, marginBottom: 12 }}>工作信息（雇佣类型由邀请链接决定）。</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {field("所属公司", <select value={fm.company_id} onChange={(e) => up("company_id", Number(e.target.value))} style={iS} disabled={lockedCompanyId != null}>{COMPANIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>, true)}
          {field("雇佣类型", <select value={fm.employment_type} onChange={(e) => up("employment_type", e.target.value)} style={iS} disabled={!allowedTypes}>{(allowedTypes || []).map((tp) => <option key={tp} value={tp}>{tp}</option>)}</select>, true)}
          {field("入职日期", <input type="date" value={fm.hire_date} onChange={(e) => up("hire_date", e.target.value)} style={iS} />, true)}
          {isFullTime(fm.employment_type)
            ? field("地区", <select value={fm.region} onChange={(e) => up("region", e.target.value)} style={iS}><option value="">—</option>{REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}</select>)
            : field("部门", <select value={fm.department} onChange={(e) => up("department", e.target.value)} style={iS}><option value="">—</option>{DEPTS_BAITO.map((d) => <option key={d} value={d}>{d}</option>)}</select>)}
        </div>
        {isFullTime(fm.employment_type) && (
          <div style={{ marginBottom: 10 }}>
            {field("负责部门", <select value={fm.department} onChange={(e) => up("department", e.target.value)} style={iS}><option value="">—</option>{DEPTS_FULL.map((d) => <option key={d} value={d}>{d}</option>)}</select>)}
          </div>
        )}
        <div style={{ marginBottom: 10 }}>
          <label style={{ ...labelS, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input type="checkbox" checked={fm.is_teacher} onChange={(e) => up("is_teacher", e.target.checked)} /> 兼任教师
          </label>
        </div>
        {fm.is_teacher && (
          <div style={{ marginBottom: 10 }}>
            <label style={labelS}>担任科目（多选）</label>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {SUBJECTS.map((s) => {
                const on = fm.subjects.includes(s)
                return <button type="button" key={s} onClick={() => toggle("subjects", s)} style={{ padding: "3px 8px", borderRadius: 14, border: `1px solid ${on ? t.gn : t.bd}`, background: on ? `${t.gn}15` : "transparent", color: on ? t.gn : t.ts, fontSize: 10, cursor: "pointer" }}>{s}</button>
              })}
            </div>
          </div>
        )}
        {field("国籍", <input value={fm.nationality} onChange={(e) => up("nationality", e.target.value)} placeholder="日本 / 中国 / 韓国 …" style={iS} />)}
        {isForeign && (
          <div style={{ marginTop: 6, padding: "12px 14px", borderRadius: 8, background: `${t.ac}08`, border: `1px solid ${t.ac}20` }}>
            <div style={{ fontSize: 10, color: t.ac, fontWeight: 600, marginBottom: 8 }}>在留信息（外国籍必填）</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {field("在留资格", <input value={fm.residence_status} onChange={(e) => up("residence_status", e.target.value)} placeholder="按在留卡如实填写" style={iS} />, true)}
              {field("在留卡号码", <input value={fm.residence_card_number} onChange={(e) => up("residence_card_number", e.target.value)} style={iS} />, true)}
              {field("在留期限", <input type="date" value={fm.residence_expiry} onChange={(e) => up("residence_expiry", e.target.value)} style={iS} />, true)}
              <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 14 }}>
                <label style={{ fontSize: 12, color: t.ts, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <input type="checkbox" checked={fm.has_extra_work_permit} onChange={(e) => up("has_extra_work_permit", e.target.checked)} /> 资格外许可
                </label>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  const Step4 = () => (
    <div>
      <div style={{ fontSize: 11, color: t.tm, marginBottom: 12 }}>银行信息（用于发放工资，全部必填）。</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {field("银行名称", <input value={fm.bank_name} onChange={(e) => up("bank_name", e.target.value)} placeholder="例：三菱UFJ銀行" style={iS} />, true)}
        {field("支店名", <input value={fm.bank_branch} onChange={(e) => up("bank_branch", e.target.value)} style={iS} />, true)}
        {field("账户类型", <select value={fm.bank_account_type} onChange={(e) => up("bank_account_type", e.target.value)} style={iS}>{ACCT_TYPES.map((a) => <option key={a} value={a}>{a}</option>)}</select>)}
        {field("账号（7 位）", <input value={fm.bank_account_number} onChange={(e) => up("bank_account_number", e.target.value)} style={iS} />, true)}
      </div>
      {field("户名（カナ）", <input value={fm.bank_account_holder} onChange={(e) => up("bank_account_holder", e.target.value)} placeholder="ヤマダ タロウ" style={iS} />, true)}
      <div style={{ fontSize: 10, color: t.tm, marginTop: 12, padding: "8px 10px", borderRadius: 6, background: `${t.wn}08`, border: `1px solid ${t.wn}20` }}>
        注：My Number、合同日期、签单提成等将由管理员在签合同时补录。
      </div>
    </div>
  )

  const QuickForm = () => (
    <div>
      <div style={{ fontSize: 11, color: t.ac, marginBottom: 14, padding: "10px 12px", borderRadius: 10, background: `${t.ac}08`, border: `1px solid ${t.ac}20`, lineHeight: 1.6 }}>
        欢迎加入！本页先创建账号，下一页填写在留信息、银行账户、上传材料等完整入职手续。
      </div>
      <div style={{ fontSize: 10, color: t.ts, fontWeight: 600, marginBottom: 6, letterSpacing: ".05em" }}>登录信息</div>
      {field("登录ID", <input placeholder="4-20位英文/数字" value={fm.loginId} onChange={(e) => up("loginId", e.target.value)} autoCapitalize="none" autoCorrect="off" name="username" autoComplete="username" style={iS} />, true)}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {field("密码", <input type="password" placeholder="至少 6 位" value={fm.password} onChange={(e) => up("password", e.target.value)} name="new-password" autoComplete="new-password" style={iS} />, true)}
        {field("确认密码", <input type="password" value={fm.passwordConfirm} onChange={(e) => up("passwordConfirm", e.target.value)} autoComplete="new-password" style={iS} />, true)}
      </div>
      <div style={{ fontSize: 10, color: t.ts, fontWeight: 600, marginTop: 10, marginBottom: 6, letterSpacing: ".05em" }}>基本信息</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {field("汉字姓名", <input value={fm.name} onChange={(e) => up("name", e.target.value)} style={iS} />, true)}
        {field("假名 (Furigana)", <input placeholder="セイ メイ" value={fm.furigana} onChange={(e) => up("furigana", e.target.value)} style={iS} />, true)}
        {field("拼音 (Pinyin)", <input placeholder="Xing Ming" value={fm.pinyin} onChange={(e) => up("pinyin", e.target.value)} style={iS} />)}
        {field("电话", <input value={fm.phone} onChange={(e) => up("phone", e.target.value)} style={iS} />, true)}
      </div>
      {field("邮箱（选填，用于找回密码）", <input type="email" value={fm.email} onChange={(e) => up("email", e.target.value)} style={iS} />)}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {field("入职日期", <input type="date" value={fm.hire_date} onChange={(e) => up("hire_date", e.target.value)} style={iS} />, true)}
        {field("雇佣类型", <select value={fm.employment_type} onChange={(e) => up("employment_type", e.target.value)} style={iS} disabled={!allowedTypes || allowedTypes.length <= 1}>{(allowedTypes || []).map((tp) => <option key={tp} value={tp}>{tp}</option>)}</select>, true)}
      </div>
    </div>
  )

  const StepProgress = () => (
    <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
      {[1, 2, 3, 4].map((s) => (
        <div key={s} style={{ flex: 1, height: 4, borderRadius: 2, background: s <= step ? t.ac : t.bl, transition: "background .2s" }} />
      ))}
    </div>
  )

  const stepTitle = { 1: "创建账号", 2: "个人信息", 3: "工作信息", 4: "银行信息" }[step] || ""

  // ========== 外层渲染 ==========
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: theme === "dark" ? "linear-gradient(135deg,#0B1120,#162032,#0B1120)" : "linear-gradient(135deg,#EFF6FF,#F8FAFC,#EFF6FF)" }}>
      <button onClick={toggleTheme} style={{ position: "fixed", top: 20, right: 20, background: "none", border: "none", fontSize: 22, cursor: "pointer", zIndex: 10 }}>{theme === "dark" ? "☀️" : "🌙"}</button>
      <div style={{ width: "100%", maxWidth: mode === "register" ? 560 : 400, margin: "24px 16px", background: t.bgC, borderRadius: 20, border: `1px solid ${t.bd}`, padding: mode === "register" ? "32px 32px 28px" : "44px 36px", boxShadow: theme === "dark" ? "0 25px 60px rgba(0,0,0,.5)" : "0 25px 60px rgba(0,0,0,.08)" }}>
        <div style={{ textAlign: "center", marginBottom: mode === "register" ? 18 : 28 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: t.ac, letterSpacing: ".08em", marginBottom: 6 }}>早稲田理工塾 OS</div>
          <h1 style={{ fontSize: 21, fontWeight: 700, color: t.tx, margin: 0 }}>勤怠管理系统</h1>
          <p style={{ fontSize: 12, color: t.tm, marginTop: 8 }}>
            {mode === "login" ? "登录" : mode === "forgot" ? "找回登录ID" : quickMode ? "快速入职登记" : `新员工入职登记 · ${stepTitle} (${step}/4)`}
          </p>
          {mode === "register" && allowedTypes && (
            <div style={{ fontSize: 10, color: t.ts, marginTop: 4 }}>
              {lockedCompanyId != null && <>所属公司：{COMPANIES.find(c => c.id === lockedCompanyId)?.name} · </>}
              可注册类型：{allowedTypes.join(" / ")}
            </div>
          )}
        </div>

        {err && <div style={{ background: `${t.rd}12`, border: `1px solid ${t.rd}30`, borderRadius: 8, padding: "8px 14px", marginBottom: 12, fontSize: 12, color: t.rd }}>{err}</div>}
        {msg && <div style={{ background: `${t.gn}12`, border: `1px solid ${t.gn}30`, borderRadius: 8, padding: "8px 14px", marginBottom: 12, fontSize: 12, color: t.gn }}>{msg}</div>}

        {mode === "login" ? (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input placeholder="登录ID" value={fm.loginId} onChange={(e) => up("loginId", e.target.value)} autoCapitalize="none" autoCorrect="off" name="username" autoComplete="username" style={iS} />
              <input placeholder="密码" type="password" value={fm.password} onChange={(e) => up("password", e.target.value)} name="password" autoComplete="current-password" style={iS} onKeyDown={(e) => e.key === "Enter" && login()} />
              <button onClick={login} disabled={ld} style={{ padding: 13, borderRadius: 10, border: "none", background: `linear-gradient(135deg,${t.ac},${t.ah})`, color: "#fff", fontSize: 14, fontWeight: 600, cursor: ld ? "wait" : "pointer", opacity: ld ? 0.7 : 1 }}>{ld ? "..." : "登录"}</button>
            </div>
            <div style={{ textAlign: "center", marginTop: 12 }}>
              <button onClick={() => { setMode("forgot"); setErr(""); setMsg(""); setForgotResult(null) }} style={{ background: "none", border: "none", color: t.ac, fontSize: 11, cursor: "pointer", textDecoration: "underline" }}>
                忘记登录ID？
              </button>
            </div>
            <div style={{ textAlign: "center", marginTop: 12, fontSize: 11, color: t.tm }}>
              新员工请使用管理员提供的入职链接完成注册
            </div>
          </>
        ) : mode === "forgot" ? (
          <>
            <div style={{ fontSize: 11, color: t.tm, marginBottom: 12 }}>请输入注册时填写的姓名 + 手机号最后 4 位，匹配成功后会显示你的登录ID。</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input placeholder="汉字姓名" value={forgotFm.name} onChange={(e) => setForgotFm(p => ({ ...p, name: e.target.value }))} style={iS} />
              <input placeholder="手机号最后 4 位" inputMode="numeric" maxLength={4} value={forgotFm.phone4} onChange={(e) => setForgotFm(p => ({ ...p, phone4: e.target.value.replace(/\D/g, "") }))} style={iS} onKeyDown={(e) => e.key === "Enter" && lookupForgotId()} />
              <button onClick={lookupForgotId} disabled={ld} style={{ padding: 13, borderRadius: 10, border: "none", background: `linear-gradient(135deg,${t.ac},${t.ah})`, color: "#fff", fontSize: 14, fontWeight: 600, cursor: ld ? "wait" : "pointer", opacity: ld ? 0.7 : 1 }}>{ld ? "..." : "查询"}</button>
            </div>
            {forgotResult && (
              <div style={{ marginTop: 14, padding: "12px 14px", borderRadius: 10, border: `1px solid ${forgotResult.status === "ok" ? t.gn : t.wn}40`, background: `${forgotResult.status === "ok" ? t.gn : t.wn}10`, fontSize: 12, color: forgotResult.status === "ok" ? t.gn : t.wn, textAlign: "center" }}>
                {forgotResult.status === "ok" && <>你的登录ID：<span style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 700, marginLeft: 4 }}>{forgotResult.login_id}</span></>}
                {forgotResult.status === "not_found" && "未找到匹配的员工，请确认姓名和手机号；或联系管理员"}
                {forgotResult.status === "multiple" && "找到多名同名员工，请联系管理员获取登录ID"}
                {forgotResult.status === "bad_input" && "输入有误，请检查姓名和 4 位数字"}
              </div>
            )}
            <div style={{ textAlign: "center", marginTop: 14 }}>
              <button onClick={() => { setMode("login"); setErr(""); setForgotResult(null) }} style={{ background: "none", border: "none", color: t.ac, fontSize: 11, cursor: "pointer", textDecoration: "underline" }}>
                返回登录
              </button>
            </div>
          </>
        ) : quickMode ? (
          <>
            {QuickForm()}
            <div style={{ display: "flex", marginTop: 18 }}>
              <div style={{ flex: 1 }} />
              <button onClick={submitQuick} disabled={ld} style={{ padding: "11px 22px", borderRadius: 10, border: "none", background: `linear-gradient(135deg,${t.ac},${t.ah})`, color: "#fff", fontSize: 13, fontWeight: 600, cursor: ld ? "wait" : "pointer", opacity: ld ? 0.7 : 1 }}>{ld ? "提交中..." : "下一页 →"}</button>
            </div>
            <div style={{ textAlign: "center", marginTop: 14 }}>
              <button onClick={() => { setMode("login"); setErr(""); setMsg("") }} style={{ background: "none", border: "none", color: t.ac, fontSize: 11, cursor: "pointer", textDecoration: "underline" }}>
                已有账号？返回登录
              </button>
            </div>
          </>
        ) : (
          <>
            {StepProgress()}
            {step === 1 && Step1()}
            {step === 2 && Step2()}
            {step === 3 && Step3()}
            {step === 4 && Step4()}
            <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
              {step > 1 && <button onClick={prev} disabled={ld} style={{ padding: "11px 18px", borderRadius: 10, border: `1px solid ${t.bd}`, background: "transparent", color: t.ts, fontSize: 13, cursor: "pointer" }}>← 上一步</button>}
              <div style={{ flex: 1 }} />
              {step < 4 ? (
                <button onClick={next} disabled={ld} style={{ padding: "11px 22px", borderRadius: 10, border: "none", background: `linear-gradient(135deg,${t.ac},${t.ah})`, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>下一步 →</button>
              ) : (
                <button onClick={submit} disabled={ld} style={{ padding: "11px 22px", borderRadius: 10, border: "none", background: `linear-gradient(135deg,${t.gn},${t.gn})`, color: "#fff", fontSize: 13, fontWeight: 600, cursor: ld ? "wait" : "pointer", opacity: ld ? 0.7 : 1 }}>{ld ? "提交中..." : "完成注册"}</button>
              )}
            </div>
            <div style={{ textAlign: "center", marginTop: 14 }}>
              <button onClick={() => { setMode("login"); setErr(""); setMsg("") }} style={{ background: "none", border: "none", color: t.ac, fontSize: 11, cursor: "pointer", textDecoration: "underline" }}>
                已有账号？返回登录
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
