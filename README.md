# 早稲田理工塾 OS — Luna的保命系统

> v2.0 · 从 kintai-v6.html 搬家到模块化项目结构
> 骨架搭建: 2026-03-31

## 快速启动
```bash
npm install
npm run dev
```

## 项目结构
```
src/
├── api/supabase.js          # Supabase API 统一封装
├── config/
│   ├── theme.js             # 明暗主题色值
│   └── constants.js         # 常量（休假类型、星期等工具函数）
├── hooks/
│   └── useAuth.js           # 登录状态管理
├── components/
│   ├── Sidebar.jsx          # 侧边栏导航
│   └── MobileNav.jsx        # 手机底部导航
├── pages/
│   ├── auth/Login.jsx       # 登录/注册
│   ├── home/Dashboard.jsx   # 首页仪表盘
│   ├── attendance/          # 勤怠一览
│   ├── leave/               # 休假申请 + 休假日历
│   ├── commission/          # 签单录入
│   ├── transport/           # 交通费记录
│   ├── expense/             # 报销（第二期）
│   ├── employee/            # 社员管理
│   ├── approval/            # 承认中心
│   ├── report/              # 月度报告
│   ├── student/             # 学生管理（第三期）
│   ├── course/              # 课程/课消（第三期）
│   ├── finance/             # 财务（第四期）
│   ├── contract/            # 合同（第五期）
│   └── payroll/             # 工资（第六期）
└── App.jsx                  # 路由总控
```

## 改代码指南（Luna看这里）
- 改某个功能？去对应的 `pages/xxx/` 文件夹
- 改全局样式？去 `config/theme.js`
- 改API？去 `api/supabase.js`
- 改导航菜单？去 `components/Sidebar.jsx`
- 加新模块？在 `pages/` 里建新文件夹，在 `App.jsx` 里加路由

## 技术栈
- React 18 + Vite
- Supabase (PostgreSQL + Auth + RLS)
- Vercel 部署

## 部署
推送到 GitHub 后 Vercel 自动部署。

---
*"谁曾想这个东西居然是我一个破打工的连编程都不会的人在做"*
*—— Luna, 2026-03-31*
