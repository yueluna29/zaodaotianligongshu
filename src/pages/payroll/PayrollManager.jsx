import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import * as XLSX from "xlsx"
import { sbGet, sbPost, sbDel } from "../../api/supabase"
import {
  ChevronLeft, ChevronRight, Trash2, Save, Download, Plus,
  Calculator, Wallet, DollarSign, Building2, RefreshCw, Pencil,
} from "lucide-react"
import { COMPANIES, sortByName, isFullTime, isHourly, fmtYen } from "../../config/constants"
import { lookupR8Tax0 } from "../../utils/r8TaxTable"

const PAY_METHODS = ["日本对公", "国内对公", "微信", "支付宝", "现金", "paypay", "その他"]
// 源泉：扣/不扣。"扣" + baito/外部 → R8税額表 甲欄 0人自动查表；"扣" + 正/契 → 0（社労士给数字）
const TAX_MODES = [
  { value: 0, label: "不扣" },
  { value: 0.1, label: "扣" },
]

// 8 项进 支給合計
const INCOME_FIELDS = [
  { k: "base_salary", l: "基本給" },
  { k: "housing_allowance", l: "住宅手当" },
  { k: "fixed_overtime", l: "固定残業" },
  { k: "job_allowance", l: "職務給" },
  { k: "bonus", l: "報酬金" },
  { k: "transport_nontax", l: "非課税交通費" },
  { k: "overtime_allowance", l: "時間外手当" },
  { k: "absence_deduction", l: "欠勤控除" },
]
// 4 项真正从支給里扣（sumDeduction）
const DEDUCTION_FIELDS = [
  { k: "health_insurance", l: "健康保険" },
  { k: "pension", l: "厚生年金" },
  { k: "employment_insurance", l: "雇用保険" },
  { k: "resident_tax", l: "住民税" },
]
// 2 项作为加项（sumAdjustment）：年末 refund / prior 补偿 —— 正数=退还, 负数=补扣
const ADJUSTMENT_FIELDS = [
  { k: "year_end_adjustment", l: "年末調整" },
  { k: "prior_period_adjustment", l: "上期調整" },
]
const ALL_NUM_FIELDS = [
  "reported_amount",
  ...INCOME_FIELDS.map(f => f.k),
  ...DEDUCTION_FIELDS.map(f => f.k),
  ...ADJUSTMENT_FIELDS.map(f => f.k),
  "withholding_tax",
]

const num = (v) => {
  if (v === null || v === undefined || v === "") return 0
  const n = parseFloat(v); return isNaN(n) ? 0 : n
}
const sumIncome = (r) => INCOME_FIELDS.reduce((s, f) => s + num(r[f.k]), 0)
const sumDeduction = (r) => DEDUCTION_FIELDS.reduce((s, f) => s + num(r[f.k]), 0)
const sumAdjustment = (r) => ADJUSTMENT_FIELDS.reduce((s, f) => s + num(r[f.k]), 0)
// 源泉所得税自动（与扣税0.1 无关）：
// - 正社員 / 契約社員 → 0（社労士提供最终数字，需手填覆盖）
// - baito / 外部（甲欄 扶養 0 人）→ R8税額表查表：(支給合計 − 社保4项)
const autoTax = (r) => {
  const et = r._emp?.employment_type
  if (isFullTime(et)) return 0
  if (isHourly(et)) return lookupR8Tax0(sumIncome(r) - sumDeduction(r))
  return 0
}
const effTax = (r) => (r.withholding_tax === null || r.withholding_tax === undefined || r.withholding_tax === "") ? autoTax(r) : num(r.withholding_tax)
// 扣税0.1（公司侧扣项，仅在非公账支付方式时使用）：支給合計 × withhold_rate（0 或 0.1）
const extraWithhold = (r) => Math.round(sumIncome(r) * num(r.withhold_rate))
const netPay = (r) => sumIncome(r) - sumDeduction(r) - effTax(r) + sumAdjustment(r) - extraWithhold(r)
const hasTaxOverride = (r) => r.withholding_tax !== null && r.withholding_tax !== undefined && r.withholding_tax !== ""

const emptyRow = (emp, year, month, company_id, sort_order = 0) => ({
  _key: `new-${emp.id}-${sort_order}-${Math.random().toString(36).slice(2, 7)}`,
  id: null,
  employee_id: emp.id,
  year, month, company_id, sort_order,
  payment_method: emp._default_method || "日本对公",
  withhold_rate: 0,
  account_override: "",
  ...Object.fromEntries(ALL_NUM_FIELDS.map(k => [k, null])),
  note: "",
  _emp: emp,
  _dirty: false,
  _delete: false,
})

function hasAnyData(r) {
  if (ALL_NUM_FIELDS.some(k => r[k] !== null && r[k] !== undefined && r[k] !== "")) return true
  if (r.note) return true
  if (r.account_override) return true
  return false
}

function cleanForDb(r, user) {
  const out = {
    employee_id: r.employee_id,
    year: r.year, month: r.month, company_id: r.company_id,
    sort_order: r.sort_order || 0,
    payment_method: r.payment_method || null,
    withhold_rate: num(r.withhold_rate),
    account_override: r.account_override || null,
    note: r.note || null,
    updated_by: user?.id || null,
  }
  for (const k of ALL_NUM_FIELDS) out[k] = r[k] === "" || r[k] === undefined ? null : r[k]
  if (r.id) out.id = r.id
  return out
}

const empLabel = (et) => {
  if (et === "正社員" || et === "正社员") return "正社員"
  if (et === "契約社員") return "契約"
  if (et === "アルバイト" || et === "兼职") return "バイト"
  if (et === "外部講師") return "外部"
  return et || "-"
}

export default function PayrollManager({ user, t, tk }) {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [companyId, setCompanyId] = useState(1)
  const [emps, setEmps] = useState([])
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)

  // token 存 ref，避免每次 App 自动续期后触发本页 reload —— 否则用户切 tab 回来编辑会被清空
  const tkRef = useRef(tk)
  useEffect(() => { tkRef.current = tk }, [tk])

  const shiftMonth = (delta) => {
    let y = year, m = month + delta
    while (m < 1) { m += 12; y-- }
    while (m > 12) { m -= 12; y++ }
    setYear(y); setMonth(m)
  }

  const reload = useCallback(async () => {
    setLoading(true)
    const tok = tkRef.current
    const sd = `${year}-${String(month).padStart(2, "0")}-01`
    const em = month === 12 ? 1 : month + 1
    const ey = month === 12 ? year + 1 : year
    const ed = `${ey}-${String(em).padStart(2, "0")}-01`
    const [empList, slipList, weList] = await Promise.all([
      sbGet(`employees?is_active=eq.true&company_id=eq.${companyId}&select=id,login_id,name,furigana,pinyin,employment_type,payment_method,bank_name,bank_branch,bank_account_number,bank_account_holder,transport_amount`, tok),
      sbGet(`payroll_slips?year=eq.${year}&month=eq.${month}&company_id=eq.${companyId}&select=*`, tok),
      sbGet(`work_entries?work_date=gte.${sd}&work_date=lt.${ed}&business_type=not.is.null&select=employee_id,work_minutes,hourly_rate,bonus_per_hour,transport_fee`, tok),
    ])
    // 聚合 work_entries：每老师月度 = Σ(hours × hourly_rate) + Σ(hours × bonus_per_hour) + Σ(transport_fee)
    const reportedByEmp = {}
    for (const w of (weList || [])) {
      const hrs = (w.work_minutes || 0) / 60
      const amount = hrs * Number(w.hourly_rate || 0) + hrs * Number(w.bonus_per_hour || 0) + Number(w.transport_fee || 0)
      reportedByEmp[w.employee_id] = (reportedByEmp[w.employee_id] || 0) + amount
    }
    // 排序：正/契 先（A→Z），后 baito/外部（A→Z）
    const fullTime = sortByName((empList || []).filter(e => isFullTime(e.employment_type)))
    const partTime = sortByName((empList || []).filter(e => !isFullTime(e.employment_type)))
    const sortedEmps = [...fullTime, ...partTime]
    setEmps(sortedEmps)
    const byEmp = {}
    for (const s of (slipList || [])) (byEmp[s.employee_id] ||= []).push(s)
    const next = []
    for (const e of sortedEmps) {
      const mine = (byEmp[e.id] || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      if (mine.length === 0) {
        const row = emptyRow({ ...e, _default_method: e.payment_method || "日本对公" }, year, month, companyId)
        // 新行：上报金额自动填当月 work_entries 聚合（baito/外部有数据时非 0）
        const rep = Math.round(reportedByEmp[e.id] || 0)
        if (rep > 0) row.reported_amount = rep
        next.push(row)
      } else {
        mine.forEach(s => next.push({
          ...s, _key: s.id, _emp: e, _dirty: false, _delete: false,
        }))
      }
    }
    setRows(next)
    setLoading(false)
  }, [year, month, companyId])

  useEffect(() => { reload() }, [reload])

  const updateRow = (key, patch) => {
    setRows(rs => rs.map(r => r._key === key ? { ...r, ...patch, _dirty: true } : r))
  }
  const addSlice = (empId) => {
    const same = rows.filter(r => r.employee_id === empId && !r._delete)
    const maxSort = Math.max(-1, ...same.map(r => r.sort_order || 0))
    const emp = same[0]?._emp || emps.find(e => e.id === empId)
    if (!emp) return
    const row = emptyRow({ ...emp, _default_method: emp.payment_method || "日本对公" }, year, month, companyId, maxSort + 1)
    row._dirty = true
    setRows(rs => {
      let idx = -1
      for (let i = rs.length - 1; i >= 0; i--) if (rs[i].employee_id === empId) { idx = i; break }
      const next = [...rs]
      next.splice(idx + 1, 0, row)
      return next
    })
  }
  const delRow = (key) => {
    if (!confirm("确定删除这条支付片段？")) return
    setRows(rs => rs.flatMap(r => {
      if (r._key !== key) return [r]
      if (!r.id) return []
      return [{ ...r, _delete: true, _dirty: true }]
    }))
  }

  const save = async () => {
    setSaving(true)
    const tok = tkRef.current
    const toDelete = rows.filter(r => r._delete && r.id)
    const toUpsert = rows.filter(r => !r._delete && r._dirty && hasAnyData(r))
    const emptyDirty = rows.filter(r => !r._delete && r._dirty && !hasAnyData(r)).length
    try {
      if (toDelete.length === 0 && toUpsert.length === 0) {
        alert(emptyDirty > 0
          ? `没有可保存的内容。\n（${emptyDirty} 条片段还是空的，至少填一个金额才会保存）`
          : "没有改动。")
        return
      }
      for (const r of toDelete) await sbDel(`payroll_slips?id=eq.${r.id}`, tok)
      if (toUpsert.length) {
        const resp = await sbPost("payroll_slips", toUpsert.map(r => cleanForDb(r, user)), tok)
        if (!Array.isArray(resp)) {
          alert(`保存失败：${resp?.message || resp?.error || JSON.stringify(resp)}\n（可能 RLS 拒绝 —— 确认是 luna 登录）`)
          return  // 不 reload，脏状态保留，用户可以再试
        }
      }
      await reload()
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  const cancelEdit = async () => {
    if (rows.some(r => r._dirty) && !confirm("放弃所有未保存的改动？")) return
    setEditing(false)
    await reload()
  }

  // 按员工分组（过滤掉 _delete）
  const grouped = useMemo(() => {
    const map = new Map()
    for (const r of rows) {
      if (r._delete) continue
      if (!map.has(r.employee_id)) map.set(r.employee_id, [])
      map.get(r.employee_id).push(r)
    }
    return Array.from(map.values())
  }, [rows])

  const summary = useMemo(() => {
    let total = 0, fullTime = 0, partTime = 0, totalIncome = 0, totalDeduction = 0, totalTax = 0, totalAdjustment = 0
    for (const r of rows) {
      if (r._delete) continue
      const np = netPay(r)
      total += np
      totalIncome += sumIncome(r)
      totalDeduction += sumDeduction(r)
      totalTax += effTax(r)
      totalAdjustment += sumAdjustment(r)
      if (isFullTime(r._emp?.employment_type)) fullTime += np
      else partTime += np
    }
    return { total, fullTime, partTime, totalIncome, totalDeduction, totalTax, totalAdjustment }
  }, [rows])

  const exportExcel = () => {
    const company = COMPANIES.find(c => c.id === companyId)?.name || ""
    const header1 = [company, `${year}年`, `${month}月`, "", "合計金额", fmtYen(summary.total), "", "正社员給与総額", "", fmtYen(summary.fullTime), "", "非常勤給与総額", "", fmtYen(summary.partTime)]
    const header2 = [
      "社員コード", "給料王氏名", "漢字氏名", "上报金额",
      ...INCOME_FIELDS.map(f => f.l),
      "支給合計",
      ...DEDUCTION_FIELDS.map(f => f.l),
      ...ADJUSTMENT_FIELDS.map(f => f.l),
      "源泉所得税",
      "差引支給額",
      "雇用形態", "支払方法", "扣税0.1額", "口座名義", "口座情報", "備考欄",
    ]
    const data = rows.filter(r => !r._delete && hasAnyData(r)).map(r => {
      const e = r._emp || {}
      const account = r.account_override || [e.bank_name, e.bank_branch, e.bank_account_number].filter(Boolean).join(" ")
      return [
        e.login_id || "",
        e.furigana || "",
        e.name || "",
        r.reported_amount ?? "",
        ...INCOME_FIELDS.map(f => r[f.k] ?? ""),
        sumIncome(r),
        ...DEDUCTION_FIELDS.map(f => r[f.k] ?? ""),
        ...ADJUSTMENT_FIELDS.map(f => r[f.k] ?? ""),
        effTax(r),
        netPay(r),
        e.employment_type || "",
        r.payment_method || "",
        extraWithhold(r),
        e.bank_account_holder || "",
        account,
        r.note || "",
      ]
    })
    const aoa = [header1, header2, ...data]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, `${company}${String(year).slice(-2)}年${month}月`.slice(0, 31))
    XLSX.writeFile(wb, `給与明細_${company}_${year}年${month}月.xlsx`)
  }

  const dirtyCount = rows.filter(r => r._dirty).length

  // ===== styling helpers =====
  const th = { padding: "8px 6px", fontSize: 10, color: t.ts, fontWeight: 700, textAlign: "center", whiteSpace: "nowrap", background: `${t.bgS}`, position: "sticky", top: 0, zIndex: 5, borderBottom: `1px solid ${t.bd}` }
  const th2Top = 34
  const td = { padding: "5px 6px", fontSize: 11, color: t.tx, borderBottom: `1px solid ${t.bl}`, whiteSpace: "nowrap", verticalAlign: "middle" }
  const stkC = { position: "sticky", background: t.bgC, zIndex: 3, overflow: "hidden", textOverflow: "ellipsis" }
  // 固定宽度避免内容溢出，sticky left 偏移必须等于左侧列的累加宽度
  const lCol = [
    { left: 0, minWidth: 88, maxWidth: 88, width: 88 },
    { left: 88, minWidth: 90, maxWidth: 90, width: 90 },
    { left: 178, minWidth: 110, maxWidth: 110, width: 110 },
    { left: 288, minWidth: 72, maxWidth: 72, width: 72 },
  ]

  const inp = { width: "100%", minWidth: 70, padding: "5px 6px", border: `1px solid transparent`, borderRadius: 5, fontSize: 11, background: "rgba(255,255,255,0.45)", color: t.tx, outline: "none", textAlign: "right", fontFamily: "inherit", fontVariantNumeric: "tabular-nums", transition: "border-color .15s, background .15s" }
  const inpLeft = { ...inp, textAlign: "left", paddingLeft: 8 }

  const card = { background: `${t.bgC}dd`, backdropFilter: "blur(14px)", border: `1px solid ${t.bd}`, borderRadius: 14, boxShadow: "0 8px 28px -12px rgba(30,64,175,0.08)" }

  return (
    <div style={{ color: t.tx }}>
      <style>{`
        .pm-inp:focus { background:#fff !important; border-color:${t.ac} !important; box-shadow:0 0 0 2px ${t.ac}22 !important; }
        .pm-inp[readonly], .pm-inp[disabled] { cursor: default; background: transparent !important; border-color: transparent !important; }
        .pm-inp[readonly]:focus, .pm-inp[disabled]:focus { box-shadow: none !important; background: transparent !important; border-color: transparent !important; }
        .pm-row:hover { filter: brightness(1.02); }
        .pm-sec-btn:hover { filter: brightness(1.04); }
        input[type=number].pm-inp::-webkit-inner-spin-button { -webkit-appearance:none; }
      `}</style>

      {/* 顶部控制栏 */}
      <div style={{ ...card, position: "sticky", top: 0, zIndex: 30, padding: "12px 16px", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: t.tx, marginRight: 4 }}>给与明细</div>

          <div style={{ display: "flex", background: `${t.bg}80`, borderRadius: 10, padding: 3, border: `1px solid ${t.bd}` }}>
            {COMPANIES.filter(c => c.id === 1 || c.id === 2).map(c => {
              const on = companyId === c.id
              return (
                <button key={c.id} onClick={() => setCompanyId(c.id)} className="pm-sec-btn" style={{
                  padding: "5px 12px", borderRadius: 7, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer",
                  background: on ? t.ac : "transparent", color: on ? "#fff" : t.ts,
                  boxShadow: on ? `0 3px 10px ${t.ac}40` : "none", display: "flex", alignItems: "center", gap: 4, fontFamily: "inherit",
                }}><Building2 size={12} />{c.name}</button>
              )
            })}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 4, background: `${t.bg}80`, padding: "3px 6px", borderRadius: 10, border: `1px solid ${t.bd}` }}>
            <button onClick={() => shiftMonth(-1)} style={iconBtn(t)}><ChevronLeft size={14} /></button>
            <span style={{ fontSize: 13, fontWeight: 800, color: t.tx, minWidth: 80, textAlign: "center" }}>{year}年 {month}月</span>
            <button onClick={() => shiftMonth(1)} style={iconBtn(t)}><ChevronRight size={14} /></button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <StatCard t={t} icon={<Wallet size={22} color={t.ac} />} label="差引支給額 合計" value={summary.total} color={t.ac} />
          <StatCard t={t} icon={<Building2 size={22} color={t.gn} />} label="正社員 給与総額" value={summary.fullTime} color={t.gn} />
          <StatCard t={t} icon={<DollarSign size={22} color={t.wn} />} label="非常勤 給与総額" value={summary.partTime} color={t.wn} />
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={reload} disabled={loading || editing} className="pm-sec-btn" style={{ ...secBtn(t), opacity: editing ? 0.4 : 1 }} title={editing ? "编辑中无法刷新" : "从 DB 重新加载"}><RefreshCw size={13} /> 刷新</button>
          <button onClick={exportExcel} className="pm-sec-btn" style={{ ...secBtn(t), borderColor: `${t.gn}55`, color: t.gn }}><Download size={13} /> 给料王 Excel</button>
          {!editing ? (
            <button onClick={() => setEditing(true)} className="pm-sec-btn" style={priBtn(t)}><Pencil size={13} /> 编辑</button>
          ) : (
            <>
              <button onClick={cancelEdit} disabled={saving} className="pm-sec-btn" style={{ ...secBtn(t), borderColor: `${t.rd}55`, color: t.rd }}>取消</button>
              <button onClick={save} disabled={saving} className="pm-sec-btn" style={priBtn(t)}><Save size={14} /> 保存{dirtyCount > 0 ? ` (${dirtyCount})` : ""}</button>
            </>
          )}
        </div>
      </div>

      {/* 表格卡 */}
      <div style={{ ...card, overflow: "hidden" }}>
        <div style={{ overflowX: "auto", maxHeight: "calc(100vh - 220px)" }}>
          {loading ? (
            <div style={{ padding: 60, textAlign: "center", color: t.tm }}>加载中...</div>
          ) : (
            <table style={{ width: "max-content", borderCollapse: "separate", borderSpacing: 0, fontFamily: "inherit" }}>
              <thead>
                {/* 一级表头 */}
                <tr>
                  <th colSpan={4} style={{ ...th, ...stkC, left: 0, zIndex: 12, background: t.bgS, minWidth: lCol[0].minWidth + lCol[1].minWidth + lCol[2].minWidth + lCol[3].minWidth }}>社員基本情報</th>
                  <th colSpan={1} style={{ ...th, background: `${t.tm}10` }}>参照</th>
                  <th colSpan={INCOME_FIELDS.length} style={{ ...th, background: `${t.ac}15`, color: t.ac }}>支給（＋）</th>
                  <th rowSpan={2} style={{ ...th, background: `${t.ac}25`, color: t.ac, minWidth: 92 }}>支給合計</th>
                  <th colSpan={DEDUCTION_FIELDS.length} style={{ ...th, background: `${t.rd}12`, color: t.rd }}>控除（－）</th>
                  <th colSpan={ADJUSTMENT_FIELDS.length} style={{ ...th, background: `${t.wn}12`, color: t.wn }}>調整（±）</th>
                  <th rowSpan={2} style={{ ...th, background: `${t.rd}22`, color: t.rd, minWidth: 100 }}>源泉所得税</th>
                  <th rowSpan={2} style={{ ...th, background: `${t.bgS}`, color: t.tx, fontSize: 12, minWidth: 106 }}>差引支給額</th>
                  <th colSpan={2} style={{ ...th, background: `${t.bg}` }}>支払設定</th>
                  <th rowSpan={2} style={{ ...th, minWidth: 150 }}>口座情報</th>
                  <th rowSpan={2} style={{ ...th, minWidth: 140 }}>備考</th>
                  <th rowSpan={2} style={{ ...th, minWidth: 80 }}>操作</th>
                </tr>
                {/* 二级表头 */}
                <tr>
                  <th style={{ ...th, ...stkC, ...lCol[0], top: th2Top, zIndex: 12 }}>Code</th>
                  <th style={{ ...th, ...stkC, ...lCol[1], top: th2Top, zIndex: 12 }}>氏名</th>
                  <th style={{ ...th, ...stkC, ...lCol[2], top: th2Top, zIndex: 12 }}>カナ</th>
                  <th style={{ ...th, ...stkC, ...lCol[3], top: th2Top, zIndex: 12, borderRight: `2px solid ${t.bd}` }}>形態</th>

                  <th style={{ ...th, top: th2Top, background: `${t.tm}10`, fontWeight: 500, minWidth: 88 }}>上报金额</th>
                  {INCOME_FIELDS.map(f => <th key={f.k} style={{ ...th, top: th2Top, background: `${t.ac}10`, fontWeight: 500, minWidth: 88 }}>{f.l}</th>)}
                  {DEDUCTION_FIELDS.map(f => <th key={f.k} style={{ ...th, top: th2Top, background: `${t.rd}0a`, fontWeight: 500, minWidth: 84 }}>{f.l}</th>)}
                  {ADJUSTMENT_FIELDS.map(f => <th key={f.k} style={{ ...th, top: th2Top, background: `${t.wn}0c`, fontWeight: 500, minWidth: 84 }}>{f.l}</th>)}

                  <th style={{ ...th, top: th2Top, background: `${t.bg}`, minWidth: 100 }}>方法</th>
                  <th style={{ ...th, top: th2Top, background: `${t.bg}`, minWidth: 80 }}>扣税0.1</th>
                </tr>
              </thead>
              <tbody>
                {grouped.map((empFrags) => {
                  const emp = empFrags[0]._emp || {}
                  const rowBg = empTypeBg(emp.employment_type, t)
                  const rowspan = empFrags.length
                  return empFrags.map((r, idx) => {
                    const first = idx === 0
                    const taxOverride = hasTaxOverride(r)
                    return (
                      <tr key={r._key} className="pm-row" style={{ background: rowBg, transition: "background .15s" }}>
                        {first && (
                          <>
                            <td rowSpan={rowspan} style={{ ...td, ...stkC, ...lCol[0], textAlign: "center", color: t.tm, fontSize: 10, background: t.bgC }}>{emp.login_id}</td>
                            <td rowSpan={rowspan} style={{ ...td, ...stkC, ...lCol[1], fontWeight: 700, background: t.bgC }}>{emp.name}</td>
                            <td rowSpan={rowspan} style={{ ...td, ...stkC, ...lCol[2], fontSize: 10, color: t.tm, background: t.bgC }}>{emp.furigana}</td>
                            <td rowSpan={rowspan} style={{ ...td, ...stkC, ...lCol[3], borderRight: `2px solid ${t.bd}`, textAlign: "center", background: t.bgC }}>
                              <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: `${t.bgC}`, fontWeight: 700, color: t.ts, border: `1px solid ${t.bl}` }}>{empLabel(emp.employment_type)}</span>
                            </td>
                          </>
                        )}
                        <td style={{ ...td, background: `${t.tm}08` }}>
                          <NumCell r={r} k="reported_amount" onCh={updateRow} style={inp} readOnly={!editing} />
                        </td>
                        {INCOME_FIELDS.map(f => (
                          <td key={f.k} style={td}><NumCell r={r} k={f.k} onCh={updateRow} style={inp} readOnly={!editing} /></td>
                        ))}
                        <td style={{ ...td, background: `${t.ac}15`, textAlign: "right", fontWeight: 800, color: t.ac, fontVariantNumeric: "tabular-nums" }}>{fmtYen(sumIncome(r))}</td>

                        {DEDUCTION_FIELDS.map(f => (
                          <td key={f.k} style={td}><NumCell r={r} k={f.k} onCh={updateRow} style={inp} readOnly={!editing} /></td>
                        ))}
                        {ADJUSTMENT_FIELDS.map(f => (
                          <td key={f.k} style={{ ...td, background: `${t.wn}06` }}><NumCell r={r} k={f.k} onCh={updateRow} style={inp} readOnly={!editing} /></td>
                        ))}

                        <td style={{ ...td, background: `${t.rd}10`, position: "relative" }}>
                          <input
                            type="number"
                            className="pm-inp"
                            value={r.withholding_tax ?? (autoTax(r) || "")}
                            onChange={(e) => updateRow(r._key, { withholding_tax: e.target.value === "" ? null : parseFloat(e.target.value) })}
                            placeholder=""
                            readOnly={!editing}
                            style={{ ...inp, color: taxOverride ? t.wn : t.rd, fontWeight: 700, background: taxOverride ? `${t.wn}12` : "rgba(255,255,255,0.5)" }}
                            title={
                              taxOverride ? "已手动覆盖（清空可恢复自动）" :
                              isFullTime(r._emp?.employment_type) ? "正社員/契約 等社労士给数字，手填覆盖" :
                              `R8税額表 甲欄 0人 自动: (支給合計 ${sumIncome(r)} − 社保 ${sumDeduction(r)}) → ${autoTax(r)}`
                            }
                          />
                          {taxOverride && <Calculator size={10} color={t.wn} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)" }} />}
                        </td>
                        <td style={{ ...td, background: `${t.bgS}`, textAlign: "right", fontWeight: 800, fontSize: 13, color: netPay(r) < 0 ? t.rd : t.tx, fontVariantNumeric: "tabular-nums" }} title={`差引 = 支給合計(${sumIncome(r)}) − 控除(${sumDeduction(r)}) − 源泉(${effTax(r)}) + 調整(${sumAdjustment(r)}) − 扣税0.1(${extraWithhold(r)}) = ${netPay(r)}`}>{fmtYen(netPay(r))}</td>

                        <td style={td}>
                          <select value={r.payment_method || ""} onChange={(e) => updateRow(r._key, { payment_method: e.target.value })} disabled={!editing} className="pm-inp" style={inpLeft}>
                            {PAY_METHODS.map(m => <option key={m}>{m}</option>)}
                          </select>
                        </td>
                        <td style={td} title={num(r.withhold_rate) > 0 ? `扣 ${extraWithhold(r)} 円（支給合計 × 0.1，从差引扣除）` : "无附加扣税"}>
                          <select value={r.withhold_rate ?? 0} onChange={(e) => updateRow(r._key, { withhold_rate: parseFloat(e.target.value) })} disabled={!editing} className="pm-inp" style={inpLeft}>
                            {TAX_MODES.map(rt => <option key={rt.value} value={rt.value}>{rt.label}</option>)}
                          </select>
                        </td>

                        <td style={td}>
                          <input value={r.account_override || ""} onChange={(e) => updateRow(r._key, { account_override: e.target.value })} readOnly={!editing} className="pm-inp" style={{ ...inpLeft, minWidth: 140 }} />
                        </td>
                        <td style={td}>
                          <input value={r.note || ""} onChange={(e) => updateRow(r._key, { note: e.target.value })} readOnly={!editing} className="pm-inp" style={{ ...inpLeft, minWidth: 120 }} />
                        </td>
                        <td style={{ ...td, textAlign: "center" }}>
                          {editing && (
                            <div style={{ display: "flex", gap: 4, justifyContent: "center", alignItems: "center" }}>
                              {first && (
                                <button onClick={() => addSlice(r.employee_id)} title="在此员工下追加一条支付片段（用于同月拆分成多笔）" style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "3px 8px", borderRadius: 6, background: `${t.ac}15`, color: t.ac, border: `1px solid ${t.ac}40`, cursor: "pointer", fontSize: 10, fontWeight: 700, fontFamily: "inherit" }}><Plus size={11} /> 片段</button>
                              )}
                              {(r.id || r._dirty || empFrags.length > 1) && (
                                <button onClick={() => delRow(r._key)} title="删除这条片段" style={{ ...iconBtn(t), background: `${t.rd}12`, color: t.rd, borderColor: `${t.rd}40` }}><Trash2 size={12} /></button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })
                })}
                {/* 総合計行 */}
                <tr>
                  <td colSpan={4} style={{ ...td, ...stkC, left: 0, borderRight: `2px solid ${t.bd}`, textAlign: "right", fontWeight: 800, paddingRight: 14, background: t.bgS }}>総合計</td>
                  <td style={{ ...td, background: t.bgS }}></td>
                  <td colSpan={INCOME_FIELDS.length} style={{ ...td, background: t.bgS }}></td>
                  <td style={{ ...td, background: `${t.ac}25`, textAlign: "right", fontWeight: 800, color: t.ac }}>{fmtYen(summary.totalIncome)}</td>
                  <td colSpan={DEDUCTION_FIELDS.length} style={{ ...td, background: t.bgS }}></td>
                  <td colSpan={ADJUSTMENT_FIELDS.length} style={{ ...td, background: `${t.wn}15`, textAlign: "right", fontWeight: 800, color: t.wn }}>{fmtYen(summary.totalAdjustment)}</td>
                  <td style={{ ...td, background: `${t.rd}22`, textAlign: "right", fontWeight: 800, color: t.rd }}>{fmtYen(summary.totalTax)}</td>
                  <td style={{ ...td, background: t.bgS, textAlign: "right", fontWeight: 900, fontSize: 14 }}>{fmtYen(summary.total)}</td>
                  <td colSpan={2} style={{ ...td, background: t.bgS }}></td>
                  <td colSpan={3} style={{ ...td, background: t.bgS }}></td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

function NumCell({ r, k, onCh, style, readOnly }) {
  return (
    <input
      type="number"
      className="pm-inp"
      value={r[k] ?? ""}
      onChange={(e) => onCh(r._key, { [k]: e.target.value === "" ? null : parseFloat(e.target.value) })}
      placeholder={readOnly ? "" : "0"}
      readOnly={readOnly}
      style={style}
    />
  )
}

function StatCard({ t, icon, label, value, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", background: `${t.bgC}cc`, borderRadius: 12, border: `1px solid ${t.bd}`, boxShadow: "0 4px 15px -5px rgba(0,0,0,0.05)" }}>
      <div style={{ padding: 8, background: t.bgC, borderRadius: 8, boxShadow: `0 2px 10px ${color}33`, display: "flex" }}>{icon}</div>
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: t.ts, marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: t.tx, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{fmtYen(value)}</div>
      </div>
    </div>
  )
}

const iconBtn = (t) => ({ width: 26, height: 26, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 6, border: `1px solid ${t.bd}`, background: t.bgC, color: t.tx, cursor: "pointer", padding: 0, fontFamily: "inherit" })
const secBtn = (t) => ({ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 9, border: `1px solid ${t.bd}`, background: `${t.bgC}`, color: t.tx, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" })
const priBtn = (t) => ({ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 18px", borderRadius: 9, border: "none", background: t.ac, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", boxShadow: `0 4px 15px ${t.ac}44` })

function empTypeBg(et, t) {
  if (et === "正社員" || et === "正社员") return `${t.ac}0f`
  if (et === "契約社員") return `${t.gn}0f`
  if (et === "外部講師") return `${t.rd}0c`
  return "transparent"
}
function blendBg(rowBg, base) {
  if (!rowBg || rowBg === "transparent") return base
  return rowBg
}
