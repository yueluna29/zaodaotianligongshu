---
name: Edge Function 前端调用用 anon key，不用 user.token
description: 本项目 Edge Function 的 Authorization Bearer 固定走 anon key；user access_token 会过期踩坑
type: project
---

前端调用 Supabase Edge Function 时，`Authorization: Bearer <token>` **固定用 anon key**，而不是从 `user.token` 里取出来的 user access_token。`src/api/supabase.js` 里的 `sbFn(name, formData, token)` 默认落到 anon key（`token || AK`）。

**Why:** `user.token` 是登录时从 Supabase Auth 拿的 access_token，默认 1 小时过期。`useAuth.js` 把它塞进 localStorage 就不再刷新。过了 1h 再打 Edge Function，verify_jwt 层会直接 401，函数体都不执行。REST API（PostgREST）的 401 在此架构下会触发前端 `localStorage.removeItem("kintai_session") + reload`，所以用户感知不到过期；但 Edge Function 调用没有这层兜底，所以过期特别容易暴露。anon key 本身也是合法 JWT，同样过 verify_jwt，而且 exp 是 2090 年。

**How to apply:**
- 写新 Edge Function 调用时，前端不要传 `tk`，默认走 anon key
- Edge Function 里如果需要用户身份，从前端 form / body 明确带员工 id 或其它标识，不要依赖 JWT claim
- 以后如果要真查用户身份，得先解决 localStorage 里 access_token 的刷新问题（需接入 refresh_token 流程），在此之前 anon key 是权宜也是最稳的方案
