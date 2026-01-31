# DNS 配置说明

## 🎯 需要添加的 DNS 记录

为了让 **BizNexus Staging** 环境正常工作，需要在 Cloudflare 添加 DNS 记录。

### ✅ 添加步骤

1. **登录 Cloudflare**
   - 访问：https://dash.cloudflare.com
   - 选择域名：`seisei.tokyo`

2. **添加 A 记录**

   点击 "DNS" → "Add record"，填写：

   | 字段 | 值 |
   |------|-----|
   | Type | A |
   | Name | `staging.biznexus` |
   | IPv4 address | `54.65.127.141` |
   | Proxy status | ✅ Proxied (橙色云朵) |
   | TTL | Auto |

3. **保存记录**

   点击 "Save" 保存

### ⏱️ 生效时间

- **Proxied（代理模式）**: 通常 1-5 分钟生效
- **DNS Only**: 可能需要 5-30 分钟

### ✅ 验证 DNS 生效

在终端执行（Mac/Linux）：
```bash
# 方法 1: 使用 dig
dig staging.biznexus.seisei.tokyo

# 方法 2: 使用 nslookup
nslookup staging.biznexus.seisei.tokyo

# 方法 3: 使用 ping
ping staging.biznexus.seisei.tokyo
```

看到 IP 地址 `54.65.127.141`（或 Cloudflare 的代理 IP）就表示生效了。

### 🌐 访问测试

DNS 生效后，访问：
```
https://staging.biznexus.seisei.tokyo
```

应该能看到 BizNexus 的登录页面。

---

## 📋 完整的域名列表

配置完成后，系统会有以下域名：

### Staging 环境（测试）
- `staging.erp.seisei.tokyo` - Odoo 后台（✅ 已配置）
- `staging.biznexus.seisei.tokyo` - BizNexus 前端（⚠️ 需要添加 DNS）

### Production 环境（生产）
- `biznexus.seisei.tokyo` - BizNexus 前端（✅ 已配置）
- `*.erp.seisei.tokyo` - Odoo 多租户（✅ 已配置）
- `demo.nagashiro.top` - Odoo 客户自定义域名（✅ 已配置）
- `testodoo.seisei.tokyo` - Odoo 测试租户（✅ 已配置）

---

## 🔧 如果遇到问题

### DNS 不生效
1. 检查 Cloudflare 中 DNS 记录是否保存成功
2. 确认 Proxy status 为 "Proxied"（橙色云朵）
3. 清除本地 DNS 缓存：
   ```bash
   # Mac
   sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder

   # Windows
   ipconfig /flushdns

   # Linux
   sudo systemd-resolve --flush-caches
   ```

### SSL 证书问题
- Traefik 会自动通过 Cloudflare DNS Challenge 获取 SSL 证书
- 通常在 DNS 生效后 1-2 分钟内自动完成
- 可以在服务器查看证书状态：
  ```bash
  docker logs traefik | grep staging.biznexus
  ```

---

## 📞 需要帮助？

如果 DNS 配置有问题，请：
1. 截图 Cloudflare DNS 配置
2. 提供错误信息（浏览器显示的错误）
3. 联系技术团队协助排查
