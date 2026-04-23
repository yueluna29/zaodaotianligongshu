---
name: Baito 老师入职页上传系统
description: Onboarding 页面走的 edge function、文件夹白名单、触发条件
type: reference
---

新 baito 老师注册后（Quick Mode）会被强制进入 `src/pages/onboarding/Onboarding.jsx` 填资料并上传两份 PDF。

**触发条件**（App.jsx guard）：`role != 'admin' && employment_type ∈ {アルバイト, 外部講師} && onboarding_completed_at IS NULL`。完成后 PATCH `onboarding_completed_at = now()` 解锁菜单。

**Edge Function**: `upload-onboarding-file` (verify_jwt=true)
- 复用同一套 OAuth secrets（`GOOGLE_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN`）
- FormData 带 `file / filename / folder`；`folder` 走函数内 whitelist，不从 secret 读
- 返回 `{ id, webViewLink }`
- **不**设 anyone-with-link（在留卡含 PII，管理员通过拥有文件夹的 Google 账号直接看 webViewLink）

**文件夹白名单**（hardcode 在 edge function 源码里）：
- `zairyuu` → `1Mnae-ZztjacJT3PLpyyAWkfSYKlB21BC` 紫阳花_老师在留卡
- `student` → `1Nz2vzDulKhmwGPsuxoEqQicLcJcwzdfw` 紫阳花_老师学生证等

**文件命名**：`{员工name}_{suffix}.pdf`，例如 `张三_在留卡正反面.pdf`

**DB 新列**（employees）：
- `residence_card_drive_id`、`student_doc_drive_id`（两份 PDF 的 drive id）
- `declared_hourly_rate`（建表时留下的列，目前 UI 已撤掉，时薪由 admin 后台直接录到 `pay_rates`；列暂未删）
- `onboarding_note`、`onboarding_completed_at`
- `bank_branch_code`（支店番号，Login 4 步向导也能填但没在界面加字段）

**历史 baito 已回填**：migration `add_onboarding_columns_to_employees` 的 UPDATE 已把所有 existing baito 的 `onboarding_completed_at` 设为 now()，老人不会被骚扰。
