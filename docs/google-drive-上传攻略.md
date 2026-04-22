# 网站调用 Google Drive 上传的完整攻略

针对场景：**个人 Google 账号**的 Drive（不是 Google Workspace），通过 **Supabase Edge Function** 做上传，前端用 `<img>` 显示。可复用到 WadeOS 等其他项目。

---

## 0. 方案选型（先看这个）

| 方案 | 适用 | 坑 |
|---|---|---|
| Service Account（SA） | Google Workspace + Shared Drive | **个人 Drive 用不了**：SA 没存储配额 → 403 |
| OAuth refresh_token | 个人 Google 账号 / 任何场景 | 首次配置稍复杂 |
| 把文件存 Supabase Storage | 不一定需要 Drive | 最简单，不用折腾 Google |

**本攻略用 OAuth refresh_token。** 如果只是要个免费对象存储、不 insist 要 Drive，直接用 Supabase Storage 省心 10 倍。

---

## 1. Google Cloud Console 配置

### 1.1 建 / 选 GCP 项目
https://console.cloud.google.com/ 左上角项目切换 → 新建一个或用已有的。

### 1.2 开 Drive API
https://console.cloud.google.com/apis/library/drive.googleapis.com → **启用**。

### 1.3 OAuth 同意屏
https://console.cloud.google.com/auth/overview（新版叫 Google Auth Platform）

- **品牌塑造**：应用名、支持邮箱、开发者邮箱随便填
- **目标对象（Audience）**：选 **External**；"测试用户"里把**拥有目标 Drive 文件夹的 Google 账号**加进去

### 1.4 建 OAuth Client ID
左边 "客户端 / Credentials" → 创建

- 类型：**Web application**
- 名字：随便
- **Authorized redirect URIs**：加一行
  ```
  https://developers.google.com/oauthplayground
  ```
- 创建后会显示 **Client ID** + **Client Secret**，抄下来（Secret 关了再看得回去但略麻烦）

---

## 2. 拿 refresh_token（一次性）

打开 https://developers.google.com/oauthplayground/

1. 右上 ⚙️ → 勾 **Use your own OAuth credentials** → 粘 Client ID / Secret → Close
2. 左边 "Input your own scopes" 里粘：
   ```
   https://www.googleapis.com/auth/drive.file
   ```
   > `drive.file` = 应用只能访问自己上传的文件，最小权限。**足够**。
3. 点 **Authorize APIs** → 用拥有 Drive 文件夹的账号登录
4. 看到 "此应用未经 Google 验证" → 左下 **Advanced** → **Go to (unsafe)** 继续
5. 授权
6. 跳回 Playground，点 **Exchange authorization code for tokens**
7. 复制 **Refresh token**（以 `1//` 开头的长串），保管好

> ⚠️ 如果**没**在 Playground 里用"自己的 OAuth credentials"，Google 会在 24 小时后撤销这个 refresh_token。用自己的 credentials 就不会。

---

## 3. 目标 Drive 文件夹

从 Drive 里找到文件夹 → URL 里的一串 id：
```
https://drive.google.com/drive/folders/1HjlC0oMXhJW4...
                                      ^^^^^^^^^^^^^^^^
                                      这部分就是 folder id
```

**不需要 share 给任何人** —— 因为我们用你自己账号的 token，文件直接归你所有。

---

## 4. Supabase Secrets

Dashboard → Edge Functions → Secrets，加 4 条：

| Name | Value |
|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` | Step 1.4 的 Client ID |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Step 1.4 的 Client Secret |
| `GOOGLE_OAUTH_REFRESH_TOKEN` | Step 2 的 refresh_token |
| `GDRIVE_FOLDER_ID` | Step 3 的 folder id |

---

## 5. Edge Function 代码

两个函数：一个上传 (`upload-file`) 一个代理读取 (`get-file`)。后者 `verify_jwt: false` 才能被 `<img src>` 直接引用。

### 5.1 上传函数 `upload-file/index.ts`

```ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

async function getAccessToken(): Promise<string> {
  const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")!
  const clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")!
  const refreshToken = Deno.env.get("GOOGLE_OAUTH_REFRESH_TOKEN")!
  const body = new URLSearchParams({
    client_id: clientId, client_secret: clientSecret,
    refresh_token: refreshToken, grant_type: "refresh_token",
  })
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error("refresh failed: " + JSON.stringify(data))
  return data.access_token
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
  if (req.method !== "POST") return new Response("method not allowed", { status: 405, headers: CORS })
  try {
    const folderId = Deno.env.get("GDRIVE_FOLDER_ID")!
    const form = await req.formData()
    const file = form.get("file") as File | null
    const filename = form.get("filename") as string | null
    if (!file || !filename) {
      return new Response(JSON.stringify({ error: "missing file or filename" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } })
    }

    const token = await getAccessToken()
    const boundary = "----upload" + crypto.randomUUID()
    const metadata = { name: filename, parents: [folderId] }
    const head = new TextEncoder().encode(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify(metadata) + `\r\n` +
      `--${boundary}\r\nContent-Type: ${file.type || "image/jpeg"}\r\n\r\n`
    )
    const fileBytes = new Uint8Array(await file.arrayBuffer())
    const tail = new TextEncoder().encode(`\r\n--${boundary}--\r\n`)
    const body = new Uint8Array(head.length + fileBytes.length + tail.length)
    body.set(head, 0); body.set(fileBytes, head.length); body.set(tail, head.length + fileBytes.length)

    const uploadRes = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink&supportsAllDrives=true",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
        body,
      },
    )
    const uploadText = await uploadRes.text()
    let uploaded: Record<string, unknown> = {}
    try { uploaded = JSON.parse(uploadText) } catch { /**/ }
    if (!uploadRes.ok || !uploaded.id) {
      return new Response(JSON.stringify({ error: "upload failed", status: uploadRes.status, detail: uploadText.slice(0, 500) }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } })
    }

    return new Response(JSON.stringify({ id: uploaded.id, webViewLink: uploaded.webViewLink }),
      { headers: { ...CORS, "Content-Type": "application/json" } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error)?.message || e) }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } })
  }
})
```

部署时 `verify_jwt: true`。

### 5.2 代理读取函数 `get-file/index.ts`

```ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
}

async function getAccessToken(): Promise<string> {
  const body = new URLSearchParams({
    client_id: Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")!,
    client_secret: Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")!,
    refresh_token: Deno.env.get("GOOGLE_OAUTH_REFRESH_TOKEN")!,
    grant_type: "refresh_token",
  })
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error("refresh failed: " + JSON.stringify(data))
  return data.access_token
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
  if (req.method !== "GET") return new Response("method not allowed", { status: 405, headers: CORS })
  try {
    const id = new URL(req.url).searchParams.get("id")
    if (!id || !/^[a-zA-Z0-9_-]{10,100}$/.test(id)) {
      return new Response("invalid id", { status: 400, headers: CORS })
    }
    const token = await getAccessToken()
    const driveRes = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } })
    if (!driveRes.ok) {
      return new Response("drive fetch failed: " + driveRes.status, { status: driveRes.status, headers: CORS })
    }
    return new Response(driveRes.body, {
      headers: {
        ...CORS,
        "Content-Type": driveRes.headers.get("Content-Type") || "image/jpeg",
        "Cache-Control": "public, max-age=300",
      },
    })
  } catch (e) {
    return new Response(String((e as Error)?.message || e), { status: 500, headers: CORS })
  }
})
```

部署时 **`verify_jwt: false`**（`<img src>` 没法发 Authorization header）。

> 安全边界：任何人知道 file id 都能读这个文件。实际里 file id 存在 DB 里，DB 的 RLS 已经控制谁能读；猜 file id（33 位随机）实际不可行。

---

## 6. 前端调用代码

### 6.1 图片压缩（可选，强烈推荐）
```js
// utils/compressImage.js
export async function compressImage(file, maxKB = 500, maxDim = 1600) {
  const img = await loadImage(file)
  let { width, height } = img
  const longSide = Math.max(width, height)
  if (longSide > maxDim) {
    const s = maxDim / longSide
    width = Math.round(width * s); height = Math.round(height * s)
  }
  const canvas = document.createElement("canvas")
  canvas.width = width; canvas.height = height
  canvas.getContext("2d").drawImage(img, 0, 0, width, height)
  let q = 0.9, blob = await toBlob(canvas, q)
  while (blob.size > maxKB * 1024 && q > 0.3) { q -= 0.1; blob = await toBlob(canvas, q) }
  return blob
}
const loadImage = (f) => new Promise((res, rej) => {
  const img = new Image()
  img.onload = () => res(img); img.onerror = rej
  img.src = URL.createObjectURL(f)
})
const toBlob = (c, q) => new Promise((r) => c.toBlob(r, "image/jpeg", q))
```

### 6.2 上传
```js
const SB = "https://<你的项目>.supabase.co"
const AK = "<你的 anon key>"

async function uploadToDrive(file, filename) {
  const blob = await compressImage(file)
  const fd = new FormData()
  fd.append("file", blob, filename)
  fd.append("filename", filename)
  const r = await fetch(`${SB}/functions/v1/upload-file`, {
    method: "POST",
    headers: { apikey: AK, Authorization: `Bearer ${AK}` },  // ⚠️ 用 anon key 不用 user.token
    body: fd,
  })
  return r.json()  // { id, webViewLink }
}
```

> **为什么用 anon key 不用 user access_token？** Supabase Auth 的 user access_token 默认 1h 过期，localStorage 不会自动续。Edge Function verify_jwt 层看到过期 token 直接 401，体验很差。anon key 也是合法 JWT 而且 exp 是 2090 年。如果非要用户身份，在 body/form 里明确带 user id，在函数里自己验证。

### 6.3 显示
```jsx
<img src={`${SB}/functions/v1/get-file?id=${driveFileId}`} alt="..." />
```

---

## 7. RLS 配置要点

如果要把 file id 存到 Supabase 表里，RLS policy 的 **USING** 和 **WITH CHECK** 都要检查过。尤其 **WITH CHECK** 要允许你 UPDATE 后的行状态（容易忘）。

> 我们踩过的坑：policy 的 with_check 写 `status = 'submitted'`，结果 draft 状态下 PATCH 一律被拒，整个保存逻辑静默失败。

---

## 8. 常见坑 & 排查

| 症状 | 真因 |
|---|---|
| 401 at edge function | user access_token 过期 → 改用 anon key |
| 500 missing XXX | Supabase secret 没设或名字拼错 |
| 403 "Service Accounts do not have storage quota" | 用了 SA 上传个人 Drive → 换 OAuth refresh token |
| 200 但 DB 没存 id | RLS with_check 拦住后续 PATCH |
| 上传 OK 但 `<img>` 显示不出来 | 直连 drive.google.com 需要 anyone-with-link；`drive.file` scope 设不了 → 用代理函数 |
| refresh_token 24h 后失效 | Playground 里没用"自己的 OAuth credentials"；重新来一遍并在 ⚙️ 里勾选 |
| 登录时看到 "This app isn't verified" 无法继续 | 没把测试账号加进 OAuth Consent Screen 的 Test users |

---

## 9. 部署 checklist

- [ ] Drive API 启用
- [ ] OAuth Consent Screen 配好（External + Test user）
- [ ] OAuth Client（Web）含 Playground 重定向 URI
- [ ] refresh_token 获取成功（用自己 credentials）
- [ ] 4 个 Supabase Secret 设好
- [ ] 2 个 Edge Function 部署（upload verify_jwt=true / get verify_jwt=false）
- [ ] DB 表里加一列存 file id（如果需要持久化）
- [ ] RLS 政策允许 INSERT / UPDATE 这一列的流程
- [ ] 前端调用用 anon key
- [ ] 前端 `<img>` 用 `get-file?id=` URL

全部打勾 = 能跑。
