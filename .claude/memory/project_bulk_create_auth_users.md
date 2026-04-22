---
name: 直接 SQL 批量创建 Supabase Auth 用户的两个必修坑
description: INSERT INTO auth.users 时密码哈希 cost 必须 ≥10，且一堆默认可空字段实际 GoTrue 不允许 NULL
type: project
---

用 `INSERT INTO auth.users` + `auth.identities` 直接建账号时，**必须**满足两件事，不然账号建完了能看到但登录就报 `Database error querying schema (500)`：

## 1. 密码哈希必须 `$2a$10$` 以上

```sql
-- ❌ 错误：gen_salt('bf') 默认 cost=6，Supabase GoTrue 拒绝
crypt('123456', gen_salt('bf'))

-- ✅ 正确：显式指定 cost=10
crypt('123456', gen_salt('bf', 10))
```

## 2. 几个字段不能是 NULL，要空字符串

schema 里这些字段 `is_nullable='YES'` 但 GoTrue 扫描时 `sql: Scan error ... converting NULL to string is unsupported`：

- `confirmation_token`
- `recovery_token`
- `email_change_token_new`
- `email_change`
- `phone_change_token`
- `phone_change`
- `email_change_token_current`
- `reauthentication_token`

全部填 `''` 不要留 NULL。

## 修复脚本（补救已经建的账号）

```sql
UPDATE auth.users
SET encrypted_password = crypt('123456', gen_salt('bf', 10))
WHERE email LIKE '%@juku.local' AND encrypted_password LIKE '$2a$06$%';

UPDATE auth.users
SET confirmation_token = COALESCE(confirmation_token, ''),
    recovery_token = COALESCE(recovery_token, ''),
    email_change_token_new = COALESCE(email_change_token_new, ''),
    email_change = COALESCE(email_change, ''),
    phone_change_token = COALESCE(phone_change_token, ''),
    phone_change = COALESCE(phone_change, ''),
    email_change_token_current = COALESCE(email_change_token_current, ''),
    reauthentication_token = COALESCE(reauthentication_token, '')
WHERE email LIKE '%@juku.local';
```

## 诊断方法

测登录走 `curl /auth/v1/token?grant_type=password`，500 报 "Database error querying schema" → 去 `supabase_2__get_logs(service=auth)` 搜 "Scan error"，日志里会告诉你具体哪一列。

**How to apply:** 下次 MCP 批量建账号时：
1. 用已修好的 `bulk_create_baito_v2` 函数（已包含两个修复）
2. 新写类似函数时，密码一定用 `gen_salt('bf', 10)`，8 个 token 字段必须填 `''`
3. 建完立刻 curl 测一个账号能登录再继续
