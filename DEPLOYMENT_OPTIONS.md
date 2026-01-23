# 选择部署方案

## 当前情况

iOS 模拟器仍然显示旧代码，因为：
- Capacitor 配置指向：`https://biznexus.seisei.tokyo`（生产服务器）
- 本地 Docker 只在本地运行（localhost:3000）
- **修改没有部署到实际的生产服务器**

## 方案 1: 部署到生产服务器（推荐）

### 需要的信息：
1. 生产服务器地址和访问权限
2. 部署方式（SSH、Docker、CI/CD 等）

### 常见部署方式：

#### A. 如果有 SSH 访问权限
```bash
# 1. 导出 Docker 镜像
docker save seiseierp-app:latest | gzip > seiseierp-app.tar.gz

# 2. 上传到服务器
scp seiseierp-app.tar.gz user@biznexus.seisei.tokyo:/path/to/

# 3. 在服务器上加载并运行
ssh user@biznexus.seisei.tokyo
docker load < seiseierp-app.tar.gz
docker-compose up -d
```

#### B. 如果使用 Git + CI/CD
```bash
git add .
git commit -m "Fix: Header fixed positioning + Typography tokens"
git push origin main
# CI/CD 会自动部署
```

#### C. 如果使用 Docker Registry
```bash
docker tag seiseierp-app:latest your-registry/seiseierp-app:latest
docker push your-registry/seiseierp-app:latest
# 在服务器上 pull 并重启
```

## 方案 2: 临时修改 Capacitor 指向本地（仅测试）

修改 `capacitor.config.ts` 指向本地 Docker：

```typescript
// capacitor.config.ts
server: {
  url: 'http://localhost:3000',  // 改为本地
  cleartext: true,               // 允许 http
  androidScheme: 'http',
}
```

然后：
```bash
npx cap sync
```

重新打开 iOS 模拟器中的应用。

**注意**: 这只是测试用，实际生产环境仍需方案 1。

## 下一步

**请告诉我：**
1. 你有生产服务器的访问权限吗？
2. 生产服务器使用什么部署方式？
3. 或者，先用方案 2 在本地测试？
