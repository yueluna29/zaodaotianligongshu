// 日本劳动法有休付与阶梯
const GRANT_TABLE = [
    { months: 6, days: 10 },
    { months: 18, days: 11 },
    { months: 30, days: 12 },
    { months: 42, days: 14 },
    { months: 54, days: 16 },
    { months: 66, days: 18 },
    { months: 78, days: 20 },
  ]
  
  function addMonths(date, m) {
    const d = new Date(date)
    d.setMonth(d.getMonth() + m)
    return d
  }
  
  function fmtDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  }
  
  export function calcPaidLeave(hireDateStr, usedRecords = []) {
    const emptyResult = { currentGrant: 0, carryOver: 0, used: 0, balance: 0, totalAvailable: 0, timeline: [], thisYearUsed: 0, mandatoryRequired: 0, mandatoryRemaining: 0, currentGrantDate: null, nextGrantDate: null }
    if (!hireDateStr) return emptyResult

    const hire = new Date(hireDateStr)
    const now = new Date()
    const diffMonths = (now.getFullYear() - hire.getFullYear()) * 12 + (now.getMonth() - hire.getMonth())

    if (diffMonths < 6) return { ...emptyResult, timeline: [{ label: "初回付与", grantDate: fmtDate(addMonths(hire, 6)), days: 10, expiresDate: fmtDate(addMonths(hire, 6 + 24)), status: "未到达" }] }

    const grants = GRANT_TABLE.filter(g => diffMonths >= g.months)
    const currentGrant = grants[grants.length - 1].days
    const carryOver = grants.length >= 2 ? grants[grants.length - 2].days : 0

    const used = usedRecords.reduce((sum, r) => sum + (r.is_half_day ? 0.5 : 1), 0)
    const totalAvailable = currentGrant + carryOver
    const balance = Math.max(0, totalAvailable - used)

    // 義務残（日本労基法）：年 10 日以上付与時、付与基準日から 1 年以内に 5 日以上取得必須
    const currentGrantDate = addMonths(hire, grants[grants.length - 1].months)
    const nextGrantDate = addMonths(currentGrantDate, 12)
    const thisYearUsed = usedRecords.reduce((sum, r) => {
      if (!r.leave_date) return sum
      const d = new Date(r.leave_date + "T00:00:00")
      if (d >= currentGrantDate && d < nextGrantDate) return sum + (r.is_half_day ? 0.5 : 1)
      return sum
    }, 0)
    const mandatoryRequired = currentGrant >= 10 ? 5 : 0
    const mandatoryRemaining = Math.max(0, mandatoryRequired - thisYearUsed)
  
    // 生成时间线
    const timeline = GRANT_TABLE.map((g, i) => {
      const grantDate = addMonths(hire, g.months)
      const expiresDate = addMonths(hire, g.months + 24)
      const reached = diffMonths >= g.months
      const expired = now > expiresDate
      const isCurrent = reached && i === grants.length - 1
      const isCarryOver = reached && i === grants.length - 2
  
      return {
        label: i === 0 ? "初回付与" : `${g.months / 12}年目`,
        grantDate: fmtDate(grantDate),
        days: g.days,
        expiresDate: fmtDate(expiresDate),
        status: expired ? "已过期" : isCurrent ? "当前" : isCarryOver ? "繰越中" : reached ? "已过期" : "未到达",
      }
    })
  
    return { currentGrant, carryOver, used, balance, totalAvailable, timeline, thisYearUsed, mandatoryRequired, mandatoryRemaining, currentGrantDate: fmtDate(currentGrantDate), nextGrantDate: fmtDate(nextGrantDate) }
  }