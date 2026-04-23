import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { sbGet, sbPost, sbPatch, sbDel, sbFn } from "../../api/supabase"
import { ChevronLeft, ChevronRight, Plus, Trash2, Save, Upload, Download, ArrowLeft, Search, X as XIcon, AlertTriangle, Check, Send, CheckCircle2, AlertCircle, CalendarCheck2, Camera } from "lucide-react"
import { pad, WEEKDAYS, sortByName, COMPANIES, EJU_TYPE, EJU_BONUS_PER_HOUR } from "../../config/constants"
import { parsePayrollExcel, applyBizMapping, SUPPORTED_BIZ } from "../../utils/parsePayrollExcel"
import { compressImage } from "../../utils/compressImage"

// 业务内容 master（从 Excel 模板提炼）— 映射到 DB business_type
const BIZ_TYPES = ["事務性工作", "専業課老師", "答疑做題", "研究計画書修改", "過去問", "EJU講師（班課）"]

const glassCard = {
  background: "rgba(255, 255, 255, 0.65)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  borderRadius: 24,
  border: "1px solid rgba(255, 255, 255, 0.9)",
  boxShadow: "0 20px 50px -20px rgba(30, 64, 175, 0.05)",
}

const mkRow = (emp_id, date = "") => ({
  _key: Math.random().toString(36).slice(2), _isNew: true, _dirty: false,
  employee_id: emp_id, work_date: date, business_type: "",
  start_time: "", end_time: "", work_minutes: 0,
  hourly_rate: 0, bonus_per_hour: 0, transport_fee: "",
  student_name: "", course_name: "", eju_bonus: false,
})

const timeToMin = (s) => {
  if (!s) return 0
  const [h, m] = s.split(":").map(Number)
  return (h || 0) * 60 + (m || 0)
}
const calcMin = (st, et) => {
  if (!st || !et) return 0
  let d = timeToMin(et) - timeToMin(st)
  if (d < 0) d += 24 * 60 // 跨夜
  return d
}
const fmtHours = (min) => (min / 60).toFixed(2)
const yen = (n) => `¥${Math.round(n).toLocaleString()}`

export default function UploadTable({ user, t, tk }) {
  const isAdmin = user.role === "admin"
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [selectedEmp, setSelectedEmp] = useState(isAdmin ? null : { id: user.id, name: user.name, department: user.department })
  const [allEmps, setAllEmps] = useState([])
  const [empSearch, setEmpSearch] = useState("")
  const [rows, setRows] = useState([])
  const [rates, setRates] = useState([])
  const [ld, setLd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [submittingReport, setSubmittingReport] = useState(false)
  const [submission, setSubmission] = useState(null)
  const [photoUploading, setPhotoUploading] = useState({ 1: false, 2: false })
  const [photoError, setPhotoError] = useState("")
  const [lightboxPhoto, setLightboxPhoto] = useState(null) // { slot, driveId }
  const [msg, setMsg] = useState("")

  // 上传状态
  const [uploadState, setUploadState] = useState(null) // null | 'mapping' | 'preview' | 'submitting'
  const [uploadData, setUploadData] = useState(null) // { rows, unmappedBizTypes, hasBonus, fileName }
  const [bizMapping, setBizMapping] = useState({}) // { "事务/TA": "事務性工作" }
  const [uploadMode, setUploadMode] = useState("append") // 'append' | 'replace'

  // admin 汇总表：按员工 × 工种聚合当月数据
  const [adminAgg, setAdminAgg] = useState(null) // { [emp_id]: { [biz]: { minutes, amount }, transport, bonus_amount, total_amount, submitted } }
  const [adminLd, setAdminLd] = useState(false)
  const [companyFilter, setCompanyFilter] = useState("all")

  // 学部老师才显示班课绩效列
  // 绩效列显示条件：pay_rates 里有 EJU（admin 已开通该工种）/ 学部老师 / 或已经有 EJU 行
  const showBonus = rates.some(r => r.business_type === EJU_TYPE)
    || (selectedEmp?.department || "") === "学部"
    || rows.some(r => r.business_type === EJU_TYPE)

  // admin 加载员工列表
  useEffect(() => {
    if (!isAdmin) return
    (async () => {
      const d = await sbGet("employees?is_active=eq.true&employment_type=in.(アルバイト,外部講師)&select=id,name,furigana,pinyin,department,company_id", tk)
      setAllEmps(sortByName(d))
    })()
  }, [isAdmin, tk])

  // admin 汇总：进到 admin 入口（没选老师时）加载全员当月 work_entries 聚合
  const loadAdminAgg = useCallback(async () => {
    if (!isAdmin || selectedEmp) return
    setAdminLd(true)
    const sd = `${year}-${pad(month)}-01`
    const ed = month === 12 ? `${year + 1}-01-01` : `${year}-${pad(month + 1)}-01`
    const [entries, subs] = await Promise.all([
      sbGet(`work_entries?work_date=gte.${sd}&work_date=lt.${ed}&business_type=not.is.null&select=employee_id,business_type,work_minutes,hourly_rate,bonus_per_hour,transport_fee`, tk),
      sbGet(`monthly_report_submissions?status=eq.submitted&year=eq.${year}&month=eq.${month}&select=employee_id`, tk),
    ])
    const submittedIds = new Set((subs || []).map(s => s.employee_id))
    const agg = {}
    for (const r of entries || []) {
      const eid = r.employee_id
      if (!agg[eid]) agg[eid] = { byType: {}, transport: 0, bonus_amount: 0, submitted: submittedIds.has(eid) }
      const bt = r.business_type
      if (!agg[eid].byType[bt]) agg[eid].byType[bt] = { minutes: 0, amount: 0 }
      const hrs = (r.work_minutes || 0) / 60
      agg[eid].byType[bt].minutes += r.work_minutes || 0
      agg[eid].byType[bt].amount += Math.round(hrs * Number(r.hourly_rate || 0))
      agg[eid].bonus_amount += Math.round(hrs * Number(r.bonus_per_hour || 0))
      agg[eid].transport += Number(r.transport_fee || 0)
    }
    // 没数据的员工也标记一下 submitted 状态
    for (const id of submittedIds) {
      if (!agg[id]) agg[id] = { byType: {}, transport: 0, bonus_amount: 0, submitted: true }
    }
    setAdminAgg(agg)
    setAdminLd(false)
  }, [isAdmin, selectedEmp, year, month, tk])

  useEffect(() => { loadAdminAgg() }, [loadAdminAgg])

  const load = useCallback(async () => {
    if (!selectedEmp) return
    setLd(true)
    const sd = `${year}-${pad(month)}-01`
    const ed = month === 12 ? `${year + 1}-01-01` : `${year}-${pad(month + 1)}-01`
    const [entries, payRates, subs] = await Promise.all([
      sbGet(`work_entries?employee_id=eq.${selectedEmp.id}&work_date=gte.${sd}&work_date=lt.${ed}&order=work_date,start_time&select=*`, tk),
      sbGet(`pay_rates?employee_id=eq.${selectedEmp.id}&order=business_type&select=business_type,hourly_rate`, tk),
      sbGet(`monthly_report_submissions?employee_id=eq.${selectedEmp.id}&year=eq.${year}&month=eq.${month}&select=*`, tk),
    ])
    setSubmission((subs && subs[0]) || null)
    const loaded = (entries || [])
      .filter(e => e.business_type) // 过滤掉纯"其他报销"行
      .map(e => {
        const start_time = e.start_time?.slice(0, 5) || ""
        const end_time = e.end_time?.slice(0, 5) || ""
        // 自愈：旧记录跨夜被存成 work_minutes=0，如果 start/end 都在就当场重算
        let work_minutes = e.work_minutes
        if (start_time && end_time && (!work_minutes || work_minutes === 0)) {
          work_minutes = calcMin(start_time, end_time)
        }
        // EJU 绩效：优先取 DB 的 eju_bonus 布尔；若无则看旧数据 bonus_per_hour > 0 且业务是 EJU 的兜底
        const eju_bonus = !!e.eju_bonus || (Number(e.bonus_per_hour || 0) > 0 && e.business_type === EJU_TYPE)
        return {
          ...e, work_minutes, _key: e.id, _isNew: false, _dirty: false,
          start_time, end_time,
          transport_fee: e.transport_fee != null ? String(e.transport_fee) : "",
          eju_bonus,
        }
      })
    setRows(loaded)
    setRates(payRates || [])
    setLd(false)
  }, [selectedEmp, year, month, tk])

  useEffect(() => { load() }, [load])

  // ======= 本地草稿：未保存的行自动 dump 到 localStorage =======
  const draftKey = selectedEmp ? `kintai_draft_upload_${selectedEmp.id}_${year}_${month}` : null
  const draftAskedRef = useRef(new Set())

  useEffect(() => {
    if (!draftKey) return
    const dirtyCount = rows.filter(r => r._isNew || r._dirty).length
    if (dirtyCount > 0) {
      try { localStorage.setItem(draftKey, JSON.stringify({ rows, savedAt: Date.now() })) } catch {/* ignore */}
    } else {
      localStorage.removeItem(draftKey)
    }
  }, [rows, draftKey])

  useEffect(() => {
    if (ld || !draftKey || draftAskedRef.current.has(draftKey)) return
    draftAskedRef.current.add(draftKey)
    const raw = localStorage.getItem(draftKey)
    if (!raw) return
    try {
      const d = JSON.parse(raw)
      const dirty = (d.rows || []).filter(r => r._isNew || r._dirty).length
      if (!dirty) { localStorage.removeItem(draftKey); return }
      const ageMin = Math.max(1, Math.round((Date.now() - (d.savedAt || 0)) / 60000))
      if (confirm(`检测到 ${ageMin} 分钟前的未保存草稿（${dirty} 行修改），是否恢复？\n\n确定 = 恢复并继续编辑\n取消 = 丢弃草稿`)) {
        setRows(d.rows || [])
        setMsg(`已恢复未保存的 ${dirty} 行修改`)
        setTimeout(() => setMsg(""), 6000)
      } else {
        localStorage.removeItem(draftKey)
      }
    } catch {
      localStorage.removeItem(draftKey)
    }
  }, [ld, draftKey])

  const getRateFor = (bizType) => rates.find(r => r.business_type === bizType)?.hourly_rate || 0

  const updateRow = (key, field, value) => {
    setRows(prev => prev.map(r => {
      if (r._key !== key) return r
      const next = { ...r, [field]: value, _dirty: true }
      if (field === "business_type") {
        next.hourly_rate = getRateFor(value)
        if (value !== EJU_TYPE) next.eju_bonus = false // 切换到非 EJU 业务，自动撤销绩效申报
      }
      const st = field === "start_time" ? value : next.start_time
      const et = field === "end_time" ? value : next.end_time
      if (st && et) next.work_minutes = calcMin(st, et)
      return next
    }))
  }

  const removeRow = async (r) => {
    if (!confirm(`删除 ${r.work_date || "这一行"}？`)) return
    if (r._isNew) setRows(prev => prev.filter(x => x._key !== r._key))
    else {
      await sbDel(`work_entries?id=eq.${r.id}`, tk)
      setRows(prev => prev.filter(x => x._key !== r._key))
    }
  }

  const addRow = () => {
    const defaultDate = `${year}-${pad(month)}-${pad(Math.min(now.getDate(), 28))}`
    setRows(prev => [...prev, mkRow(selectedEmp.id, defaultDate)])
  }

  const ejuBonusPerHour = (r) => (r.eju_bonus && r.business_type === EJU_TYPE) ? EJU_BONUS_PER_HOUR : 0

  const rowSubtotal = (r) => {
    const hours = (r.work_minutes || 0) / 60
    const base = hours * Number(r.hourly_rate || 0)
    const bonus = hours * ejuBonusPerHour(r)
    const trans = parseFloat(r.transport_fee) || 0
    return Math.round(base + bonus + trans)
  }

  const totals = useMemo(() => {
    let totalMin = 0, wageSum = 0, bonusSum = 0, transSum = 0
    for (const r of rows) {
      const hours = (r.work_minutes || 0) / 60
      totalMin += r.work_minutes || 0
      wageSum += hours * Number(r.hourly_rate || 0)
      bonusSum += hours * ejuBonusPerHour(r)
      transSum += parseFloat(r.transport_fee) || 0
    }
    return {
      totalHours: totalMin / 60,
      wageSum: Math.round(wageSum),
      bonusSum: Math.round(bonusSum),
      transSum: Math.round(transSum),
      grand: Math.round(wageSum + bonusSum + transSum),
    }
  }, [rows])

  const save = async () => {
    const valid = rows.filter(r => r.work_date && r.business_type && r.start_time && r.end_time && r.work_minutes > 0)
    setSaving(true); setMsg("")
    let ok = 0, err = 0
    for (const r of valid) {
      const body = {
        employee_id: selectedEmp.id,
        work_date: r.work_date,
        business_type: r.business_type,
        start_time: r.start_time + ":00",
        end_time: r.end_time + ":00",
        work_minutes: r.work_minutes || 0,
        hourly_rate: r.hourly_rate || 0,
        eju_bonus: !!r.eju_bonus && r.business_type === EJU_TYPE,
        bonus_per_hour: ejuBonusPerHour(r),
        transport_fee: parseFloat(r.transport_fee) || 0,
        subtotal: rowSubtotal(r),
        student_name: r.student_name || null,
        course_name: r.course_name || null,
      }
      let res
      if (r._isNew) res = await sbPost("work_entries", body, tk)
      else if (r._dirty) res = await sbPatch(`work_entries?id=eq.${r.id}`, body, tk)
      else continue
      if (res && !Array.isArray(res) && (res.code || res.message)) err++
      else ok++
    }
    setSaving(false)
    setMsg(err ? `保存：成功 ${ok}，失败 ${err}` : `已保存 ${ok} 行`)
    setTimeout(() => setMsg(""), 5000)
    await load()
  }

  // ========== 提交月报 ==========
  const isSubmitted = submission?.status === "submitted"
  const hasChanges = rows.some(r => r._isNew || r._dirty)

  // 最近 7 天滑动窗口：在本月内找最大的 7 日累计工时。>=28 红线，20 黄色预警
  const worst7d = useMemo(() => {
    const byDate = {}
    for (const r of rows) {
      if (!r.work_date || !r.work_minutes) continue
      byDate[r.work_date] = (byDate[r.work_date] || 0) + r.work_minutes
    }
    const dates = Object.keys(byDate).sort()
    if (!dates.length) return { hours: 0, windowEnd: null }
    let maxMin = 0, windowEnd = null
    for (const endDate of dates) {
      const endD = new Date(endDate + "T00:00:00")
      const startD = new Date(endD); startD.setDate(endD.getDate() - 6)
      let sum = 0
      for (const d of dates) {
        const dd = new Date(d + "T00:00:00")
        if (dd >= startD && dd <= endD) sum += byDate[d]
      }
      if (sum > maxMin) { maxMin = sum; windowEnd = endDate }
    }
    return { hours: maxMin / 60, windowEnd }
  }, [rows])

  const hoursStatus = useMemo(() => {
    const h = worst7d.hours
    if (h >= 28) return { color: t.rd, bg: `${t.rd}0D`, level: "over", text: "已超 28h 红线，请删减或改日" }
    if (h >= 25) return { color: t.rd, bg: `${t.rd}0D`, level: "red", text: "濒临 28h 红线，慎重增加排班" }
    if (h >= 20) return { color: t.wn, bg: `${t.wn}0D`, level: "amber", text: "工时偏高，留意后续排班空间" }
    return { color: t.gn, bg: `${t.gn}0D`, level: "ok", text: "合规范围内" }
  }, [worst7d.hours, t])
  const hoursIcon = hoursStatus.level === "ok" ? <CheckCircle2 size={14} color={t.gn} /> : <AlertCircle size={14} color={hoursStatus.color} />

  // 月末提交提醒
  const submitStatus = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const endOfMonth = new Date(year, month, 0)
    endOfMonth.setHours(23, 59, 59, 999)
    const MS = 86400000
    const daysLeft = Math.ceil((endOfMonth.getTime() - today.getTime()) / MS)
    if (isSubmitted) {
      return { color: t.gn, bg: `${t.gn}0D`, level: "ok", icon: <CheckCircle2 size={14} color={t.gn} />, big: "已提交", unit: "", text: `于 ${submission?.submitted_at ? new Date(submission.submitted_at).toLocaleDateString() : "—"} 提交` }
    }
    if (daysLeft < 0) {
      return { color: t.rd, bg: `${t.rd}0D`, level: "over", icon: <AlertCircle size={14} color={t.rd} />, big: `逾期 ${-daysLeft}`, unit: "天", text: `${year}年${month}月 已结束未提交，请尽快` }
    }
    if (daysLeft === 0) {
      return { color: t.rd, bg: `${t.rd}0D`, level: "red", icon: <AlertCircle size={14} color={t.rd} />, big: "今天", unit: "截止", text: `请确认无误后立即提交` }
    }
    if (daysLeft <= 3) {
      return { color: t.rd, bg: `${t.rd}0D`, level: "red", icon: <AlertCircle size={14} color={t.rd} />, big: daysLeft, unit: "天", text: `只剩 ${daysLeft} 天，请尽快提交` }
    }
    if (daysLeft <= 7) {
      return { color: t.wn, bg: `${t.wn}0D`, level: "amber", icon: <CalendarCheck2 size={14} color={t.wn} />, big: daysLeft, unit: "天", text: `月末还有 ${daysLeft} 天，记得提交月报` }
    }
    return { color: t.tx, bg: "rgba(255,255,255,0.65)", level: "ok", icon: <CalendarCheck2 size={14} color={t.ac} />, big: daysLeft, unit: "天", text: `月末还有 ${daysLeft} 天，工时整理好后记得提交` }
  }, [year, month, isSubmitted, submission, t])

  const submitReport = async () => {
    if (isAdmin) return
    if (hasChanges) { setMsg("请先点「保存全部」把未保存的修改存下来再提交"); setTimeout(() => setMsg(""), 6000); return }
    if (rows.length === 0) { setMsg("本月还没有任何工时记录，无法提交"); setTimeout(() => setMsg(""), 6000); return }
    if (!confirm(`提交 ${year}年${month}月 工时报表？\n\n提交后将不能再修改，如需更改请联系管理员解锁。`)) return
    setSubmittingReport(true)
    const payload = { employee_id: selectedEmp.id, year, month, status: "submitted", submitted_at: new Date().toISOString(), unlocked_by: null, unlocked_at: null }
    let res
    if (submission) {
      res = await sbPatch(`monthly_report_submissions?id=eq.${submission.id}`, { status: "submitted", submitted_at: payload.submitted_at, unlocked_by: null, unlocked_at: null }, tk)
    } else {
      res = await sbPost("monthly_report_submissions", payload, tk)
    }
    setSubmittingReport(false)
    if (res && !Array.isArray(res) && (res.code || res.message)) {
      setMsg(`提交失败：${res.message || res.code}`)
      setTimeout(() => setMsg(""), 10000)
      return
    }
    setMsg(`已提交 ${year}年${month}月 工时报表`)
    setTimeout(() => setMsg(""), 6000)
    await load()
  }

  // ========== 打卡照片（和工资报表读写同一张 monthly_report_submissions，数据互通） ==========
  const uploadClockPhoto = async (slot, file) => {
    if (!file || !selectedEmp) return
    setPhotoError("")
    setPhotoUploading(p => ({ ...p, [slot]: true }))
    try {
      const blob = await compressImage(file, 500, 1600)
      const ym = `${year}-${pad(month)}`
      const ts = Date.now()
      const safeName = (selectedEmp?.name || user.name || "emp").replace(/[\\/:*?"<>|]/g, "_")
      const filename = `${safeName}_${ym}_${slot}_${ts}.jpg`
      const fd = new FormData()
      fd.append("file", blob, filename)
      fd.append("filename", filename)
      const res = await sbFn("upload-clock-photo", fd)
      if (!res?.id) {
        const parts = [res?.error || "未知错误"]
        if (res?.status) parts.push(`HTTP ${res.status}`)
        setPhotoError(`照片 ${slot} 上传失败：${parts.join(" | ")}`)
        return
      }
      const col = slot === 1 ? "photo_1_drive_id" : "photo_2_drive_id"
      if (submission) {
        await sbPatch(`monthly_report_submissions?id=eq.${submission.id}`, { [col]: res.id }, tk)
      } else {
        await sbPost("monthly_report_submissions", { employee_id: selectedEmp.id, year, month, status: "draft", [col]: res.id }, tk)
      }
      await load()
    } catch (e) {
      setPhotoError(`照片 ${slot} 上传失败：${e.message || String(e)}`)
    } finally {
      setPhotoUploading(p => ({ ...p, [slot]: false }))
    }
  }

  // ========== Excel 上传 ==========
  const handleFilePick = async (file) => {
    if (!file) return
    setMsg("")
    try {
      const result = await parsePayrollExcel(file)
      if (!result.rows.length) {
        alert("文件里没有解析到有效的工时记录行")
        return
      }
      setUploadData({ ...result, fileName: file.name })
      // 如果有未识别的业务名，先进映射步骤；否则直接进预览
      const initMapping = {}
      result.unmappedBizTypes.forEach(raw => { initMapping[raw] = "" })
      setBizMapping(initMapping)
      setUploadState(result.unmappedBizTypes.length ? "mapping" : "preview")
    } catch (e) {
      alert(`解析失败：${e.message}`)
    }
  }

  const confirmMapping = () => {
    const unresolved = uploadData.unmappedBizTypes.filter(raw => !bizMapping[raw])
    if (unresolved.length) {
      alert(`还有 ${unresolved.length} 个业务名没选：${unresolved.join("、")}`)
      return
    }
    setUploadData(d => ({ ...d, rows: applyBizMapping(d.rows, bizMapping) }))
    setUploadState("preview")
  }

  const submitUpload = async () => {
    if (!uploadData?.rows.length) return
    const monthRows = uploadData.rows.filter(r => r.work_date.startsWith(`${year}-${pad(month)}`))
    if (monthRows.length === 0) {
      if (!confirm(`文件里没有 ${year}年${month}月 的记录，确定继续吗？（会按记录原日期插入）`)) return
    }
    setUploadState("submitting")
    try {
      if (uploadMode === "replace") {
        const sd = `${year}-${pad(month)}-01`
        const ed = month === 12 ? `${year + 1}-01-01` : `${year}-${pad(month + 1)}-01`
        await sbDel(`work_entries?employee_id=eq.${selectedEmp.id}&work_date=gte.${sd}&work_date=lt.${ed}&business_type=not.is.null`, tk)
      }
      let ok = 0, err = 0
      for (const r of uploadData.rows) {
        // Excel 班课绩效列只对 EJU 业务有效；其他业务即使 Excel 填了也忽略（教师自申报，仅 EJU 班課 可用）
        const isEju = r.business_type === EJU_TYPE
        const ejuBonus = isEju && Number(r.bonus_per_hour || 0) > 0
        const bonusPerHour = ejuBonus ? EJU_BONUS_PER_HOUR : 0
        const hours = (r.work_minutes || 0) / 60
        const subtotal = Math.round(hours * (r.hourly_rate + bonusPerHour) + (r.transport_fee || 0))
        const body = {
          employee_id: selectedEmp.id,
          work_date: r.work_date,
          business_type: r.business_type,
          start_time: r.start_time ? r.start_time + ":00" : null,
          end_time: r.end_time ? r.end_time + ":00" : null,
          work_minutes: r.work_minutes,
          hourly_rate: r.hourly_rate,
          eju_bonus: ejuBonus,
          bonus_per_hour: bonusPerHour,
          transport_fee: r.transport_fee,
          subtotal,
          student_name: r.student_name || null,
          course_name: r.course_name || null,
        }
        const res = await sbPost("work_entries", body, tk)
        if (res && !Array.isArray(res) && (res.code || res.message)) err++
        else ok++
      }
      setUploadState(null)
      setUploadData(null)
      setBizMapping({})
      setUploadMode("append")
      setMsg(err ? `上传完成：成功 ${ok} 行，失败 ${err} 行` : `上传成功：${ok} 行`)
      setTimeout(() => setMsg(""), 6000)
      await load()
    } catch (e) {
      setUploadState("preview")
      alert(`上传出错：${e.message || e}`)
    }
  }

  const chgMonth = (d) => {
    let m = month + d, y = year
    if (m > 12) { m = 1; y++ } else if (m < 1) { m = 12; y-- }
    setYear(y); setMonth(m)
  }

  // ========== Admin 汇总大表视图 ==========
  if (isAdmin && !selectedEmp) {
    const filtered = allEmps.filter(e => {
      if (companyFilter !== "all" && e.company_id !== companyFilter) return false
      if (!empSearch) return true
      const q = empSearch.toLowerCase()
      return (e.name || "").toLowerCase().includes(q) || (e.furigana || "").toLowerCase().includes(q) || (e.pinyin || "").toLowerCase().includes(q)
    })

    // 行数据
    const rowsData = filtered.map(emp => {
      const a = adminAgg?.[emp.id]
      const byType = a?.byType || {}
      const transport = a?.transport || 0
      const bonus = a?.bonus_amount || 0
      const wageSum = BIZ_TYPES.reduce((s, bt) => s + (byType[bt]?.amount || 0), 0)
      const total = wageSum + bonus + transport
      const totalMin = BIZ_TYPES.reduce((s, bt) => s + (byType[bt]?.minutes || 0), 0)
      return { emp, byType, transport, bonus, wageSum, total, totalMin, submitted: a?.submitted || false }
    })

    // 导出 CSV（給料王风格扁平表）
    const exportCSV = () => {
      const cols = ["姓名", "公司", "部门", "状态"]
      for (const bt of BIZ_TYPES) { cols.push(`${bt}_时数`); cols.push(`${bt}_金额`) }
      cols.push("班课绩效", "交通费", "合计")
      const rows = [cols]
      for (const r of rowsData) {
        const row = [
          r.emp.name,
          COMPANIES.find(c => c.id === r.emp.company_id)?.name || "",
          r.emp.department || "",
          r.submitted ? "已提交" : "未提交",
        ]
        for (const bt of BIZ_TYPES) {
          const bd = r.byType[bt]
          row.push(bd ? (bd.minutes / 60).toFixed(2) : "0")
          row.push(bd ? bd.amount : 0)
        }
        row.push(r.bonus, r.transport, r.total)
        rows.push(row)
      }
      const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n")
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `工资汇总_${year}年${month}月.csv`
      a.click()
      URL.revokeObjectURL(url)
    }

    const thStyle = { padding: "10px 8px", fontSize: 11, color: t.tm, fontWeight: 600, textAlign: "left", borderBottom: `2px solid ${t.bd}`, background: t.bgH, position: "sticky", top: 0, zIndex: 2, whiteSpace: "nowrap" }
    const tdStyle = { padding: "8px 8px", fontSize: 12, color: t.tx, borderBottom: `1px solid ${t.bl}`, whiteSpace: "nowrap" }
    const numStyle = { ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }

    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: t.tx, margin: "0 0 4px" }}>一键上传 · 月度汇总表</h2>
            <p style={{ fontSize: 11, color: t.tm, margin: 0 }}>行 = 老师，列 = 各工种时数/金额。点姓名进入该老师的详细工时表</p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={() => chgMonth(-1)} style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${t.bd}`, background: "transparent", color: t.ts, cursor: "pointer", display: "inline-flex", alignItems: "center", fontFamily: "inherit" }}><ChevronLeft size={14} /></button>
            <span style={{ fontSize: 14, fontWeight: 700, color: t.tx, minWidth: 90, textAlign: "center" }}>{year}年{month}月</span>
            <button onClick={() => chgMonth(1)} style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${t.bd}`, background: "transparent", color: t.ts, cursor: "pointer", display: "inline-flex", alignItems: "center", fontFamily: "inherit" }}><ChevronRight size={14} /></button>
            <button onClick={exportCSV} style={{ padding: "6px 12px", borderRadius: 6, border: "none", background: t.gn, color: "#fff", cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600 }}>
              <Download size={13} /> 下载 CSV
            </button>
          </div>
        </div>

        {/* 筛选 */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: "1 1 240px" }}>
            <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: t.tm }} />
            <input placeholder="搜索姓名 / 假名 / 拼音" value={empSearch} onChange={(e) => setEmpSearch(e.target.value)}
              style={{ width: "100%", padding: "8px 12px 8px 34px", borderRadius: 8, border: `1px solid ${t.bd}`, background: t.bgC, color: t.tx, fontSize: 12, boxSizing: "border-box" }} />
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[{ id: "all", name: "全部" }, ...COMPANIES].map(c => {
              const on = companyFilter === c.id
              return (
                <button key={c.id} onClick={() => setCompanyFilter(c.id)} style={{
                  padding: "6px 12px", borderRadius: 18, border: `1px solid ${on ? t.ac : t.bd}`,
                  background: on ? `${t.ac}15` : "transparent", color: on ? t.ac : t.ts,
                  fontSize: 11, fontWeight: on ? 600 : 400, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
                }}>{c.name}</button>
              )
            })}
          </div>
        </div>

        {adminLd ? (
          <div style={{ textAlign: "center", padding: 40, color: t.tm }}>加载中...</div>
        ) : (
        <div style={{ background: t.bgC, border: `1px solid ${t.bd}`, borderRadius: 10, overflow: "auto", maxHeight: "calc(100vh - 220px)" }}>
          <table style={{ borderCollapse: "collapse", minWidth: 1400, fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, position: "sticky", left: 0, zIndex: 3, minWidth: 110 }}>姓名</th>
                <th style={{ ...thStyle, minWidth: 70 }}>部门</th>
                <th style={{ ...thStyle, minWidth: 70 }}>状态</th>
                {BIZ_TYPES.map(bt => (
                  <th key={bt} style={{ ...thStyle, textAlign: "center", minWidth: 120, borderLeft: `1px dashed ${t.bd}` }} colSpan={2}>{bt}</th>
                ))}
                <th style={{ ...thStyle, textAlign: "right", minWidth: 90, borderLeft: `1px dashed ${t.bd}` }}>班课绩效</th>
                <th style={{ ...thStyle, textAlign: "right", minWidth: 80 }}>交通费</th>
                <th style={{ ...thStyle, textAlign: "right", minWidth: 96, background: `${t.ac}10`, color: t.ac }}>合计</th>
              </tr>
              <tr>
                <th style={{ ...thStyle, position: "sticky", left: 0, zIndex: 3, top: 38 }} />
                <th style={{ ...thStyle, top: 38 }} />
                <th style={{ ...thStyle, top: 38 }} />
                {BIZ_TYPES.map(bt => (
                  <>
                    <th key={bt + "_h"} style={{ ...thStyle, top: 38, textAlign: "right", fontSize: 10, fontWeight: 500, borderLeft: `1px dashed ${t.bd}` }}>时数</th>
                    <th key={bt + "_a"} style={{ ...thStyle, top: 38, textAlign: "right", fontSize: 10, fontWeight: 500 }}>金额</th>
                  </>
                ))}
                <th style={{ ...thStyle, top: 38, borderLeft: `1px dashed ${t.bd}` }} />
                <th style={{ ...thStyle, top: 38 }} />
                <th style={{ ...thStyle, top: 38, background: `${t.ac}10` }} />
              </tr>
            </thead>
            <tbody>
              {rowsData.length === 0 && (
                <tr><td colSpan={4 + BIZ_TYPES.length * 2 + 3} style={{ padding: 40, textAlign: "center", color: t.tm, fontSize: 12 }}>无匹配老师</td></tr>
              )}
              {rowsData.map(r => {
                const fade = !r.submitted
                return (
                  <tr key={r.emp.id} style={{ opacity: fade ? 0.72 : 1 }}
                    onMouseEnter={e => e.currentTarget.style.background = `${t.ac}08`}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <td style={{ ...tdStyle, position: "sticky", left: 0, background: "inherit", fontWeight: 600 }}>
                      <button onClick={() => setSelectedEmp(r.emp)} style={{ background: "transparent", border: "none", padding: 0, color: t.ac, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{r.emp.name}</button>
                    </td>
                    <td style={{ ...tdStyle, color: t.ts, fontSize: 11 }}>{r.emp.department || "—"}</td>
                    <td style={tdStyle}>
                      {r.submitted
                        ? <span style={{ padding: "1px 7px", borderRadius: 4, fontSize: 10, fontWeight: 600, background: `${t.gn}18`, color: t.gn }}>已提交</span>
                        : <span style={{ padding: "1px 7px", borderRadius: 4, fontSize: 10, fontWeight: 600, background: `${t.wn}18`, color: t.wn }}>未提交</span>}
                    </td>
                    {BIZ_TYPES.map(bt => {
                      const bd = r.byType[bt]
                      return (
                        <>
                          <td key={bt + "_h"} style={{ ...numStyle, color: bd ? t.tx : t.td, borderLeft: `1px dashed ${t.bl}` }}>{bd ? (bd.minutes / 60).toFixed(1) : "—"}</td>
                          <td key={bt + "_a"} style={{ ...numStyle, color: bd ? t.tx : t.td }}>{bd ? `¥${bd.amount.toLocaleString()}` : "—"}</td>
                        </>
                      )
                    })}
                    <td style={{ ...numStyle, color: r.bonus > 0 ? t.wn : t.td, borderLeft: `1px dashed ${t.bl}` }}>{r.bonus > 0 ? `¥${r.bonus.toLocaleString()}` : "—"}</td>
                    <td style={{ ...numStyle, color: r.transport > 0 ? t.tx : t.td }}>{r.transport > 0 ? `¥${r.transport.toLocaleString()}` : "—"}</td>
                    <td style={{ ...numStyle, fontWeight: 700, color: t.ac, background: `${t.ac}05` }}>{r.total > 0 ? `¥${r.total.toLocaleString()}` : "—"}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        )}
        <div style={{ marginTop: 10, fontSize: 10, color: t.tm }}>
          共 {rowsData.length} 位老师 · 已提交 {rowsData.filter(r => r.submitted).length} · 合计 ¥{rowsData.reduce((s, r) => s + (r.submitted ? r.total : 0), 0).toLocaleString()}（仅已提交）
        </div>
      </div>
    )
  }

  // ========== 主表格视图 ==========
  const colWidths = {
    num: 36, date: 110, biz: 150, start: 76, end: 76,
    hours: 66, rate: 80, bonus: 82, trans: 82, subtotal: 96,
    student: 100, course: 160, del: 36,
  }
  const thStyle = { padding: "8px 6px", fontSize: 10, color: t.tm, fontWeight: 600, textAlign: "left", borderBottom: `1px solid ${t.bd}`, background: t.bgH, position: "sticky", top: 0, zIndex: 1, whiteSpace: "nowrap" }
  const tdStyle = { padding: "4px 6px", fontSize: 12, color: t.tx, borderBottom: `1px solid ${t.bl}`, verticalAlign: "middle" }
  const inpStyle = { width: "100%", padding: "4px 6px", border: "1px solid transparent", borderRadius: 4, fontSize: 12, background: "transparent", color: t.tx, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {isAdmin && (
            <button onClick={() => setSelectedEmp(null)} style={{ padding: "6px 10px", borderRadius: 7, border: `1px solid ${t.bd}`, background: "transparent", color: t.ts, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12 }}>
              <ArrowLeft size={13} /> 换一位
            </button>
          )}
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: t.tx, margin: 0 }}>一键上传 · {selectedEmp?.name}</h2>
            <p style={{ fontSize: 11, color: t.tm, margin: "2px 0 0" }}>{selectedEmp?.department || "—"} · 与工资报表共享同一数据</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => chgMonth(-1)} style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${t.bd}`, background: "transparent", color: t.ts, cursor: "pointer", display: "inline-flex", alignItems: "center", fontFamily: "inherit" }}><ChevronLeft size={14} /></button>
          <span style={{ fontSize: 14, fontWeight: 700, color: t.tx, minWidth: 90, textAlign: "center" }}>{year}年{month}月</span>
          <button onClick={() => chgMonth(1)} style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${t.bd}`, background: "transparent", color: t.ts, cursor: "pointer", display: "inline-flex", alignItems: "center", fontFamily: "inherit" }}><ChevronRight size={14} /></button>
          <label style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${t.ac}`, background: `${t.ac}10`, color: t.ac, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600 }}>
            <Upload size={13} /> 上传 Excel
            <input type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFilePick(f); e.target.value = "" }} />
          </label>
          <button disabled title="稍后实现" style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${t.bd}`, background: "transparent", color: t.td, cursor: "not-allowed", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12 }}>
            <Download size={13} /> 导出 Excel
          </button>
        </div>
      </div>

      {msg && <div style={{ padding: 10, borderRadius: 8, background: `${t.gn}15`, color: t.gn, marginBottom: 12, fontSize: 12 }}>{msg}</div>}

      {/* 顶部并排三卡：最近7天累计 + 月末提交提醒 + 打卡照片（仅 baito 视角） */}
      {!isAdmin && (
        <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200, ...glassCard, padding: 14, background: hoursStatus.bg, border: hoursStatus.level !== "ok" ? `2px solid ${hoursStatus.color}` : glassCard.border }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, fontSize: 11, fontWeight: 600, color: hoursStatus.color }}>
              {hoursIcon} 最近 7 天累计
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
              <span style={{ fontSize: 26, fontWeight: 800, color: hoursStatus.level === "ok" ? t.tx : hoursStatus.color, fontVariantNumeric: "tabular-nums" }}>{worst7d.hours.toFixed(1)}</span>
              <span style={{ fontSize: 12, color: t.tm }}>/ 28h</span>
            </div>
            <div style={{ marginTop: 4, fontSize: 10, color: hoursStatus.level === "ok" ? t.tm : hoursStatus.color, fontWeight: 500, lineHeight: 1.35 }}>
              {hoursStatus.text}
              {worst7d.windowEnd && worst7d.hours >= 20 && <> · 最坏窗口截至 {worst7d.windowEnd}</>}
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 200, ...glassCard, padding: 14, background: submitStatus.bg, border: submitStatus.level !== "ok" ? `2px solid ${submitStatus.color}` : glassCard.border }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, fontSize: 11, fontWeight: 600, color: submitStatus.color }}>
              {submitStatus.icon} {year}年{month}月 月报
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
              <span style={{ fontSize: 26, fontWeight: 800, color: submitStatus.level === "ok" ? t.tx : submitStatus.color, fontVariantNumeric: "tabular-nums" }}>{submitStatus.big}</span>
              {submitStatus.unit && <span style={{ fontSize: 12, color: t.tm }}>{submitStatus.unit}</span>}
            </div>
            <div style={{ marginTop: 4, fontSize: 10, color: submitStatus.level === "ok" ? t.tm : submitStatus.color, fontWeight: 500, lineHeight: 1.35 }}>
              {submitStatus.text}
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 200, ...glassCard, padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontSize: 11, fontWeight: 600, color: t.ac }}>
              <Camera size={13} /> 打卡照片
              {submission?.photo_1_drive_id && submission?.photo_2_drive_id && (
                <span style={{ fontSize: 10, color: t.gn, fontWeight: 600, marginLeft: "auto" }}>已完成</span>
              )}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {[1, 2].map((slot) => {
                const driveId = submission?.[`photo_${slot}_drive_id`]
                const uploading = photoUploading[slot]
                const editLocked = isSubmitted && !isAdmin
                const tileBase = {
                  position: "relative", flex: 1, minWidth: 0, aspectRatio: "1 / 1",
                  borderRadius: 8,
                  border: `1px dashed ${driveId ? `${t.gn}66` : t.bd}`,
                  background: driveId ? `${t.gn}08` : "rgba(255,255,255,0.55)",
                  overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center",
                }
                if (driveId) {
                  return (
                    <div key={slot} onClick={() => setLightboxPhoto({ slot, driveId })} style={{ ...tileBase, cursor: "zoom-in" }}>
                      <img src={`https://cssnsgdawdhrkrmztuas.supabase.co/functions/v1/get-clock-photo?id=${driveId}`} alt={`打卡${slot}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      <span style={{ position: "absolute", top: 3, left: 3, width: 16, height: 16, borderRadius: "50%", background: t.gn, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                        <Check size={10} strokeWidth={3} />
                      </span>
                    </div>
                  )
                }
                return (
                  <label key={slot} style={{ ...tileBase, cursor: uploading ? "wait" : editLocked ? "not-allowed" : "pointer" }}>
                    {uploading ? (
                      <div style={{ width: 16, height: 16, border: `2px solid ${t.ac}33`, borderTopColor: t.ac, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, color: t.tm }}>
                        <Upload size={14} />
                        <span style={{ fontSize: 9, fontWeight: 600 }}>{slot}</span>
                      </div>
                    )}
                    {!editLocked && (
                      <input type="file" accept="image/*" disabled={uploading}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadClockPhoto(slot, f); e.target.value = "" }}
                        style={{ position: "absolute", inset: 0, opacity: 0, cursor: uploading ? "wait" : "pointer" }} />
                    )}
                  </label>
                )
              })}
            </div>
            {photoError && <div style={{ fontSize: 9, color: t.rd, marginTop: 4 }}>{photoError}</div>}
          </div>
        </div>
      )}

      {/* 打卡照片 lightbox */}
      {lightboxPhoto && (
        <div onClick={() => setLightboxPhoto(null)} style={{ position: "fixed", inset: 0, zIndex: 1400, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-out", padding: 20 }}>
          <img src={`https://cssnsgdawdhrkrmztuas.supabase.co/functions/v1/get-clock-photo?id=${lightboxPhoto.driveId}`} alt={`打卡照片 ${lightboxPhoto.slot}`} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 8, boxShadow: "0 12px 60px rgba(0,0,0,0.5)" }} />
          <button onClick={(e) => { e.stopPropagation(); setLightboxPhoto(null) }} style={{ position: "absolute", top: 20, right: 20, background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", padding: "6px 10px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 4 }}><XIcon size={16} /></button>
        </div>
      )}

      {ld ? (
        <div style={{ textAlign: "center", padding: 40, color: t.tm }}>加载中...</div>
      ) : (
      <>
      <div style={{ background: t.bgC, border: `1px solid ${t.bd}`, borderRadius: 10, overflow: "auto", marginBottom: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: showBonus ? 1100 : 1000 }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: colWidths.num, textAlign: "center" }}>#</th>
              <th style={{ ...thStyle, width: colWidths.date }}>日付</th>
              <th style={{ ...thStyle, width: colWidths.biz }}>業務内容</th>
              <th style={{ ...thStyle, width: colWidths.start }}>開始</th>
              <th style={{ ...thStyle, width: colWidths.end }}>終了</th>
              <th style={{ ...thStyle, width: colWidths.hours, textAlign: "right" }}>時間数</th>
              <th style={{ ...thStyle, width: colWidths.rate, textAlign: "right" }}>時給</th>
              {showBonus && <th style={{ ...thStyle, width: colWidths.bonus, textAlign: "right" }}>班课绩效</th>}
              <th style={{ ...thStyle, width: colWidths.trans, textAlign: "right" }}>交通費</th>
              <th style={{ ...thStyle, width: colWidths.subtotal, textAlign: "right" }}>回当り総額</th>
              <th style={{ ...thStyle, width: colWidths.student }}>学生氏名</th>
              <th style={{ ...thStyle, width: colWidths.course }}>備考</th>
              <th style={{ ...thStyle, width: colWidths.del }} />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={showBonus ? 13 : 12} style={{ padding: 40, textAlign: "center", color: t.tm, fontSize: 12 }}>本月无工时记录，点下方「+ 新增一行」添加</td></tr>
            )}
            {rows.map((r, i) => {
              const rateOptions = rates.map(x => x.business_type)
              const wd = r.work_date ? new Date(r.work_date + "T00:00:00").getDay() : null
              return (
                <tr key={r._key} style={{ background: r._isNew ? `${t.ac}05` : "transparent" }}>
                  <td style={{ ...tdStyle, textAlign: "center", color: t.tm }}>{i + 1}</td>
                  <td style={tdStyle}>
                    <input type="date" value={r.work_date} onChange={(e) => updateRow(r._key, "work_date", e.target.value)} style={inpStyle} />
                    {wd !== null && <div style={{ fontSize: 9, color: wd === 0 || wd === 6 ? t.rd : t.td, paddingLeft: 6 }}>{WEEKDAYS[wd]}</div>}
                  </td>
                  <td style={tdStyle}>
                    <select value={r.business_type} onChange={(e) => updateRow(r._key, "business_type", e.target.value)}
                      style={{ ...inpStyle, fontFamily: "inherit" }}>
                      <option value="">—</option>
                      {[...new Set([...rateOptions, r.business_type].filter(Boolean))].map(bt => (
                        <option key={bt} value={bt}>{bt}{rateOptions.includes(bt) ? ` ¥${getRateFor(bt)}` : ""}</option>
                      ))}
                    </select>
                  </td>
                  <td style={tdStyle}><input type="time" value={r.start_time} onChange={(e) => updateRow(r._key, "start_time", e.target.value)} style={inpStyle} /></td>
                  <td style={tdStyle}><input type="time" value={r.end_time} onChange={(e) => updateRow(r._key, "end_time", e.target.value)} style={inpStyle} /></td>
                  <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums", color: t.tm }}>{fmtHours(r.work_minutes || 0)}</td>
                  <td style={tdStyle}>
                    <input type="number" value={r.hourly_rate || ""} onChange={(e) => updateRow(r._key, "hourly_rate", parseInt(e.target.value) || 0)} style={{ ...inpStyle, textAlign: "right" }} />
                  </td>
                  {showBonus && (
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      {r.business_type === EJU_TYPE ? (
                        <label style={{ display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer", fontSize: 11, color: r.eju_bonus ? t.gn : t.ts }} title={`EJU 班課 +¥${EJU_BONUS_PER_HOUR}/h`}>
                          <input type="checkbox" checked={!!r.eju_bonus} onChange={(e) => updateRow(r._key, "eju_bonus", e.target.checked)} style={{ width: 14, height: 14, accentColor: "#10B981", cursor: "pointer" }} />
                          +¥{EJU_BONUS_PER_HOUR}
                        </label>
                      ) : (
                        <span style={{ color: t.td, fontSize: 11 }}>—</span>
                      )}
                    </td>
                  )}
                  <td style={tdStyle}>
                    <input type="number" value={r.transport_fee} onChange={(e) => updateRow(r._key, "transport_fee", e.target.value)} style={{ ...inpStyle, textAlign: "right" }} />
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600, color: t.ac, fontVariantNumeric: "tabular-nums" }}>{yen(rowSubtotal(r))}</td>
                  <td style={tdStyle}>
                    <input value={r.student_name || ""} onChange={(e) => updateRow(r._key, "student_name", e.target.value)} placeholder="一对一必填" style={inpStyle} />
                  </td>
                  <td style={tdStyle}>
                    <input value={r.course_name || ""} onChange={(e) => updateRow(r._key, "course_name", e.target.value)} placeholder="课程名/说明" style={inpStyle} />
                  </td>
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    <button onClick={() => removeRow(r)} style={{ background: "transparent", border: "none", color: t.rd, cursor: "pointer", padding: 4, fontFamily: "inherit" }} title="删除">
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {isSubmitted && (
        <div style={{ padding: "10px 14px", borderRadius: 10, background: `${t.gn}10`, border: `1px solid ${t.gn}40`, marginBottom: 12, fontSize: 12, color: t.gn, display: "flex", alignItems: "center", gap: 8 }}>
          <Check size={14} /> 本月工时已于 {submission?.submitted_at ? new Date(submission.submitted_at).toLocaleString() : "—"} 提交。如需修改请联系管理员解锁。
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
        <button onClick={addRow} disabled={isSubmitted && !isAdmin} style={{ padding: "8px 14px", borderRadius: 8, border: `1px dashed ${t.ac}`, background: `${t.ac}08`, color: t.ac, cursor: (isSubmitted && !isAdmin) ? "not-allowed" : "pointer", fontSize: 12, fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 4, opacity: (isSubmitted && !isAdmin) ? 0.4 : 1 }}>
          <Plus size={14} /> 新增一行
        </button>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={save} disabled={saving || (isSubmitted && !isAdmin) || rows.every(r => !r._dirty && !r._isNew)} style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: t.ac, color: "#fff", fontSize: 13, fontWeight: 600, cursor: saving ? "wait" : "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6, opacity: (saving || (isSubmitted && !isAdmin) || rows.every(r => !r._dirty && !r._isNew)) ? 0.5 : 1 }}>
            <Save size={14} /> {saving ? "保存中..." : "保存全部"}
          </button>
          {!isAdmin && !isSubmitted && (
            <button onClick={submitReport} disabled={submittingReport || hasChanges || rows.length === 0} title={hasChanges ? "请先保存修改" : rows.length === 0 ? "本月无工时记录" : ""} style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: t.gn, color: "#fff", fontSize: 13, fontWeight: 600, cursor: submittingReport ? "wait" : "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6, opacity: (submittingReport || hasChanges || rows.length === 0) ? 0.5 : 1 }}>
              <Send size={14} /> {submittingReport ? "提交中..." : "提交月报"}
            </button>
          )}
        </div>
      </div>

      {/* 底部汇总（粘性） */}
      <div style={{
        position: "sticky", bottom: 0, background: t.bgC, border: `1px solid ${t.bd}`,
        borderRadius: 10, padding: "14px 18px", display: "flex", justifyContent: "space-between",
        alignItems: "center", flexWrap: "wrap", gap: 14, boxShadow: "0 -4px 16px rgba(0,0,0,0.04)",
      }}>
        <div style={{ display: "flex", gap: 22, flexWrap: "wrap", fontSize: 12, color: t.ts }}>
          <Stat label="総時間数" value={`${totals.totalHours.toFixed(2)} h`} t={t} />
          <Stat label="給与総額" value={yen(totals.wageSum)} t={t} />
          {showBonus && <Stat label="班课绩效" value={yen(totals.bonusSum)} t={t} />}
          <Stat label="交通費総額" value={yen(totals.transSum)} t={t} />
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontSize: 12, color: t.tm }}>合計</span>
          <span style={{ fontSize: 22, fontWeight: 800, color: t.ac, fontVariantNumeric: "tabular-nums" }}>{yen(totals.grand)}</span>
        </div>
      </div>
      </>)}

      {/* 业务名映射对话框 */}
      {uploadState === "mapping" && uploadData && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={() => setUploadState(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "rgba(255,255,255,0.98)", borderRadius: 18, maxWidth: 600, width: "100%", padding: 24, maxHeight: "85vh", overflowY: "auto", boxShadow: "0 30px 80px -20px rgba(15,23,42,0.3)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: t.tx, display: "flex", alignItems: "center", gap: 6 }}>
                <AlertTriangle size={16} color={t.wn} /> 业务名需要确认
              </h3>
              <button onClick={() => setUploadState(null)} style={{ background: "transparent", border: "none", color: t.tm, cursor: "pointer", fontFamily: "inherit", display: "inline-flex" }}><XIcon size={18} /></button>
            </div>
            <p style={{ margin: "0 0 14px", fontSize: 12, color: t.tm, lineHeight: 1.6 }}>
              文件「{uploadData.fileName}」里的以下业务名系统认不出，请选对应的工种。选完点"确认"继续。
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
              {uploadData.unmappedBizTypes.map(raw => (
                <div key={raw} style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 10 }}>
                  <code style={{ padding: "6px 10px", borderRadius: 6, background: t.bgI, color: t.tx, fontSize: 12, fontFamily: "monospace" }}>{raw}</code>
                  <span style={{ color: t.tm, fontSize: 11 }}>→</span>
                  <select value={bizMapping[raw] || ""} onChange={(e) => setBizMapping(p => ({ ...p, [raw]: e.target.value }))}
                    style={{ padding: "8px 10px", borderRadius: 6, border: `1px solid ${t.bd}`, background: t.bgI, color: t.tx, fontSize: 12, fontFamily: "inherit" }}>
                    <option value="">— 请选 —</option>
                    {SUPPORTED_BIZ.map(bt => <option key={bt} value={bt}>{bt}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setUploadState(null)} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${t.bd}`, background: "transparent", color: t.ts, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>取消</button>
              <button onClick={confirmMapping} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: t.ac, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>确认映射</button>
            </div>
          </div>
        </div>
      )}

      {/* 上传预览 + 确认 */}
      {uploadState === "preview" && uploadData && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={() => setUploadState(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "rgba(255,255,255,0.98)", borderRadius: 18, maxWidth: 900, width: "100%", padding: 24, maxHeight: "88vh", overflowY: "auto", boxShadow: "0 30px 80px -20px rgba(15,23,42,0.3)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: t.tx }}>预览并确认上传</h3>
              <button onClick={() => setUploadState(null)} style={{ background: "transparent", border: "none", color: t.tm, cursor: "pointer", fontFamily: "inherit", display: "inline-flex" }}><XIcon size={18} /></button>
            </div>
            <div style={{ fontSize: 12, color: t.tm, marginBottom: 14, display: "flex", gap: 14, flexWrap: "wrap" }}>
              <span>文件：<strong style={{ color: t.tx }}>{uploadData.fileName}</strong></span>
              <span>共 <strong style={{ color: t.tx }}>{uploadData.rows.length}</strong> 行</span>
              <span>{uploadData.hasBonus ? "含班课绩效（学部模板）" : "大学院模板"}</span>
            </div>

            {/* 对账警告 —— 只提示真正的不符，±2 円内的 Excel 浮点精度噪音（短课程很常见）不计 */}
            {(() => {
              const TOLERANCE = 2 // Excel 的 (D-C)*24 有 FP 误差，15/30/45 分钟课常差 ±1 円
              const mismatches = uploadData.rows
                .map((r, i) => {
                  const hours = (r.work_minutes || 0) / 60
                  const effBonus = r.business_type === EJU_TYPE ? (r.bonus_per_hour || 0) : 0 // 仅 EJU 班課 才计绩效
                  const computed = Math.round(hours * (r.hourly_rate + effBonus) + (r.transport_fee || 0))
                  if (r.subtotal_excel == null) return null
                  const diff = r.subtotal_excel - computed
                  if (Math.abs(diff) <= TOLERANCE) return null
                  return { i, computed, diff }
                })
                .filter(Boolean)
              if (!mismatches.length) return null
              const totalDiff = mismatches.reduce((s, m) => s + m.diff, 0)
              return (
                <div style={{ padding: 12, borderRadius: 10, background: `${t.rd}10`, border: `1px solid ${t.rd}40`, marginBottom: 14, fontSize: 12, color: t.tx, lineHeight: 1.6 }}>
                  <div style={{ fontWeight: 600, color: t.rd, display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <AlertTriangle size={13} /> {mismatches.length} 行手填总额与系统计算不符，老师 Excel 总数比系统{totalDiff > 0 ? `多 ¥${totalDiff.toLocaleString()}` : `少 ¥${Math.abs(totalDiff).toLocaleString()}`}
                  </div>
                  <div style={{ color: t.tm, fontSize: 11 }}>
                    导入按"小时数 × (時給 + 绩效) + 交通費"为准。下方表格里红色行就是对不上的。如有正当 bonus 漏算，请跟老师确认后手动调整。
                  </div>
                </div>
              )
            })()}

            {/* 冲突模式 */}
            <div style={{ padding: 12, borderRadius: 10, background: `${t.wn}10`, border: `1px solid ${t.wn}30`, marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: t.tx, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                <AlertTriangle size={13} color={t.wn} /> 和当月已有记录怎么处理？
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer" }}>
                  <input type="radio" checked={uploadMode === "append"} onChange={() => setUploadMode("append")} style={{ marginTop: 3 }} />
                  <div>
                    <div style={{ color: t.tx, fontWeight: 600 }}>追加（推荐）</div>
                    <div style={{ color: t.tm, fontSize: 11 }}>不动已有记录，新文件的行加进去。可能产生重复，但不会丢数据。</div>
                  </div>
                </label>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer" }}>
                  <input type="radio" checked={uploadMode === "replace"} onChange={() => setUploadMode("replace")} style={{ marginTop: 3 }} />
                  <div>
                    <div style={{ color: t.rd, fontWeight: 600 }}>替换当月全部</div>
                    <div style={{ color: t.tm, fontSize: 11 }}>先删除 {year}年{month}月 该老师的所有工时记录（不影响其他月份），再插入新行。<strong style={{ color: t.rd }}>不可撤销</strong>。</div>
                  </div>
                </label>
              </div>
            </div>

            {/* 数据预览 */}
            <div style={{ border: `1px solid ${t.bd}`, borderRadius: 8, overflow: "auto", maxHeight: 300, marginBottom: 14 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, minWidth: 760 }}>
                <thead>
                  <tr style={{ background: t.bgH }}>
                    {["日付", "業務内容", "起止", "時給", ...(uploadData.hasBonus ? ["绩效"] : []), "交通費", "対帐", "学生", "備考"].map((h, i) => (
                      <th key={i} style={{ padding: "6px 8px", color: t.tm, fontWeight: 600, textAlign: "left", borderBottom: `1px solid ${t.bd}`, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {uploadData.rows.map((r, i) => {
                    const hours = (r.work_minutes || 0) / 60
                    const effBonus = r.business_type === EJU_TYPE ? (r.bonus_per_hour || 0) : 0 // 仅 EJU 班課 才计绩效
                  const computed = Math.round(hours * (r.hourly_rate + effBonus) + (r.transport_fee || 0))
                    const diff = r.subtotal_excel != null ? r.subtotal_excel - computed : 0
                    const mismatch = r.subtotal_excel != null && Math.abs(diff) > 2  // ±2 円容差，屏蔽 Excel 浮点噪音
                    return (
                      <tr key={i} style={{ borderBottom: `1px solid ${t.bl}`, background: mismatch ? `${t.rd}08` : "transparent" }}>
                        <td style={{ padding: "5px 8px", color: t.ts, fontFamily: "monospace", whiteSpace: "nowrap" }}>{r.work_date}</td>
                        <td style={{ padding: "5px 8px" }}>
                          <span style={{ padding: "1px 6px", borderRadius: 4, fontSize: 10, background: `${t.ac}15`, color: t.ac }}>{r.business_type || "⚠ 未映射"}</span>
                        </td>
                        <td style={{ padding: "5px 8px", color: t.ts, fontFamily: "monospace" }}>{r.start_time || "—"} ~ {r.end_time || "—"}</td>
                        <td style={{ padding: "5px 8px", color: t.ts, textAlign: "right" }}>¥{r.hourly_rate.toLocaleString()}</td>
                        {uploadData.hasBonus && <td style={{ padding: "5px 8px", color: t.ts, textAlign: "right" }}>{r.bonus_per_hour ? `¥${r.bonus_per_hour}/h` : "—"}</td>}
                        <td style={{ padding: "5px 8px", color: t.ts, textAlign: "right" }}>{r.transport_fee ? `¥${r.transport_fee}` : "—"}</td>
                        <td style={{ padding: "5px 8px", textAlign: "right", whiteSpace: "nowrap" }}>
                          {r.subtotal_excel == null
                            ? <span style={{ color: t.td }}>—</span>
                            : mismatch
                              ? <span style={{ color: t.rd, fontWeight: 600 }} title={`系统算 ¥${computed.toLocaleString()} / Excel 填 ¥${r.subtotal_excel.toLocaleString()}`}>{diff > 0 ? "+" : ""}¥{diff.toLocaleString()}</span>
                              : <span style={{ color: t.gn }}>✓</span>}
                        </td>
                        <td style={{ padding: "5px 8px", color: t.ts }}>{r.student_name || "—"}</td>
                        <td style={{ padding: "5px 8px", color: t.tm }}>{r.course_name || ""}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setUploadState(null)} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${t.bd}`, background: "transparent", color: t.ts, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>取消</button>
              <button onClick={() => {
                if (uploadMode === "replace" && !confirm(`确认删除 ${year}年${month}月 的所有工时记录，然后插入 ${uploadData.rows.length} 行新数据？此操作不可撤销。`)) return
                submitUpload()
              }} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: uploadMode === "replace" ? t.rd : t.ac, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 4 }}>
                <Check size={13} /> {uploadMode === "replace" ? `清空并插入 ${uploadData.rows.length} 行` : `追加 ${uploadData.rows.length} 行`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 上传中遮罩 */}
      {uploadState === "submitting" && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1250, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "rgba(255,255,255,0.98)", borderRadius: 14, padding: "22px 28px", fontSize: 14, color: t.tx, display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 18, height: 18, border: `2px solid ${t.ac}33`, borderTopColor: t.ac, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            上传中...
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, t }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 10, color: t.tm }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: t.tx, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  )
}
