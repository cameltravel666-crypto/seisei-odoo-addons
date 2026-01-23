# 部署到生产环境 - Header 修复

## 当前情况

- iOS 模拟器指向生产服务器：`https://biznexus.seisei.tokyo`
- 本地修改还没有部署到生产环境
- 需要构建并部署才能看到修复效果

## 部署步骤

### 1. 构建生产版本

```bash
cd "/Users/taozhang/Projects/Seisei ERP"

# 清除缓存
rm -rf .next

# 构建生产版本
npm run build
```

### 2. 部署到服务器

根据你的部署方式，选择以下之一：

#### 方案 A: 如果使用 Docker

```bash
# 构建 Docker 镜像
npm run docker:build

# 部署
npm run docker:up
```

#### 方案 B: 如果使用 SSH 部署

```bash
# 假设你有部署脚本
./deploy.sh

# 或者手动 rsync
rsync -avz --exclude 'node_modules' --exclude '.next' \
  ./ user@biznexus.seisei.tokyo:/path/to/app/

# 然后在服务器上
ssh user@biznexus.seisei.tokyo
cd /path/to/app
npm install
npm run build
pm2 restart app
```

### 3. 验证部署

部署完成后：

1. 在 iOS 模拟器刷新页面（下拉刷新）
2. 或重新启动 Capacitor 应用

3. 在 Safari 开发者工具 Console 运行：
```javascript
console.log('React root:', document.getElementById('__next') ? '✅' : '❌');
console.log('.app-shell:', document.querySelector('.app-shell') ? '✅' : '❌');
console.log('[data-app-header]:', document.querySelector('[data-app-header]') ? '✅' : '❌');
```

## 修改摘要

以下修改需要部署到生产环境：

### 1. src/app/(app)/layout.tsx
- 使用 `dynamic` import 强制客户端渲染 Navigation
- 避免 hydration 不匹配

### 2. src/app/globals.css
- 完善 Typography Tokens
- Header 使用 sticky 定位
- AppShell 和 Main 滚动容器样式

### 3. src/components/layout/nav.tsx
- 添加 data-app-header 属性

## 部署后验证清单

- [ ] 页面能正常加载
- [ ] React root (#__next) 存在
- [ ] .app-shell 元素存在
- [ ] [data-app-header] 元素存在
- [ ] [data-main-scroll] 元素存在
- [ ] 滚动时 Header 保持固定
- [ ] iOS 下拉回弹时 Header 不移动

## 注意事项

1. **确保 Node.js 版本一致** - 生产环境和本地应该使用相同的 Node.js 版本
2. **检查环境变量** - 生产环境的环境变量是否正确配置
3. **数据库连接** - 确保生产环境能连接到数据库
4. **日志检查** - 部署后检查服务器日志是否有错误
