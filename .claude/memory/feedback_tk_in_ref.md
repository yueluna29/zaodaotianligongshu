---
name: 页面 reload 用 tkRef 不直接依赖 tk
description: 带 token 的 useCallback 不要把 tk 放进 deps，否则 token 每 50min / 切 tab 就清数据
type: feedback
---

新页面里如果有 `reload` / `fetch` 类 `useCallback`，**不要把 `tk` 放进 deps 数组**。用 `tkRef` 拿最新 token。

```jsx
const tkRef = useRef(tk)
useEffect(() => { tkRef.current = tk }, [tk])

const reload = useCallback(async () => {
  const tok = tkRef.current
  await sbGet(..., tok)
}, [year, month, companyId])  // 没有 tk
```

**Why：** App.jsx 每 50 min + 切 tab 回来都会 `sbRefresh` → 新 token → `login({...user, token: ...})` → `user` 对象重建 → `tk = user.token` 变了 → 若 reload 依赖 tk，整页会重新 fetch，用户的未保存编辑全被 reload 冲掉，滚动位置也丢。payroll 页就踩过，用户投诉"切 tab 回来就闪回表头"。

**How to apply：** 只要页面有"长时间停留，admin 一边编辑一边可能切 tab"的场景，就上 tkRef。短交互的页（打卡、提交请假）无所谓。save 函数里也用 `tkRef.current` 拿最新 token（save 是偶发动作，不需要闭包旧 tk）。
