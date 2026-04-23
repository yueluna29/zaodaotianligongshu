---
name: 改 login_id 一次性额度机制
description: 用户改登录ID 走 service-role edge function；employees.login_id_changed_at 锁额度
type: reference
---

每个社员都可以改自己的 login_id，但**只能改一次**。

**额度判定**：`employees.login_id_changed_at IS NULL` 才允许改。改成功后写 `now()`，前端再开弹窗会显示锁定状态、按钮隐藏。

**Edge Function**：`change-login-id`（verify_jwt=true，但内部用 service_role 执行）
- 流程：取 user.id 自带 token → 查 employees 行 → 校验 changed_at 为空 → 校验新 ID 不重复 → admin API `PUT /auth/v1/admin/users/{userId}` 改 email = `{newId}@juku.local`（带 `email_confirm: true` 跳过邮件验证，否则 fake email 发不出去也确认不了）→ PATCH employees 写新 login_id + changed_at
- 失败 code：`already_changed / same_id / id_taken / invalid_format / not_found / auth_update_failed / employee_patch_failed`
- 前端 `ChangeLoginIdModal.jsx` 按 code map 中文提示

**为什么必须 service-role**：普通 `sbUpdateUser({ email })` 会触发 Supabase Auth 的邮件确认流程，但 `@juku.local` 收不到也确认不了。admin API + `email_confirm:true` 直接落库，绕过确认。

**改完后**：当前 access_token 仍有效（token 里只有 user_id 不含 email），但用户必须用新 ID 重登才能继续认证。Modal 设 3 秒后自动调 `onLogout()` 强制踢出。

**入口**：Sidebar 底部"改密码 / 改ID"两栏；mobile 头部"密码 / 改ID / 退出"三按钮。
