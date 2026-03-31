import { useState } from "react"

export function useAuth() {
  const [user, setUser] = useState(() => {
    try {
      const s = localStorage.getItem("kintai_session")
      return s ? JSON.parse(s) : null
    } catch {
      return null
    }
  })

  const login = (u) => {
    localStorage.setItem("kintai_session", JSON.stringify(u))
    setUser(u)
  }

  const logout = () => {
    localStorage.removeItem("kintai_session")
    setUser(null)
  }

  return { user, login, logout }
}
