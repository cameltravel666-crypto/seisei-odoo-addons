# 深度诊断 - Header 未找到问题

## 情况

重启服务器并重新构建后，问题仍然存在：
- `[data-app-header]` 未找到
- `.app-shell` 未找到
- `[data-main-scroll]` 未找到

## 深度诊断脚本

请在 Console 运行以下脚本：

```javascript
(() => {
  console.log('=== 深度诊断开始 ===');
  
  // 1. 查找所有包含 "Seisei BizNexus" 的元素
  const allElements = Array.from(document.querySelectorAll('*'));
  const titleElements = allElements.filter(el => 
    el.textContent && el.textContent.includes('Seisei BizNexus')
  );
  
  console.log('1. 包含标题的元素数量:', titleElements.length);
  if (titleElements.length > 0) {
    const el = titleElements[0];
    console.log('  - 元素:', el);
    console.log('  - 标签:', el.tagName);
    console.log('  - 类名:', el.className);
    console.log('  - ID:', el.id);
    console.log('  - 所有属性:', Array.from(el.attributes).map(a => `${a.name}="${a.value}"`));
    
    // 向上查找祖先
    let parent = el;
    let level = 0;
    console.log('  - 祖先链:');
    while (parent && parent !== document.body && level < 10) {
      console.log(`    ${level}: ${parent.tagName}.${parent.className} id="${parent.id}"`);
      const attrs = Array.from(parent.attributes).filter(a => a.name.startsWith('data-'));
      if (attrs.length > 0) {
        console.log(`       data属性: ${attrs.map(a => `${a.name}="${a.value}"`).join(', ')}`);
      }
      parent = parent.parentElement;
      level++;
    }
  }
  
  // 2. 查找所有带 data- 属性的元素
  const dataElements = allElements.filter(el => 
    Array.from(el.attributes).some(a => a.name.startsWith('data-'))
  );
  console.log('2. 所有带 data- 属性的元素数量:', dataElements.length);
  console.log('  前10个:', dataElements.slice(0, 10).map(el => ({
    tag: el.tagName,
    class: el.className,
    attrs: Array.from(el.attributes).filter(a => a.name.startsWith('data-')).map(a => `${a.name}="${a.value}"`)
  })));
  
  // 3. 查找 body 的直接子元素
  console.log('3. body 的直接子元素:');
  Array.from(document.body.children).forEach((child, i) => {
    console.log(`  ${i}: ${child.tagName}.${child.className} id="${child.id}"`);
  });
  
  // 4. 查找 Next.js 根容器
  const nextRoot = document.getElementById('__next');
  console.log('4. Next.js 根容器 (#__next):', nextRoot ? '存在' : '不存在');
  if (nextRoot) {
    console.log('  - 子元素数量:', nextRoot.children.length);
    Array.from(nextRoot.children).forEach((child, i) => {
      console.log(`    ${i}: ${child.tagName}.${child.className}`);
    });
  }
  
  // 5. 检查是否有内联样式覆盖
  const header = document.querySelector('[data-app-header]');
  console.log('5. [data-app-header] 元素:', header ? '找到' : '未找到');
  
  const appShell = document.querySelector('.app-shell');
  console.log('6. .app-shell 元素:', appShell ? '找到' : '未找到');
  
  const mainScroll = document.querySelector('[data-main-scroll]');
  console.log('7. [data-main-scroll] 元素:', mainScroll ? '找到' : '未找到');
  
  console.log('=== 深度诊断结束 ===');
  
  return {
    titleElements: titleElements.length,
    dataElements: dataElements.length,
    bodyChildren: document.body.children.length,
    hasNextRoot: !!nextRoot,
    hasAppShell: !!appShell,
    hasHeader: !!header,
    hasMainScroll: !!mainScroll,
  };
})();
```

## 可能的问题

如果诊断显示：
1. **元素存在但没有 data 属性** → React 可能移除了属性
2. **找不到 .app-shell** → layout 文件没有被使用
3. **Next.js 根容器结构异常** → 可能有其他 layout 覆盖

请把诊断结果发给我，我会根据结果给出具体的修复方案。
