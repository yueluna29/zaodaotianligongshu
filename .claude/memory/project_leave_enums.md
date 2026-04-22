---
name: 假期相关 DB 枚举（赤日休 / 使用代休 / 赤日補休）
description: leave_requests.leave_type 与 day_swap_requests.compensation_type 的所有合法值，代休/赤日補休的正确表达方式
type: project
---

`leave_requests.leave_type` 合法值：`有休 / 代休 / 振替 / 病假 / 特休 / 欠勤 / 赤日休`
- `赤日休` = 红日子休息登记（勤怠一览「红日子情况记录」tab），记录谁红日子休息了，供日历可视化

`day_swap_requests.compensation_type` 合法值：`NULL / 換休 / 加班 / 使用代休 / 赤日補休`
- `使用代休` = `swap_type=出勤日休息` 时的新选项，消化 1 天代休余额，不需要补班日期
- `赤日補休` = 定休日与日本祝日重叠 → 员工获得 1 天补休；用的时候走换休申请流程，类似 `使用代休`

**Why:** 2026-04-21 加 赤日休 / 使用代休；2026-04-22 加 赤日補休。另外发现一个潜伏 bug —— `过去记录` 补录代休时前端写的是 `compensation_type='代休'`，但 DB 从来不允许这个值，历史上所有代休补录都静默失败。代休的正确表达方式是 `换休 + swap_date 已填 = 已消化代休`。

**How to apply:** 涉及 leave/swap 记录的逻辑务必对齐这套枚举。balance 计算规则：

代休余额：
- 未消化：`swap_type=休日出勤 AND compensation_type=換休 AND swap_date IS NULL`
- 已消化：同上但 `swap_date IS NOT NULL`
- 申请使用代休：`swap_type=出勤日休息 AND compensation_type=使用代休 AND status=承認`（从 unusedComp 里减去）

赤日補休余额：
- 获得：从 `hire_date` 数 `japanese_holidays(country=JP)` 中 weekday 落在 `employees.days_off` 上的条目
- 已用：`swap_type=出勤日休息 AND compensation_type=赤日補休 AND status=承認`
- 余额 = max(0, 获得 - 已用)
