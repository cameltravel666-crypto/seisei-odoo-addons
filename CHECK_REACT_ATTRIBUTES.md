# React Data 属性检查

## 问题

重启后仍然找不到 `[data-app-header]` 和 `[data-main-scroll]` 元素。

## 可能的原因

React/Next.js 可能在某些情况下移除或转换 data 属性。

## 检查方法

### 1. 检查属性是否正确写入

在代码中：
```tsx
<div data-app-header="mobile">  // ✅ 正确
<main data-main-scroll>         // ✅ 正确
```

### 2. 检查是否有 TypeScript 类型问题

有时 TypeScript 会报错导致属性被忽略。检查是否有类型错误：

```bash
npm run build
# 查看是否有 TypeScript 错误
```

### 3. 检查是否有其他 layout 文件

```bash
find src/app -name "layout.tsx" -type f
```

应该只有两个：
- `src/app/layout.tsx` (根 layout)
- `src/app/(app)/layout.tsx` (应用 layout)

### 4. 检查文件路径是否正确

确认当前路由 `/home` 是否在 `(app)` 分组下：

```bash
find src/app -name "page.tsx" | grep home
```

应该返回：`src/app/(app)/home/page.tsx`

### 5. 检查是否有条件渲染

检查 `Navigation` 组件或 `AuthInitializer` 是否有条件渲染导致元素未渲染。

## 临时解决方案

如果 data 属性被移除，可以尝试使用类名作为选择器：

1. 修改 CSS 选择器：
```css
/* 从 */
[data-app-header]

/* 改为 */
.app-header
```

2. 修改诊断脚本：
```javascript
// 从
document.querySelector('[data-app-header]')

// 改为
document.querySelector('.app-header')
```
