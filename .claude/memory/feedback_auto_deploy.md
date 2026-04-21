---
name: 每次改完都 push 到 main
description: 在此项目完成代码修改后，默认 commit 并 push 到 origin/main，不必每次单独询问
type: feedback
originSessionId: 61c854dc-e23a-41ae-b8b8-2ee80781781c
---
在 zaodaotianligongshu 仓库完成任何代码修改后，默认直接 commit + push 到 origin/main。

**Why:** 用户通过线上部署查看效果（仓库配置了自动部署），不 push 就看不到改动。用户明确说过"每次做完都推吧，不然我看不到"。

**How to apply:** 完成编辑 → 语法检查通过 → `git add <files> && git commit -m ... && git push origin main`。commit 信息按项目既有风格（feat/fix 前缀，中英混合简述）。仍需遵守 git 安全协议：不强推、不跳 hook、不提交疑似密钥文件。如果改动涉及破坏性变更或用户未明说的重构，仍应在 push 前确认。
