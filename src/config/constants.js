export const LEAVE_TYPES = [
  { v: "有休", l: "有休", c: "#2563EB", bg: "#DBEAFE", i: "🏖" },
  { v: "代休", l: "代休", c: "#D97706", bg: "#FEF3C7", i: "🔄" },
  { v: "振替", l: "振替", c: "#059669", bg: "#D1FAE5", i: "↔️" },
  { v: "病假", l: "病假", c: "#DC2626", bg: "#FEE2E2", i: "🏥" },
  { v: "特休", l: "特休", c: "#7C3AED", bg: "#EDE9FE", i: "⭐" },
  { v: "欠勤", l: "欠勤", c: "#6B7280", bg: "#F3F4F6", i: "✖" },
  { v: "赤日休", l: "赤日休", c: "#F97316", bg: "#FFEDD5", i: "🎌" },
]

export const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"]

export const COMPANIES = [
  { id: 1, name: "世家学舍", country: "JP" },
  { id: 2, name: "紫陽花教育", country: "JP" },
  { id: 3, name: "早稻大连", country: "CN" },
  { id: 4, name: "早理金华", country: "CN" },
]
export const isChinaCompany = (id) => COMPANIES.find((c) => c.id === id)?.country === "CN"
export const EMP_TYPES_JP = ["正社員", "契約社員", "アルバイト", "外部講師"]
export const EMP_TYPES_CN = ["正社员", "兼职"]
export const empTypesFor = (companyId) => isChinaCompany(companyId) ? EMP_TYPES_CN : EMP_TYPES_JP
export const isFullTime = (et) => et === "正社員" || et === "契約社員" || et === "正社员"
export const isHourly = (et) => et === "アルバイト" || et === "外部講師" || et === "兼职"

// 超级管理员（能开启维护模式）。当前硬编码，如果 luna 以后改 ID 也要同步改这里
export const SUPER_ADMIN_LOGIN_ID = "luna"
export const isSuperAdmin = (user) => user?.login_id === SUPER_ADMIN_LOGIN_ID

// EJU 班课绩效：老师自申报，仅 EJU班課 业务类型可用，固定 300 円/h
export const EJU_TYPE = "EJU講師（班課）"
export const EJU_BONUS_PER_HOUR = 300

export const daysInMonth = (y, m) => new Date(y, m, 0).getDate()
export const weekday = (y, m, d) => new Date(y, m - 1, d).getDay()
export const isWeekend = (y, m, d) => {
  const w = weekday(y, m, d)
  return w === 0 || w === 6
}
export const pad = (n) => String(n).padStart(2, "0")
export const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
export const fmtMinutes = (m) => (m > 0 ? `${(m / 60).toFixed(1)}h` : "0h")
export const fmtYen = (n) => `¥${Math.round(n).toLocaleString()}`
// "2026-05-05" / ISO → "2026-05-05(火)"；无效或空返回原值
export const fmtDateW = (s) => {
  if (!s) return ""
  const ymd = String(s).slice(0, 10)
  const d = new Date(String(s).includes("T") ? s : ymd + "T00:00:00")
  if (isNaN(d.getTime())) return s
  return `${ymd}(${WEEKDAYS[d.getDay()]})`
}
// 老师列表统一 A→Z 排序。优先 furigana（日文）→ pinyin（中文拼音）→ name。
// 如果 fallback 到 name（汉字），用 zh locale 走拼音排序；两边都是假名/拼音时用 ja。
const isLatin = (s) => /^[\x00-\x7f]*$/.test(s)
export const sortByName = (list) => [...(list || [])].sort((a, b) => {
  const ka = (a.furigana || a.pinyin || a.name || "").toLowerCase()
  const kb = (b.furigana || b.pinyin || b.name || "").toLowerCase()
  const locale = (isLatin(ka) && isLatin(kb)) ? "en" : "zh"
  return ka.localeCompare(kb, locale)
})

export const workingDays = (y, m) => {
  let c = 0
  for (let d = 1; d <= daysInMonth(y, m); d++) if (!isWeekend(y, m, d)) c++
  return c
}
