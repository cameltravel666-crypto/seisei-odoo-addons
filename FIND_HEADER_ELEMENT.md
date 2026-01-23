# 查找 Header 元素 - 调试脚本

## 问题

Console 诊断显示 `[data-app-header]` 元素未找到，但代码中确实有这个属性。

## 更精确的查找脚本

在 Console 运行以下脚本，找到实际的 Header 元素：

```javascript
(() => {
  // 方法1: 直接查找所有可能的 header 元素
  const candidates = [
    document.querySelector('[data-app-header]'),
    document.querySelector('.app-header'),
    document.querySelector('header'),
    ...Array.from(document.querySelectorAll('[class*="header"]')),
    ...Array.from(document.querySelectorAll('[class*="Header"]')),
  ].filter(Boolean);
  
  console.log('候选 Header 元素:', candidates);
  
  // 方法2: 查找包含 "Seisei BizNexus" 文本的直接父元素
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );
  
  let node;
  const textNodes = [];
  while (node = walker.nextNode()) {
    if (node.textContent.trim().includes('Seisei BizNexus')) {
      textNodes.push(node);
    }
  }
  
  console.log('包含标题的文本节点:', textNodes);
  if (textNodes.length > 0) {
    const parent = textNodes[0].parentElement;
    console.log('文本节点的父元素:', parent);
    console.log('父元素标签:', parent?.tagName);
    console.log('父元素类名:', parent?.className);
    console.log('父元素的 data 属性:', parent?.getAttributeNames().filter(n => n.startsWith('data')));
    console.log('父元素的计算样式 position:', parent ? getComputedStyle(parent).position : 'N/A');
    
    // 向上查找，找到最外层的容器
    let container = parent;
    while (container && container !== document.body) {
      const cs = getComputedStyle(container);
      console.log(`层级 ${container.tagName}.${container.className}: position=${cs.position}, overflow=${cs.overflow}`);
      container = container.parentElement;
    }
  }
  
  // 方法3: 查找所有 div 元素，检查是否有固定的样式
  const allDivs = Array.from(document.querySelectorAll('div'));
  const fixedDivs = allDivs.filter(div => {
    const cs = getComputedStyle(div);
    return cs.position === 'fixed' || cs.position === 'sticky';
  });
  console.log('所有 position: fixed/sticky 的元素:', fixedDivs);
  
  // 方法4: 查找 .app-shell 容器
  const appShell = document.querySelector('.app-shell');
  console.log('.app-shell 元素:', appShell);
  if (appShell) {
    console.log('.app-shell 的子元素:', Array.from(appShell.children).map(child => ({
      tag: child.tagName,
      className: child.className,
      dataAttrs: child.getAttributeNames().filter(n => n.startsWith('data')),
    })));
  }
  
  return {
    candidates,
    textNodes: textNodes.length,
    fixedDivs: fixedDivs.length,
    appShell: !!appShell,
  };
})();
```

## 简化版本（快速检查）

```javascript
// 快速查找
const header = document.querySelector('[data-app-header]') || 
               document.querySelector('.app-header') ||
               document.querySelector('header');

console.log('Header 元素:', header);
if (header) {
  console.log('标签:', header.tagName);
  console.log('类名:', header.className);
  console.log('data 属性:', header.getAttributeNames().filter(n => n.startsWith('data')));
  console.log('position:', getComputedStyle(header).position);
}

// 查找 .app-shell
const appShell = document.querySelector('.app-shell');
console.log('.app-shell:', appShell);
if (appShell) {
  console.log('子元素数量:', appShell.children.length);
  Array.from(appShell.children).forEach((child, i) => {
    console.log(`子元素 ${i}:`, child.tagName, child.className);
  });
}
```
