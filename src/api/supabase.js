const SB = "https://cssnsgdawdhrkrmztuas.supabase.co"
const AK = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzc25zZ2Rhd2RocmtybXp0dWFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4NTQ0ODAsImV4cCI6MjA5MDQzMDQ4MH0.kgIhio0JuzprooZQXGg7zLmiOAMLbJjJCs58sKnCB58"

export async function sbAuth(path, body) {
  const r = await fetch(`${SB}/auth/v1/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: AK },
    body: JSON.stringify(body),
  })
  return r.json()
}

// 已登录用户更新自己的密码（或其它 user_metadata）。需要有效 access_token。
export async function sbUpdateUser(body, token) {
  const r = await fetch(`${SB}/auth/v1/user`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", apikey: AK, Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  return r.json()
}

export async function sbGet(path, token) {
  const r = await fetch(`${SB}/rest/v1/${path}`, {
    headers: { apikey: AK, Authorization: `Bearer ${token}` },
  })
  if (r.status === 401 || r.status === 403) {
    localStorage.removeItem("kintai_session")
    window.location.reload()
    return []
  }
  const j = await r.json()
  return Array.isArray(j) ? j : []
}

export async function sbPost(table, body, token, extra = "") {
  const r = await fetch(`${SB}/rest/v1/${table}${extra}`, {
    method: "POST",
    headers: {
      apikey: AK,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation,resolution=merge-duplicates",
    },
    body: JSON.stringify(body),
  })
  return r.json()
}

export async function sbPatch(path, body, token) {
  const r = await fetch(`${SB}/rest/v1/${path}`, {
    method: "PATCH",
    headers: {
      apikey: AK,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  })
  return r.json()
}

export async function sbDel(path, token) {
  await fetch(`${SB}/rest/v1/${path}`, {
    method: "DELETE",
    headers: { apikey: AK, Authorization: `Bearer ${token}` },
  })
}

// 调用 Edge Function。body 支持 FormData 或 plain object（JSON）。
// token：省略则走 anon key（大多数场景推荐）。需要 edge function 内部验证用户身份时传 user.token。
// 用户 access_token 1h 过期，localStorage 不自动续期；对不需要身份的函数用 anon key 更稳。
export async function sbFn(name, body, token) {
  const isForm = body instanceof FormData
  const r = await fetch(`${SB}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      apikey: AK,
      Authorization: `Bearer ${token || AK}`,
      ...(isForm ? {} : { "Content-Type": "application/json" }),
    },
    body: isForm ? body : JSON.stringify(body),
  })
  return r.json()
}

// 调用 Postgres RPC 函数。token 可省略（匿名调用，用 anon key 鉴权）
export async function sbRpc(fn, body, token) {
  const r = await fetch(`${SB}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: AK,
      Authorization: `Bearer ${token || AK}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body || {}),
  })
  return r.json()
}
