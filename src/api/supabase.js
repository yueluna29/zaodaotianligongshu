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

// 调用 Edge Function，body 是 FormData（multipart）。
export async function sbFn(name, formData, token) {
  const r = await fetch(`${SB}/functions/v1/${name}`, {
    method: "POST",
    headers: { apikey: AK, Authorization: `Bearer ${token}` },
    body: formData,
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
