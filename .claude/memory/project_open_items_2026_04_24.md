---
name: 2026-04-24 进度快照
description: 4/23-4/24 通宵迭代的结果；还欠的功能 + 需要 admin 人肉跟进的数据
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

## 📝 还欠的功能（可以接着做）

### 高优先
- **税务与合同信息重做**：当前只超管能看，用户说要重新设计。重做完去掉 `isSuperAdmin(user)` 守卫就行
- **扶养控除专门页**：用户明确提过"之后专门做一个"。学生老师常申请勤劳学生控除等，要独立于入职向导
- **正/契 入职向导**：当前只 baito 有 Quick Mode，正/契依旧是 4 步完整向导但没整合入职手续页

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
