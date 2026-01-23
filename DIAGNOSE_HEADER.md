# Header 滚动问题诊断

## 快速诊断脚本

在浏览器 Console 中运行以下代码，然后将结果给我：

```javascript
(() => {
  const result = {
    scrollingElement: {
      tagName: document.scrollingElement?.tagName,
      scrollTop: document.scrollingElement?.scrollTop,
    },
    header: (() => {
      const el = document.querySelector('[data-app-header]');
      if (!el) return { found: false };
      const cs = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        found: true,
        position: cs.position,
        top: cs.top,
        boundingRectTop: rect.top,
        zIndex: cs.zIndex,
      };
    })(),
    mainScroll: (() => {
      const el = document.querySelector('[data-main-scroll]');
      if (!el) return { found: false };
      return {
        found: true,
        overflowY: getComputedStyle(el).overflowY,
        scrollTop: el.scrollTop,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      };
    })(),
    scrollTest: (() => {
      const header = document.querySelector('[data-app-header]');
      const mainScroll = document.querySelector('[data-main-scroll]');
      if (!header || !mainScroll) return { error: 'Elements not found' };
      const beforeTop = header.getBoundingClientRect().top;
      mainScroll.scrollTop = 100;
      const afterTop = header.getBoundingClientRect().top;
      mainScroll.scrollTop = 0;
      return {
        headerTopBefore: beforeTop,
        headerTopAfter: afterTop,
        headerMoved: Math.abs(afterTop - beforeTop) > 1,
      };
    })(),
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
})();
```

## 或者直接回答这些问题：

1. **滚动时标题栏会移动吗？**
   - 是 / 否

2. **在 iPhone 模拟器中，向下拖拽时标题栏会跟着移动吗？**
   - 是 / 否

3. **Console 运行 `document.querySelector('[data-app-header]')` 能找到元素吗？**
   - 能 / 不能

4. **Console 运行 `getComputedStyle(document.querySelector('[data-app-header]')).position` 返回什么？**
   - 返回的值：_______

5. **Console 运行 `document.scrollingElement.scrollTop` 在滚动时是否为 0？**
   - 是 / 否（如果是，值是多少）

6. **Console 运行 `document.querySelector('[data-main-scroll]').scrollTop` 在滚动时是否会变化？**
   - 是 / 否

## 可能的原因

根据之前的实现，如果标题栏还会滚动，可能是以下原因：

1. **Header 不在滚动容器内，但使用了 sticky**
   - Sticky 需要在滚动容器内才能工作
   - 如果 Header 在 AppShell 内但不在 main 滚动容器内，sticky 不会工作

2. **祖先元素有 transform/filter/backdrop-filter**
   - 这些 CSS 属性会导致 position: sticky/fixed 失效

3. **document 仍在滚动**
   - html/body 的 overflow: hidden 没有生效
   - 或者有其他地方覆盖了样式

4. **Header 的 position 没有被正确应用**
   - CSS 被其他样式覆盖
   - 或者 data-app-header 选择器没有命中

## 下一步

请提供诊断脚本的输出结果，或回答上面的问题，我会根据结果提供针对性的修复方案。
