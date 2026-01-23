# Hydration 错误修复

## 问题确认

诊断显示：
- ❌ React root (#__next) 不存在
- ❌ .app-shell 不存在
- ❌ data-main-scroll 不存在

这是 **Next.js Hydration 失败**，客户端没有接管服务端渲染的 HTML。

## 检查步骤

### 1. 检查浏览器 Console 是否有错误

查看 Console 中是否有：
- Hydration mismatch 错误
- JavaScript 错误
- React 错误

常见的 hydration 错误信息：
```
Warning: Expected server HTML to contain a matching <div> in <div>
Warning: Text content did not match
Hydration failed because the initial UI does not match what was rendered on the server
```

### 2. 检查是否有 suppressHydrationWarning

有时某些动态内容（如时间、随机数）会导致 hydration 不匹配。

### 3. 临时禁用 SSR 测试

创建一个测试页面，禁用 SSR：

```tsx
// src/app/(app)/test/page.tsx
'use client';

export default function TestPage() {
  return (
    <div className="app-shell bg-red-500" style={{ padding: '20px' }}>
      <div data-app-header style={{ background: 'blue', color: 'white', padding: '10px' }}>
        Test Header
      </div>
      <main data-main-scroll style={{ background: 'green', color: 'white', padding: '10px' }}>
        Test Main Content
      </main>
    </div>
  );
}
```

访问 `/test`，在 Console 运行：
```javascript
console.log('app-shell:', document.querySelector('.app-shell'));
console.log('data-app-header:', document.querySelector('[data-app-header]'));
console.log('data-main-scroll:', document.querySelector('[data-main-scroll]'));
```

如果这个页面可以找到元素，说明问题出在 layout 的服务端渲染。

## 快速修复尝试

### 方案 1: 强制客户端渲染 Navigation

修改 `src/app/(app)/layout.tsx`：

```tsx
import dynamic from 'next/dynamic';

// 强制客户端渲染 Navigation
const Navigation = dynamic(
  () => import('@/components/layout/nav').then(mod => ({ default: mod.Navigation })),
  { ssr: false }
);

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // ... 其他代码不变
  
  return (
    <AuthInitializer session={session} modules={visibleModules.map(...)}>
      <div className="app-shell bg-[var(--color-bg-page)]">
        <Navigation />
        <main data-main-scroll className="app-main-scroll md:pl-64">
          <div className="p-[var(--page-padding-x)] md:p-[var(--space-6)] pb-20 md:pb-6">
            {children}
          </div>
        </main>
      </div>
    </AuthInitializer>
  );
}
```

### 方案 2: 添加 suppressHydrationWarning

如果是因为动态内容导致的 hydration 不匹配，可以添加：

```tsx
<div className="app-shell bg-[var(--color-bg-page)]" suppressHydrationWarning>
  <Navigation />
  <main data-main-scroll className="app-main-scroll md:pl-64" suppressHydrationWarning>
    {/* ... */}
  </main>
</div>
```

## 下一步

请：
1. 检查浏览器 Console 是否有错误信息（截图发我）
2. 尝试方案 1（强制客户端渲染 Navigation）
3. 或创建测试页面验证

告诉我结果，我会继续协助修复。
