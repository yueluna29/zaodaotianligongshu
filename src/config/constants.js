export const LEAVE_TYPES = [
  { v: "有休", l: "有休", c: "#2563EB", bg: "#DBEAFE", i: "🏖" },
  { v: "代休", l: "代休", c: "#D97706", bg: "#FEF3C7", i: "🔄" },
  { v: "振替", l: "振替", c: "#059669", bg: "#D1FAE5", i: "↔️" },
  { v: "病假", l: "病假", c: "#DC2626", bg: "#FEE2E2", i: "🏥" },
  { v: "特休", l: "特休", c: "#7C3AED", bg: "#EDE9FE", i: "⭐" },
  { v: "欠勤", l: "欠勤", c: "#6B7280", bg: "#F3F4F6", i: "✖" },
]

export const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"]

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
export const workingDays = (y, m) => {
  let c = 0
  for (let d = 1; d <= daysInMonth(y, m); d++) if (!isWeekend(y, m, d)) c++
  return c
}
