---
name: 2026-04-24 进度快照
description: 4/23-4/24 全天迭代的结果；还欠的功能 + 需要 admin 人肉跟进的数据
type: project
---

## ✅ 今天已完成（4/23 晚 → 4/24 凌晨）

**入职流程**
- 新建 `src/pages/onboarding/Onboarding.jsx` —— baito 注册后强制进入，上传在留卡 PDF + 学生证 PDF 到 Drive，文件名带时间戳防覆盖
- 部署 `upload-onboarding-file` edge function，folder 白名单 zairyuu/student
- DB 加：residence_card_drive_id、student_doc_drive_id、onboarding_note、onboarding_completed_at

**Parser（5 种 Excel 模板全兼容）**
- 学部/教务：填写示例 + 以上为书写格式 双标记跳过
- 大学院/咨询：无标记，跳首条数据行
- 老模板：列名"授業科目"也认，不跳任何行
- 跨夜（end < start）自动 +24h，显示"次日"小标签
- 对账警告 ±2 円容差屏蔽 Excel FP 精度噪音
- 班课绩效读 Excel 值时，只对 EJU 业务行生效

**身份/会话**
- 改 login_id 功能（1 次额度）：`change-login-id` edge fn + `login_id_changed_at`
- 超级管理员 = `login_id=luna`（硬编码在 `config/constants.js`）
- 维护模式：`system_state` 表 + RLS 仅超管可写，其他人被全屏锁定
- Token 自动续期（挂载 + 每 50min + tab 切回），根治"编辑 1h+ 后保存数据全没"
- 本地草稿缓存：WorkEntryManager / UploadTable 未保存行自动存 localStorage，下次进页 confirm 恢复

**一键上传页升级**
- 加提交月报按钮（共享 monthly_report_submissions，两边互通）
- 加打卡照片卡（共享 photo_1/2_drive_id）
- 28h 警报 + 月末提交倒计时 双/三卡并排，glass-card 风格
- 业务内容下拉只显示自己的工种（rateOptions 过滤）
- 班课绩效改为 EJU 自申报 checkbox（仅 EJU業務 行可勾，固定 +¥300/h）
- UploadTable 整页 UI 重做（Gemini 参谋版）：玻璃卡表格 + 输入框聚焦高光 + 合計徽章 pill

**首页 baito 3 张新卡**
- 最近 7 天累计（28h 合规）
- 提交月报双按钮（按日记录 → work / 一键上传 → upload）
- 档案完善度 banner（带百分比 + 缺失字段 tag）
- **外国籍额外：在留卡期限卡** ——  未填/将到期红色提醒，点更新开 UpdateResidenceCardModal 上传新 PDF + 改期限

**档案→薪资与税务重排**
- 时薪配置 → 银行账户（银行提前）
- 税务与合同信息块：超管 luna 可见，其他人隐藏（等重做）

**打卡照片不再强制提交月报**（baito 线上老师无打卡需求）

**UI 收尾打磨（凌晨最后一轮）**
- 在留卡提醒判断改为 `nationality !== "日本"`（空字符串 / null 也提醒，TESTER 测试能看到）
- 顶部三卡数字字号 26 → 34，打卡 tile 从方形 aspectRatio 改成固定 height 60，三卡高度一致不再空旷
- 手机版：年月切换 + 上传/导出按钮换行后右对齐；底部合計徽章也右对齐
- 底部汇总的"班课绩效"条件从 `showBonus` 收紧为 `rows.some(EJU_TYPE)`，没 EJU 行就不显示
- "給与総額" → "基本给"（= Σ hours×hourly_rate，不含交通费/绩效）

---

## ✅ 4/24 下午/晚上续迭代

**紧急 bug 修复**
- **整站频闪死循环**：App.jsx token 自动续期 effect deps 错写 `[user?.refreshToken]`，而 Supabase 每次 refresh 返回新 refresh_token → effect 重跑 → 再 refresh → 死循环每秒全树 re-render。改用 `userRef` + deps=`[user?.id]` 根治
- **普通管理员菜单收窄 → 回放勤怠一览**：先上了白名单 `{home, empmgr, approve, cal}`，刘/方老师反映需要「勤怠一览」记录自己勤怠 → 加回（白名单变 `{home, att, empmgr, approve, cal}`）

**给与明细页（超管专属，新）**：详见 `project_payroll_feature.md`
- payroll_slips 表 + 超管专属 RLS（login_id='luna'）
- 一行 = 一个支付片段，同员工同月可 N 行，支持日元/国内/微信/支付宝等拆分
- 源泉自动算（R8 税額表 甲欄 0 人，仅 baito/外部）
- 上报金额从当月 work_entries 自动预填
- 默认只读，点「编辑」才能改 + 保存失败保留脏数据 + 错误弹窗
- 玻璃风 UI（Gemini 参谋版）+ sticky 两级表头 + 左 4 列 rowSpan
- 三层守卫：菜单 / 路由字典 / RLS

**关联的跨页技术改进**
- 「用 tkRef 而不是 tk 依赖」模式 —— 见 `feedback_tk_in_ref.md`
- 「敏感台账页默认只读」模式 —— 见 `feedback_readonly_default_for_sensitive_pages.md`

## 📝 还欠的功能（可以接着做）

### 高优先
- **税务与合同信息重做**：当前只超管能看，用户说要重新设计。重做完去掉 `isSuperAdmin(user)` 守卫就行
- **扶养控除专门页**：用户明确提过"之后专门做一个"。学生老师常申请勤劳学生控除等，要独立于入职向导
- **正/契 入职向导**：当前只 baito 有 Quick Mode，正/契依旧是 4 步完整向导但没整合入职手续页
- **给与明细 · 扶养 > 0 人 / 乙欄**：目前 R8 表只做了甲欄 0 人。如果哪个 baito 有扶养或明确乙欄，得扩表 + 接 `employees.dependents_count`

### 中优先
- **一键上传 Phase 3 — 导出 Excel**：按学部/大学院两套模板布局生成 .xlsx，给社劳士用。当前"导出 Excel"按钮 disabled 占位
- **一键上传 Phase 4 — admin 批量工具**：批量解锁已提交、批量催未提交老师
- **WorkEntryManager 也套 Gemini UI 风格**：目前只 UploadTable 升级了玻璃卡表格，工资报表还是旧风格，不统一

### 低优先 / nice-to-have
- 保存按钮灰掉时加 tooltip 说明原因（"没有未保存的修改"）
- 首页日本籍 baito 空位再加一张卡（已讨论过本月收入预估，但没做）

## 🧍‍♀️ Admin 人肉跟进（非代码）

沿用 4/23 的清单（尚未完成的）：
- **卞含章时薪数据异常**：答疑做題 100000 / 研究計画書修改 20000（源表错，疑似月額误填）。需 admin 进档案确认修正
- **187 位 baito 未改默认密码**（123456）。侧边栏/手机版已有"改密码"按钮；需催或批量重置
- **75 位 baito 公司归属默认填了「紫陽花教育」**（大学院/学部匹配率 85-90%），少数可能实际世家学舍，人肉校对
- **22 位紫陽花入职表新增老师**：档案基础信息有，时薪还没填
- **汪印"宣传"分类**：不是标准 baito 部门，department=NULL，需确认归属
- **李桓舟**：login_id=lihuanzhou（单独补建）

## 登录相关

- 统一默认密码：`123456`
- admin 忘密码：`UPDATE auth.users SET encrypted_password = crypt('<新密码>', gen_salt('bf', 10)) WHERE email = '<login_id>@juku.local'`（cost=10）

**How to apply**：下次开场扫这个文件，优先从"还欠的功能 - 高优先"开始；Admin 人肉清单那块是老项目债，完成一条划一条。
