---
name: 假期系统重构 2026-04-26 进度
description: LeaveHub 页面 + 后端算账函数已上线，等用户补完档案/休假记录后再做术语迁移和老页面下线
type: project
---

参照 `/Users/luna/Downloads/leave_system_redesign_spec_v2.md` 重做假期系统。Spec 分 Phase 0 加表 / Phase 1 RPC / Phase 2 前端 / Phase 3 联动 / Phase 4 清理。今天主要做了 Phase 0+1+2 的不破坏性部分，留下破坏性数据迁移给下次。

## 已上线 ✅

**数据库（不破坏现有数据，与旧前端兼容）**
- 3 张新表：`system_settings`、`leave_balance_adjustments`、`holiday_overlap_records`，各自有 admin/本人 RLS
- 加列：`leave_requests.pool_source`、`day_swap_requests.is_half_day`
- 全局设定：`comp_leave_expiry_days=365`、`holiday_comp_start_date=2026-04-01`
- 触发器：`trg_set_swap_deadline`（新插入的休息日出勤申请自动算 deadline = 出勤日 + 365 天）

**算账函数（同时认中文新值「年假/已通过」和日文旧值「有休/承認」）**
- `get_leave_summary(emp_id)`：返回三个池子的余额 + 明细 + 年假在效批次时间线
- `sync_holiday_overlaps(emp_id)`：扫某员工历史红日子撞他定休日的记录（**还没跑**）
- `get_holiday_attendance_report(start, end)`：简化为「谁申请了在红日子上班」一句话查询，不再算排班/打卡

**前端 LeaveHub 页面**（`src/pages/leave/LeaveHub.jsx`，单页 5 tab）
- 我的假期 / 休假申请 / 休息日出勤 / 红日出勤(admin) / 团队台账(admin)
- 全部 5 tab 都接通真实数据
- 团队台账：日本/中国筛选 + A→Z 排序 + 余额调整能写 `leave_balance_adjustments`
- 红日出勤：默认查今天起 6 个月，按红日子分组显示申请人
- 代休明细：手动清零或不足时按 FIFO 把多余记录标"已抵消"，不再显示倒计时
- Sidebar 加菜单「假期管理」，正/契/admin/超管可见，baito/外部不可见
- 移动端管理员 tab 自动拆两行（桌面保持单行）

## 待做 ⏳

**等用户先补完数据**（用户原话：「员工档案里的入职日期和过往休假记录我还没改完」）
- 入职日期补全：影响年假批次计算
- 过往休假记录补全：影响"已用"统计
- 1 名员工 `employees.region` 字段为空（团队台账「未分类」按钮提醒）

**用户补完后再跑（Batch D 破坏性操作，必须显式放行）**
- 跑 `sync_holiday_overlaps` 给所有正/契员工生成红日补休历史记录
- 补 `day_swap_requests.deadline` 空值（按 365 天回填）
- 术语迁移：`UPDATE leave_requests/day_swap_requests` 把日语字段值统一成中文
  （承認→已通过 / 有休→年假 / 赤日休→红日补休 / 換休→换休 / 休日出勤→休息日出勤 ...）
- 删 `leave_balances` 表（0 行无写入）
- 清理 `leave_requests` 5 条重复 RLS，加 1 条 delete policy
- 同次发布去掉 `AttendanceList.jsx` 里的假期相关 4 个 tab（带薪休假申请/红日子记录/换休申请/过去记录）+ 团队假期总览
- 删除迁移完成后，可以清掉 RPC 函数里的日语兼容分支

**Phase 2.5 顺手活**
- `Dashboard.jsx`（首页）的年假余额还在用旧 `leave_balances` 查询，要改成 `get_leave_summary`
- spec 2.4 提到团队台账「每行可点击展开看该员工详情」，目前没做

## 关键决定（与 spec 偏离）

- 「義務残」**不**改成中文「强制消化」，按用户要求保留日语（觉得"强制消化"难听）
- 6 个 page 文件 + Sidebar 二级菜单 → 改成 1 个 LeaveHub + 内 5 tab（用户选）
- 红日补休 25-04 之前的不算（起算日 = 2026-04-01）

## 关键测试数据

- 王麒皓：两条已配对换休记录，代休余额=0（验证 swap_date 已填=已用逻辑）
- 曾培伟：4 条池子全空 → 代休余额 0 是对的（如果他实际有代休需要手动调整一下）
