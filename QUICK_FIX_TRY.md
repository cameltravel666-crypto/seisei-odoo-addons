# 快速修复尝试 - 直接测试

## 问题

重启后仍然找不到 `.app-shell` 和 `[data-app-header]` 元素。

## 快速验证方案

让我们尝试一个最简化的测试，确认问题所在。

### 方案 1: 在 Console 验证 React 渲染

```javascript
// 检查 React 根容器
const root = document.getElementById('__next');
console.log('React root:', root);
console.log('Root innerHTML (前100字符):', root?.innerHTML.substring(0, 100));

// 检查是否有任何 div.app-shell
const allDivs = Array.from(document.querySelectorAll('div'));
const appShellCandidates = allDivs.filter(div => 
  div.className && div.className.includes('app-shell')
);
console.log('包含 app-shell 类的 div:', appShellCandidates.length);
if (appShellCandidates.length > 0) {
  console.log('第一个匹配:', appShellCandidates[0]);
  console.log('类名:', appShellCandidates[0].className);
}

// 检查是否有任何带 data-main-scroll 的元素
const allElements = Array.from(document.querySelectorAll('*'));
const dataMainScroll = allElements.filter(el => 
  el.hasAttribute('data-main-scroll')
);
console.log('带 data-main-scroll 的元素:', dataMainScroll.length);
```

### 方案 2: 临时修改代码测试

如果上面的验证显示元素确实不存在，让我们测试一下是否是 `AuthInitializer` 导致的问题。

临时修改 `src/app/(app)/layout.tsx`，移除 `AuthInitializer` 包装：

```tsx
// 临时测试版本
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect('/login');
  }

  // const visibleModules = await getVisibleModules(session.userId, session.tenantId);

  return (
    // 临时移除 AuthInitializer
    <div className="app-shell bg-[var(--color-bg-page)]">
      <div data-test-header style={{ background: 'red', padding: '20px', color: 'white' }}>
        测试 Header - 如果看到这个说明 layout 工作了
      </div>
      <main
        data-main-scroll
        className="app-main-scroll md:pl-64"
      >
        <div className="p-[var(--page-padding-x)] md:p-[var(--space-6)] pb-20 md:pb-6">{children}</div>
      </main>
    </div>
  );
}
```

保存后刷新页面，在 Console 运行：
```javascript
console.log('app-shell:', document.querySelector('.app-shell') ? '✅ 找到' : '❌ 未找到');
console.log('data-main-scroll:', document.querySelector('[data-main-scroll]') ? '✅ 找到' : '❌ 未找到');
console.log('data-test-header:', document.querySelector('[data-test-header]') ? '✅ 找到' : '❌ 未找到');
```

如果这个测试版本可以找到元素，说明问题出在 `AuthInitializer` 或 `Navigation` 组件。
