---
name: Baito 打卡照片 Google Drive 上传系统（OAuth 方案）
description: 打卡照片存储位置、edge function 名、secrets 名、认证方式
type: reference
---

baito 老师每月提交工资报表时上传两张打卡照片。照片存到个人 Google Drive 指定文件夹，Drive file id 存到 `monthly_report_submissions.photo_{1,2}_drive_id`，前端用代理 edge function 显示（不走 drive.google.com 直链，因为 `drive.file` scope 下设不了 anyone-with-link）。

**认证方案：OAuth refresh_token（非 Service Account）**
起因：SA 自己没 Drive 存储配额，上传个人 Drive 必报 403 "Service Accounts do not have storage quota"。改走 OAuth，文件归老师本人账号所有，占老师个人 Drive 配额（15GB+）。

**Edge Functions（deployed）：**
- `upload-clock-photo` (verify_jwt=true) — 前端 POST FormData，返回 `{ id, webViewLink }`
- `get-clock-photo` (verify_jwt=false) — `<img src>` 直接用 `?id={driveId}` 拉图片

**Supabase Secrets：**
- `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` / `GOOGLE_OAUTH_REFRESH_TOKEN` — OAuth 凭证
- `GDRIVE_FOLDER_ID` = `1HjlC0oMXhJW4loPjR9GXR-qwRSLSh_0g`
- 历史遗留可删：`GDRIVE_SA_CLIENT_EMAIL`, `GDRIVE_SA_PRIVATE_KEY`（已不读）

**Google Cloud 项目：** `radiant-math-494103-b3`
- OAuth Client 类型：Web application
- Authorized redirect URIs 含：`https://developers.google.com/oauthplayground`
- OAuth Consent Screen 里 Test users 加了拥有 Drive 文件夹的 Google 账号
- Scope 使用：`https://www.googleapis.com/auth/drive.file`

**文件命名：** `{员工名}_{YYYY-MM}_{slot 1|2}_{timestamp}.jpg`

**前端压缩：** `src/utils/compressImage.js`（canvas → JPEG，≤500KB 最长边 1600px）

**重要 RLS 陷阱：** `monthly_report_submissions` 的 staff UPDATE policy 的 with_check 必须包含 draft/submitted/unlocked 所有状态；早先只含 submitted 导致 draft 状态下的 PATCH 静默失败、photo id 和 note 都存不进去。

**想在新项目复刻？** 看 `docs/google-drive-上传攻略.md` 全套步骤。
