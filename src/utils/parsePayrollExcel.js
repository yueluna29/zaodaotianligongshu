import * as XLSX from "xlsx"

// Excel 业务内容文本 → DB business_type 的自动映射
// 覆盖不到的 Excel 原值会进入"未识别"列表，弹出映射对话框让 user 处理。
const AUTO_MAP = {
  "事务": "事務性工作", "事务/ta": "事務性工作", "事务/TA": "事務性工作", "ta": "事務性工作",
  "事务性工作": "事務性工作", "事務": "事務性工作", "事務性工作": "事務性工作",
  "正式讲师": "専業課老師", "讲师": "専業課老師", "班课讲师": "EJU講師（班課）",
  "専業課老師": "専業課老師", "班課講師": "EJU講師（班課）",
  "答疑做题": "答疑做題", "答疑": "答疑做題", "做题": "答疑做題", "答疑做題": "答疑做題",
  "研究计划书": "研究計画書修改", "研究计划书修改": "研究計画書修改", "研究計画書修改": "研究計画書修改",
  "过去问": "過去問", "過去問": "過去問",
  "eju": "EJU講師（班課）", "eju班课": "EJU講師（班課）", "eju讲师": "EJU講師（班課）",
  "EJU講師（班課）": "EJU講師（班課）",
}

function normKey(s) {
  return String(s || "").trim().toLowerCase().replace(/[\s　]/g, "")
}

function autoMapBiz(raw) {
  const key = normKey(raw)
  return AUTO_MAP[key] || null
}

// Excel 序列号日期 → YYYY-MM-DD
function excelDateToStr(v) {
  if (v == null || v === "") return ""
  if (v instanceof Date) {
    const y = v.getFullYear(), m = v.getMonth() + 1, d = v.getDate()
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
  }
  if (typeof v === "number") {
    // Excel 序列号：1900-01-01 起
    const date = XLSX.SSF.parse_date_code(v)
    if (!date) return ""
    return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`
  }
  const s = String(v).trim()
  // 尝试解析"2025/5/3" "2025-05-03 00:00:00" "2025-5-3" 等
  const m = s.match(/^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})/)
  if (m) {
    const [, y, mo, d] = m
    return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`
  }
  return ""
}

// "18:00:00" / "18:00" / Excel 数值 → "HH:MM"
function excelTimeToStr(v) {
  if (v == null || v === "") return ""
  if (v instanceof Date) {
    const h = v.getHours(), m = v.getMinutes()
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
  }
  if (typeof v === "number") {
    // Excel 时间：0-1 的小数表示一天
    const totalMin = Math.round(v * 24 * 60)
    const h = Math.floor(totalMin / 60) % 24
    const m = totalMin % 60
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
  }
  const s = String(v).trim()
  const m = s.match(/^(\d{1,2}):(\d{2})/)
  if (m) return `${m[1].padStart(2, "0")}:${m[2]}`
  return ""
}

// 去除数字字段里的 ¥ , 等杂符
function parseNum(v) {
  if (v == null || v === "") return 0
  if (typeof v === "number") return v
  const s = String(v).replace(/[¥,，\s　]/g, "")
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

/**
 * 解析上传的 Excel / CSV 文件。
 * 返回：{ rows: [{work_date, business_type_raw, start_time, end_time, work_minutes, hourly_rate, bonus_per_hour, transport_fee, student_name, course_name}], unmappedBizTypes: string[], hasBonus: boolean }
 *
 * 模板识别策略：
 * - 找到含"日付"的那一行作为表头行
 * - 按表头关键词定位各列索引
 * - 有"班课绩效"列 → hasBonus=true (学部模板)
 */
export async function parsePayrollExcel(file) {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: "array", cellDates: true })

  // 优先找 "工资表" / "工资报表" sheet；否则用第一个
  let ws = wb.Sheets[wb.SheetNames.find(n => /工资表|工资报表|工資|給与/.test(n)) || wb.SheetNames[0]]
  if (!ws) throw new Error("找不到工作表")
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" })

  // 找表头行（含"日付"）
  let hdrIdx = -1
  for (let i = 0; i < Math.min(aoa.length, 20); i++) {
    const row = aoa[i] || []
    if (row.some(c => String(c || "").includes("日付"))) { hdrIdx = i; break }
  }
  if (hdrIdx === -1) throw new Error("识别不到表头行（应包含「日付」）")

  const header = aoa[hdrIdx].map(c => String(c || "").trim())
  const col = (keyword) => header.findIndex(h => h && h.includes(keyword))

  const idx = {
    date: col("日付"),
    biz: col("業務内容"),
    start: col("開始時間") >= 0 ? col("開始時間") : col("開始"),
    end: col("終了時間") >= 0 ? col("終了時間") : col("終了"),
    hours: col("時間数"),
    rate: col("時給"),
    bonus: header.findIndex(h => /班课绩效|班課績效|绩效/.test(h)),
    trans: col("交通費"),
    student: header.findIndex(h => /学生氏名|学生姓名/.test(h)),
    remark: header.findIndex(h => /備考|备注|工作内容/.test(h)),
  }

  if (idx.date < 0 || idx.biz < 0) throw new Error("必须有「日付」和「業務内容」列")

  const hasBonus = idx.bonus >= 0
  const unmapped = new Set()
  const rows = []

  // 两种模板有不同的示例结构，都要跳过：
  // (A) 学部/教务：有"填写示例"标记行 + 3 条示例数据 + "以上为书写格式..."分隔语 → 扫到标记进入 skip，扫到分隔语退出
  // (B) 大学院/咨询：表头紧跟下一行直接就是 1 条示例数据（没标记）→ 自动跳过第一条真实看起来的数据行
  const fullSheetText = aoa.map(r => (r || []).map(c => String(c || "")).join("")).join("\n")
  const hasExampleMarkers = /填写示例|填寫示例/.test(fullSheetText)
  let inExample = false
  let dataRowsSeen = 0

  for (let i = hdrIdx + 1; i < aoa.length; i++) {
    const r = aoa[i] || []
    const rowText = r.map(c => String(c || "")).join("")

    if (hasExampleMarkers) {
      if (!inExample && /填写示例|填寫示例/.test(rowText)) { inExample = true; continue }
      if (inExample) {
        if (/以上为书写格式|以上為書寫格式/.test(rowText)) inExample = false
        continue
      }
    }

    const dateVal = r[idx.date]
    const bizVal = r[idx.biz]
    // 跳过空行、说明行
    if (!dateVal && !bizVal) continue
    const rawBiz = String(bizVal || "").trim()
    if (!rawBiz || rawBiz === "填写示例" || rawBiz.includes("以上为书写格式")) continue

    // 无标记模板（大学院/咨询）：表头后第一条有数据的行视为模板自带示例，跳过
    if (!hasExampleMarkers && dataRowsSeen === 0) { dataRowsSeen++; continue }
    dataRowsSeen++

    const work_date = excelDateToStr(dateVal)
    if (!work_date) continue // 无法识别日期就跳

    const start_time = idx.start >= 0 ? excelTimeToStr(r[idx.start]) : ""
    const end_time = idx.end >= 0 ? excelTimeToStr(r[idx.end]) : ""
    const hoursVal = idx.hours >= 0 ? parseNum(r[idx.hours]) : 0
    const minutes = start_time && end_time
      ? (parseInt(end_time.slice(0, 2)) * 60 + parseInt(end_time.slice(3)) - parseInt(start_time.slice(0, 2)) * 60 - parseInt(start_time.slice(3)))
      : Math.round(hoursVal * 60)

    const mapped = autoMapBiz(rawBiz)
    if (!mapped) unmapped.add(rawBiz)

    rows.push({
      work_date,
      business_type_raw: rawBiz,
      business_type: mapped || "",
      start_time, end_time,
      work_minutes: Math.max(0, minutes),
      hourly_rate: Math.round(parseNum(r[idx.rate])),
      bonus_per_hour: hasBonus ? Math.round(parseNum(r[idx.bonus])) : 0,
      transport_fee: Math.round(parseNum(r[idx.trans])),
      student_name: idx.student >= 0 ? String(r[idx.student] || "").trim() : "",
      course_name: idx.remark >= 0 ? String(r[idx.remark] || "").trim() : "",
    })
  }

  return { rows, unmappedBizTypes: [...unmapped], hasBonus }
}

/**
 * 用户手动补全映射后，把 raw 业务名替换成 DB business_type
 */
export function applyBizMapping(rows, mapping) {
  return rows.map(r => ({
    ...r,
    business_type: r.business_type || mapping[r.business_type_raw] || "",
  }))
}

export const SUPPORTED_BIZ = ["事務性工作", "専業課老師", "答疑做題", "研究計画書修改", "過去問", "EJU講師（班課）"]
