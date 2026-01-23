# Header 固定修复 - 使用 Sticky 方案

## 方案说明

根据用户要求，使用 **position: sticky**（优先sticky）方案。

关键点：
1. Header 使用 `position: sticky` 在滚动容器顶部
2. AppShell 使用 flex column 布局
3. html/body 禁止滚动（overflow: hidden）
4. 只有 main 容器滚动

## 验证脚本

在浏览器 Console 执行：

```javascript
// 1. 确认 document 不滚动
console.log('scrollingElement:', document.scrollingElement);
console.log('document.scrollTop:', document.scrollingElement.scrollTop);
console.log('body.scrollTop:', document.body.scrollTop);

// 2. 确认 Header 元素存在
const header = document.querySelector('[data-app-header]');
console.log('Header found:', !!header);
if (header) {
  const cs = getComputedStyle(header);
  console.log('Header position:', cs.position);
  console.log('Header top:', cs.top);
  console.log('Header z-index:', cs.zIndex);
}

// 3. 确认 Main 滚动容器
const mainScroll = document.querySelector('[data-main-scroll]');
console.log('Main scroll found:', !!mainScroll);
if (mainScroll) {
  const cs = getComputedStyle(mainScroll);
  console.log('Main overflow-y:', cs.overflowY);
  console.log('Main scrollTop:', mainScroll.scrollTop);
  console.log('Main scrollHeight:', mainScroll.scrollHeight);
  console.log('Main clientHeight:', mainScroll.clientHeight);
}

// 4. 滚动测试
if (mainScroll) {
  console.log('Before scroll - Header top:', header?.getBoundingClientRect().top);
  mainScroll.scrollTop = 100;
  console.log('After scroll - Header top:', header?.getBoundingClientRect().top);
  // Header top 应该始终为 0（或接近0）
}
```
