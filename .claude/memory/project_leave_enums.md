---
name: 假期相关 DB 枚举（2026-04-21 扩展）
description: leave_requests.leave_type 和 day_swap_requests.compensation_type 在 2026-04-21 加了新值；代休的正确表达方式
type: project
---

2026-04-21 给两张表的 CHECK 约束加了新枚举值：

- `leave_requests.leave_type` 现支持：`有休 / 代休 / 振替 / 病假 / 特休 / 欠勤 / **赤日休**`
  - `赤日休` = 红日子休息登记（勤怠一览「红日子情况记录」tab），目的是记录谁红日子休息了谁没休，供日历可视化
- `day_swap_requests.compensation_type` 现支持：`NULL / 換休 / 加班 / **使用代休**`
  - `使用代休` = swap_type=出勤日休息 时的新选项，表示"消化 1 天代休余额"，不需要补班日期

**Why:** 业务上新增了两个能力（红日子状态记录、出勤日休息消化代休），约束早先没覆盖；另外发现一个潜伏 bug —— `过去记录` 补录代休时前端写的是 `compensation_type='代休'`，但 DB 从来不允许这个值，历史上所有代休补录都静默失败。正确表达方式是 `换休 + swap_date 已填 = 已消化代休`。

**How to apply:** 以后涉及 leave/swap 记录的逻辑务必对齐这套枚举。balance 计算规则：
- 未消化代休（可用余额）：`swap_type=休日出勤 AND compensation_type=換休 AND swap_date IS NULL`
- 已消化代休：同上但 `swap_date IS NOT NULL`
- 消化中（申请使用代休）：`swap_type=出勤日休息 AND compensation_type=使用代休 AND status=承認`，balance 计算需在 unusedComp 基础上减去这部分
