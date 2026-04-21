---
name: 全站 UI 风格 — 玻璃质感 (glassmorphism)
description: 早稲田理工塾勤怠系统的统一设计语言：半透明玻璃卡 + ambient glow + 柔和线条图标 + 胶囊按钮
type: feedback
originSessionId: 1d413994-acdc-41c5-940d-3c77e2c1adc4
---
从 2026-04-21 管理面板改版起，所有新设计默认沿用这套风格，不要回到硬边 flat 卡片。

**Why:** 用户在 Gemini 原型稿里看到这套玻璃质感后明确要求作为全站风格。参照实现见 `commit 30b20eb`，CSS 类定义在 `index.html` 的全局 `<style>` 块。

**How to apply:**
- **布局容器**：加 `.glass-card`（半透明白底 + `backdrop-filter: blur(20px)` + border-radius 24 + 软阴影）。色相变体 `.hv-emerald/.hv-rose/.hv-amber` 悬停时染边框。
- **氛围背景**：用 `.home-ambient` + `-tl/-br` 类放两团彩色 blur 光斑（蓝 + 薄荷），`position: absolute` 挂在页面容器里，`z-index: 0`，内容 z-index: 1。
- **按钮**：小圆形操作按钮用 `.icon-btn`（白底 + 圆 + 边框 + 悬停变蓝）；主要动作按钮用 `.pill-btn`（蓝胶囊 + 阴影），次要动作用 `.pill-btn.ghost`。
- **打卡/动作大按钮**：用 `.clock-btn` 基础类 + `.clock-btn-lg/md` 尺寸 + `.ac/.wn/.gn/.pp` 色相变体。悬停时 icon 放大、边框染色，点击有 scale 动效。
- **字体风格**：标题用 300-500 细字重 + letterSpacing 拉开（`.04em~.2em`），弱文字用 slate-400 (#94a3b8)，避免粗 bold 压迫感。大数字用 300 字重 + 32px+，搭配小单位 sub。
- **数字大屏**：时间/数字等用 `font-family: monospace` + 大字号 + 细字重。
- **图标**：用 lucide-react，`strokeWidth={1.5}` 为主，重点突出时才用 1.8-2。
- **色彩**：主色蓝 `#3b82f6`，辅助色 emerald/rose/amber/violet 的 500 色阶；弱化时用 slate-300/400。
- **组件级样式仍写内联**（项目约定），涉及 blur / gradient / keyframes / hover 伪类等复杂效果放全局 CSS 类。新 class 定义都加到 `index.html` 的 `<style>` 块里，不要新建 CSS 文件，也不要引入 Tailwind。
- **暗色模式兼容**：新 class 基本是固定白/浅色，只用在首页这种明亮场景。勤怠一览、承认中心等暗色下也要用的页面仍走 `t.*` 主题变量。如果某个页面两种模式都要 glass 风，用 CSS 变量 + theme 设置在 root 上切换。
