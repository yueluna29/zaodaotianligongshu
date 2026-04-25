---
name: 给与明细页 & payroll_slips
description: 超管专属给与明细页的表结构、R8税额表假设、三层权限守卫；扩展 / 边界条件清单
type: project
---

## 做了什么
`/给与明细` 菜单（Sidebar + MobileNav `show: isSA`）→ `src/pages/payroll/PayrollManager.jsx`
核心 DB：`payroll_slips`（一行 = 一个支付片段，同员工同月可 N 行）
工具：`src/utils/r8TaxTable.js`（R8 税額表 甲欄 0 人列，231 行）

## 关键决策 & 假设
- **一行 = 一个支付片段**，不是"一人一行"。因为实际 Luna 会拆"一部分日本对公 + 一部分微信" —— 3 月紫陽花周家腾已有 2 行先例
- **源泉所得税 与「扣税0.1」是两个完全独立的概念，不要绑死**（Luna 当面纠错过一次）：
  - **源泉所得税** = 日本国家正式税。正/契等社労士给数字（自动 0，手填覆盖）；baito/外部按 R8 税額表 甲欄 0 人自动查表（基数 = 支給合計 − 社保4项）。**和支付方式无关**
  - **扣税0.1** = 公司侧自定 10% 扣项。仅给现金/人民币/微信/支付宝/paypay 等**非公账**支付方式的人选用，"扣"则 支給合計 × 0.1 直接从差引扣除。**和源泉无关**
  - 表头叫"扣税0.1"，对应 DB 字段是 `withhold_rate`（值域 0 / 0.1）。**别又把它当成源泉的开关用**
- **R8 只做了 甲欄 扶養 0 人**，因为"baito 都是学生，扶养 0 人"。若将来有扶养 > 0 的 baito，需要扩 `R8_TABLE_0` 到二维 + employees.dependents_count 联动
- **R8 上限 ¥737,000**，超过返回最末档。Luna 明确"不会有超过 50 万的 baito"
- **乙欄没做**。如果某老师明确"副业乙欄"，只能手填覆盖
- **差引公式**：`支給合計 − 控除(4项) − 源泉 + 調整(2项) − 扣税0.1額`。調整 = 年末+上期，**加项**（正=退还，负=补扣）；扣税0.1額 = `支給合計 × withhold_rate`

## 三层超管守卫（都要在）
1. Sidebar / MobileNav 菜单 `show: isSA`
2. App.jsx `pages` 字典仅 `isSuperAdmin(user)` 时注册 `payroll` key，否则 fallback Dashboard
3. Supabase RLS policy `payroll_slips_super_admin_all`：`login_id='luna'`

如果以后要加第二个超管，`login_id='luna'` 硬编码要同步扩（三个地方：constants.js 的 SUPER_ADMIN_LOGIN_ID、RLS policy、本页 reload 权限提示）

## 还没做的（以后要加再回来）
- **导入员工按钮**：现在只列 `is_active=true` 的员工。非 active-但-有-slip 的老员工看不到 → 需要合并 emp 来源
- **上报金额对 正/契 的自动计算**：当前只从 `work_entries` 聚合，正契一般无 entries → 维持 blank。如果要自动，得加：基本給 + 月固定交通費 + 当月 commissions
- **R8 扶养 > 0 人 / 乙欄** 扩展（见上）
- **工资条员工自助查看**：目前纯管理员台账，员工查不到。如果要做，RLS 需要第二条 policy 放行"员工看自己"
