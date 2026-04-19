# 早稲田理工塾 勤怠管理系统

React + Vite 前端 + Supabase 后端的内部勤怠/工资管理系统。两家关联公司共用：**世家学舍**、**紫陽花教育**。

## 技术栈
- React 18（函数组件 + hooks，无 TypeScript）
- Vite 构建
- Supabase（PostgREST + Auth + RLS）
- 样式：**内联 style 对象**，从全局 `theme` 对象 `t` 取色（`t.ac` 主色、`t.tx` 主文字、`t.tm` 次文字、`t.td` disabled、`t.bgC` 卡片底、`t.bd` 边框、`t.bl` 浅边框、`t.gn` 绿、`t.rd` 红、`t.wn` 黄、`t.we` 周末底色等）。没用 Tailwind / CSS modules，不要引入。
- 图标：`lucide-react`

## 部署 & 工作流
- **仓库直接推到 `origin/main` 触发自动部署**，用户通过线上查看效果。每次完成修改后默认 commit + push，不要再单独问。
- 测试/构建验证：没配 CI，本地也没装依赖。用 `npx --yes esbuild --bundle=false --loader:.jsx=jsx <file>.jsx > /dev/null 2>&1 && echo OK` 做语法检查。
- commit 信息风格：`feat(scope): ...` / `fix(scope): ...` / `style(scope): ...`，中英混合，正文解释"为什么"。

## Supabase
- 项目 ref：`cssnsgdawdhrkrmztuas`
- MCP 调用用 **`supabase_2`** 实例（`mcp__claude_ai_supabase_2__*`），不是 `supabase` 也不是 `WadeOS_supabase`（那些是别的项目）
- 前端访问封装在 `src/api/supabase.js`：`sbAuth / sbGet / sbPost / sbPatch / sbDel`。POST 默认带 `Prefer: return=representation,resolution=merge-duplicates`（用于 upsert）
- 认证走 login_id 方案：登录 ID → `{id}@juku.local` 伪邮箱喂给 Supabase Auth，真实邮箱存在 `raw_user_meta_data.real_email`
- RLS 关键：`employees_update` 允许用户 update 自己 (`auth_user_id = auth.uid()`)，所以自助注册后客户端能 PATCH 自己的完整档案
- 新用户触发器 `handle_new_user` 只写 `auth_user_id, email, login_id, name, hire_date, role`，其它字段靠前端在 signup 之后 PATCH

## 关键表
- `employees` — 员工档案（字段详见 `src/pages/employee/EmployeeManager.jsx` 的 `emptyForm`）
- `attendance_records` — 勤怠记录（`employee_id + work_date` 唯一），首页打卡与 `勤怠一览` 共享同一行
- `work_schedules` — 按 `employee_id × day_of_week(0-6)` 索引的班次模板
- `leave_requests` / `day_swap_requests` — 请假 / 换休，有 `status` 流转
- `commissions` — 签单提成
- `pay_rates` / `transportation_claims` / `expense_claims` / `work_entries` / `compensatory_leave_log`
- `japanese_holidays` — **实际存多国节日**，有 `country` 列（`JP` / `CN`），复合唯一 `(holiday_date, country)`

## 主要功能分布
| 菜单 | 文件 |
|---|---|
| 首页（时钟 + 打卡 + 统计） | `src/pages/home/Dashboard.jsx` |
| 勤怠一览 | `src/pages/attendance/AttendanceList.jsx` |
| 工时录入 / 报销 / 签单提成 tab | `src/pages/workentry/WorkEntryManager.jsx` |
| 请假申请 | `src/pages/leave/LeaveRequest.jsx` |
| 换休申请 | `src/pages/leave/DaySwapRequest.jsx` |
| 出勤/休假日历（今日/周/月） | `src/pages/leave/LeaveCalendar.jsx` |
| 签单录入（员工自服务） | `src/pages/commission/CommissionEntry.jsx` |
| 交通费 / 报销 | `src/pages/transport/TransportLog.jsx` / `src/pages/expense/ExpenseClaim.jsx` |
| 人事档案 | `src/pages/employee/EmployeeManager.jsx` |
| 审批中心 | `src/pages/approval/ApprovalCenter.jsx` |
| 月度报表 | `src/pages/report/MonthlyReport.jsx` |
| 登录 / 4 步入职向导 | `src/pages/auth/Login.jsx` |

## 关键业务规则
- **雇佣类型**：`正社員 / 契約社員 / アルバイト / 外部講師`
- **首页打卡按钮** 只对 `正社員` 和 `契約社員` 显示（不论是否 admin）；按钮流转：出勤 → 开始休息+退勤 → 休息结束 → 退勤 → 辛苦了
- **入职流程**：不走共享邀请码，改成**两条 URL 邀请链接**（token 在 `src/pages/auth/Login.jsx` 顶部 `INVITE_TOKENS`）：
  - `full` token → `正社員 / 契約社員`
  - `pt` token → `アルバイト / 外部講師`
- 注册是 4 步向导（账号 → 个人 → 工作 → 银行，银行必填）；`My Number`、合同日期、签单提成率等由管理员在签合同时补录
- 管理员首页有"待完善档案"列表，显示 `contract_start_date` 或 `my_number` 为空的员工

## 代码习惯
- 不写多余注释，WHAT 由命名表达；只在 WHY 非显而易见时写一行注释
- 不加兼容层、不加防御式校验；只在系统边界验证
- UI 文案默认不加 emoji（除非用户显式要求）
- 不新建文件除非必要，优先改现有文件
- 勿运行破坏性命令（`rm -rf`、`git reset --hard`、`--force`）除非用户明确要求

## 本地开发提示
- 没有 `.env` 文件。Supabase URL / anon key 硬编码在 `src/api/supabase.js`（anon key，public 合理）
- 依赖装了再跑：`npm install && npm run dev`
