---
name: 敏感/台账类页面默认只读
description: 给与、税务、签约等"一错就难救"的页面默认要 readOnly，显式「编辑」按钮进入修改态
type: feedback
---

涉及钱/合同/税务的管理员台账页，**默认状态所有字段 readOnly / select disabled**，只有点"编辑"按钮才能改。

**Why：** 用户明说"我怕手误"。给与明细页这种表格横向 30+ 列，不小心在路过时敲一下键盘就可能改掉数字，还不一定马上发现。

**How to apply：**
- 页面 state 加 `const [editing, setEditing] = useState(false)`
- 所有 `<input>` 加 `readOnly={!editing}`、`<select>` 加 `disabled={!editing}`
- CSS 给 `[readonly]`/`[disabled]` 去焦点环、去边框、`cursor: default`
- 顶栏按钮三态：默认「编辑」；进入编辑态换成「取消 / 保存」；保存成功后自动退出编辑
- 取消时如有脏数据要 confirm；保存失败不 reload（保留脏数据让用户再试）
- 行内操作按钮（+片段 / 🗑删除）也只在编辑态显示

对应场景：PayrollManager.jsx。未来类似的页（税务信息重做 / 扶养控除专门页）也走这套。

对应反例（不用此模式）：勤怠打卡、请假申请、签单录入等员工自助的日常操作页 —— 快是主要诉求，加编辑门槛反而烦。
