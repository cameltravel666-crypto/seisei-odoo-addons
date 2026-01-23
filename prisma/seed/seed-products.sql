-- Subscription Products Seed Script
-- Run this on production database to populate subscription products

-- Base Plans (PLAN category)
INSERT INTO subscription_products (id, product_code, name, name_zh, name_ja, description, description_zh, description_ja, product_type, category, price_monthly, included_modules, max_users, max_terminals, trial_days, odoo19_product_id, sort_order, is_active, created_at, updated_at)
VALUES
  (gen_random_uuid()::text, 'SW-PLAN-START', 'Starter', '入门版', 'スターター', 'Basic POS features for small shops', '基础POS功能，适合小型店铺', '小規模店舗向けの基本POS機能', 'BASE_PLAN', 'PLAN', 0, ARRAY['DASHBOARD', 'POS'], 2, 1, 14, 36, 1, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'SW-PLAN-OPS-B', 'Ops Basic', '运营基础版', 'Ops ベーシック', 'For small to medium F&B businesses', '适合中小型餐饮店铺', '中小規模の飲食店向け', 'BASE_PLAN', 'PLAN', 9800, ARRAY['DASHBOARD', 'POS', 'INVENTORY'], 5, 2, 14, 37, 2, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'SW-PLAN-OPS-A', 'Ops Auto', '运营自动版', 'Ops オート', 'Automated operations for chain stores', '自动化运营，适合连锁店铺', 'チェーン店向けの自動化運営', 'BASE_PLAN', 'PLAN', 19800, ARRAY['DASHBOARD', 'POS', 'INVENTORY', 'PURCHASE'], 10, 5, 14, 38, 3, true, NOW(), NOW())
ON CONFLICT (product_code) DO UPDATE SET
  name = EXCLUDED.name,
  name_zh = EXCLUDED.name_zh,
  name_ja = EXCLUDED.name_ja,
  description = EXCLUDED.description,
  description_zh = EXCLUDED.description_zh,
  description_ja = EXCLUDED.description_ja,
  price_monthly = EXCLUDED.price_monthly,
  included_modules = EXCLUDED.included_modules,
  max_users = EXCLUDED.max_users,
  max_terminals = EXCLUDED.max_terminals,
  trial_days = EXCLUDED.trial_days,
  odoo19_product_id = EXCLUDED.odoo19_product_id,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

-- Module Products (MODULE category)
INSERT INTO subscription_products (id, product_code, name, name_zh, name_ja, description, description_zh, description_ja, product_type, category, price_monthly, included_modules, enables_module, odoo19_product_id, sort_order, is_active, created_at, updated_at)
VALUES
  (gen_random_uuid()::text, 'SW-MOD-CRM', 'Customer Management', '会员管理', '顧客管理', 'Loyalty points and coupon management', '会员积分、优惠券管理', 'ポイント・クーポン管理', 'MODULE', 'MODULE', 3000, ARRAY[]::text[], 'CRM', 42, 10, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'SW-MOD-CASH', 'Cash Book', '现金账簿', '現金出納帳', 'Daily cash transaction records', '现金收支记录', '現金収支の記録', 'MODULE', 'MODULE', 3000, ARRAY[]::text[], 'ACCOUNTING', 43, 11, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'SW-MOD-ACC-P', 'Accounting Pro', '会计专业版', '会計プロ', 'Professional accounting features', '专业会计功能', 'プロフェッショナル会計機能', 'MODULE', 'MODULE', 9800, ARRAY[]::text[], 'FINANCE', 44, 12, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'SW-MOD-ACC-E', 'Accounting Enterprise', '会计企业版', '会計エンタープライズ', 'Enterprise-grade accounting', '企业级会计功能', 'エンタープライズ級会計機能', 'MODULE', 'MODULE', 19800, ARRAY[]::text[], 'FINANCE', 45, 13, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'SW-MOD-PAY', 'Payroll', '工资管理', '給与計算', 'Employee payroll calculation', '员工工资计算', '従業員給与計算', 'MODULE', 'MODULE', 9800, ARRAY[]::text[], 'HR', 46, 14, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'SW-MOD-QR', 'QR Ordering', '扫码点餐', 'QRオーダー', 'QR ordering and table management', '桌台管理与扫码点餐', 'テーブル管理とQRオーダー', 'MODULE', 'MODULE', 14800, ARRAY[]::text[], 'QR_ORDERING', 39, 15, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'SW-MOD-RECPT', 'Receipt Issuance', '发票开具', '領収書発行', 'Electronic receipt issuance', '电子发票功能', '電子領収書発行', 'MODULE', 'MODULE', 3000, ARRAY[]::text[], NULL, 40, 16, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'SW-MOD-BI', 'Advanced BI Analytics', '高级数据分析', '高度なBI分析', 'Deep business insights and analytics', '深度商业洞察', '多次元分析、前年比較、売上予測', 'MODULE', 'MODULE', 12800, ARRAY[]::text[], 'BI', 41, 17, true, NOW(), NOW())
ON CONFLICT (product_code) DO UPDATE SET
  name = EXCLUDED.name,
  name_zh = EXCLUDED.name_zh,
  name_ja = EXCLUDED.name_ja,
  description = EXCLUDED.description,
  description_zh = EXCLUDED.description_zh,
  description_ja = EXCLUDED.description_ja,
  price_monthly = EXCLUDED.price_monthly,
  enables_module = EXCLUDED.enables_module,
  odoo19_product_id = EXCLUDED.odoo19_product_id,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

-- Terminal Products (TERMINAL category)
INSERT INTO subscription_products (id, product_code, name, name_zh, name_ja, description, description_zh, description_ja, product_type, category, price_monthly, included_modules, odoo19_product_id, sort_order, is_active, created_at, updated_at)
VALUES
  (gen_random_uuid()::text, 'SW-TERM-POS-ADD', 'Additional POS Terminal', 'POS追加终端', '追加POSターミナル', 'Additional POS terminal license', '额外POS终端许可', '追加POSターミナルライセンス', 'ADDON', 'TERMINAL', 1500, ARRAY[]::text[], 47, 20, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'SW-TERM-KDS', 'KDS License', 'KDS许可', 'KDSライセンス', 'Kitchen display system license', '厨房显示系统许可', 'キッチンディスプレイシステムライセンス', 'ADDON', 'TERMINAL', 3500, ARRAY[]::text[], 48, 21, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'SW-TERM-PRINTHUB', 'Print Hub', '打印中心', 'プリントハブ', 'Centralized print management', '打印管理中心', '印刷管理センター', 'ADDON', 'TERMINAL', 1980, ARRAY[]::text[], 49, 22, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'SW-TERM-PRN-ADD', 'Additional Print Endpoint', '追加打印端点', '追加プリントエンドポイント', 'Additional print endpoint', '额外打印端点', '追加印刷エンドポイント', 'ADDON', 'TERMINAL', 300, ARRAY[]::text[], 50, 23, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'SW-VAR-PAY-ADD', 'Additional Payroll Employee', '追加工资员工', '追加給与計算対象者', 'Additional employee for payroll', '额外工资计算员工', '追加給与計算対象従業員', 'ADDON', 'TERMINAL', 200, ARRAY[]::text[], 51, 24, true, NOW(), NOW())
ON CONFLICT (product_code) DO UPDATE SET
  name = EXCLUDED.name,
  name_zh = EXCLUDED.name_zh,
  name_ja = EXCLUDED.name_ja,
  description = EXCLUDED.description,
  description_zh = EXCLUDED.description_zh,
  description_ja = EXCLUDED.description_ja,
  price_monthly = EXCLUDED.price_monthly,
  odoo19_product_id = EXCLUDED.odoo19_product_id,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

-- Maintenance Services (MAINTENANCE category)
INSERT INTO subscription_products (id, product_code, name, name_zh, name_ja, description, description_zh, description_ja, product_type, category, price_monthly, included_modules, odoo19_product_id, sort_order, is_active, created_at, updated_at)
VALUES
  (gen_random_uuid()::text, 'SV-MNT-BASIC', 'Basic Maintenance', '基础运维', '基本メンテナンス', 'Basic technical support', '基础技术支持', '基本テクニカルサポート', 'SERVICE', 'MAINTENANCE', 980, ARRAY[]::text[], 61, 30, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'SV-MNT-ADV', 'Advanced Maintenance', '高级运维', '高度メンテナンス', 'Advanced support with priority response', '高级技术支持，优先响应', '優先対応付き高度サポート', 'SERVICE', 'MAINTENANCE', 2980, ARRAY[]::text[], 62, 31, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'SV-RPL', 'Express Replacement', '先出交换', 'エクスプレス交換', 'Quick device replacement service', '设备快速更换服务', '機器即時交換サービス', 'SERVICE', 'MAINTENANCE', 12000, ARRAY[]::text[], 63, 32, true, NOW(), NOW())
ON CONFLICT (product_code) DO UPDATE SET
  name = EXCLUDED.name,
  name_zh = EXCLUDED.name_zh,
  name_ja = EXCLUDED.name_ja,
  description = EXCLUDED.description,
  description_zh = EXCLUDED.description_zh,
  description_ja = EXCLUDED.description_ja,
  price_monthly = EXCLUDED.price_monthly,
  odoo19_product_id = EXCLUDED.odoo19_product_id,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

-- Onboarding Services (ONBOARDING category)
INSERT INTO subscription_products (id, product_code, name, name_zh, name_ja, description, description_zh, description_ja, product_type, category, price_monthly, included_modules, odoo19_product_id, sort_order, is_active, created_at, updated_at)
VALUES
  (gen_random_uuid()::text, 'SV-DEP-SELF', 'Self-guided Onboarding', '自助导入', 'セルフガイド導入', 'Self-guided system setup', '自助系统设置', 'セルフガイドシステムセットアップ', 'SERVICE', 'ONBOARDING', 0, ARRAY[]::text[], NULL, 39, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'SV-DEP-LITE', 'Lite Onboarding', '轻量导入', 'ライト導入', 'Basic system onboarding', '基础系统导入服务', '基本システム導入サービス', 'SERVICE', 'ONBOARDING', 50000, ARRAY[]::text[], 52, 40, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'SV-DEP-STD', 'Standard Onboarding', '标准导入', 'スタンダード導入', 'Standard system onboarding', '标准系统导入服务', '標準システム導入サービス', 'SERVICE', 'ONBOARDING', 150000, ARRAY[]::text[], 53, 41, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'SV-DEP-PRO', 'Professional Onboarding', '专业导入', 'プロフェッショナル導入', 'Professional system onboarding', '专业系统导入服务', 'プロフェッショナルシステム導入サービス', 'SERVICE', 'ONBOARDING', 300000, ARRAY[]::text[], 54, 42, true, NOW(), NOW())
ON CONFLICT (product_code) DO UPDATE SET
  name = EXCLUDED.name,
  name_zh = EXCLUDED.name_zh,
  name_ja = EXCLUDED.name_ja,
  description = EXCLUDED.description,
  description_zh = EXCLUDED.description_zh,
  description_ja = EXCLUDED.description_ja,
  price_monthly = EXCLUDED.price_monthly,
  odoo19_product_id = EXCLUDED.odoo19_product_id,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

-- Hardware Rental (RENTAL category)
INSERT INTO subscription_products (id, product_code, name, name_zh, name_ja, description, description_zh, description_ja, product_type, category, price_monthly, included_modules, odoo19_product_id, sort_order, is_active, created_at, updated_at)
VALUES
  (gen_random_uuid()::text, 'HW-L-PRN-80', 'Receipt Printer Rental', '小票打印机租赁', 'レシートプリンターレンタル', '80mm receipt printer monthly rental', '80mm小票打印机月租', '80mmレシートプリンター月額レンタル', 'HARDWARE', 'RENTAL', 690, ARRAY[]::text[], 58, 50, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'HW-L-KDS', 'KDS Terminal Rental', '厨显终端租赁', 'KDS端末レンタル', 'Kitchen display terminal monthly rental', '厨房显示终端月租', 'キッチンディスプレイ端末月額レンタル', 'HARDWARE', 'RENTAL', 3480, ARRAY[]::text[], 59, 51, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'HW-L-POS-DS', 'POS Set Rental', 'POS套装租赁', 'POSセットレンタル', 'Dual-screen POS set monthly rental', 'POS双屏套装月租', 'デュアルスクリーンPOSセット月額レンタル', 'HARDWARE', 'RENTAL', 3980, ARRAY[]::text[], 60, 52, true, NOW(), NOW())
ON CONFLICT (product_code) DO UPDATE SET
  name = EXCLUDED.name,
  name_zh = EXCLUDED.name_zh,
  name_ja = EXCLUDED.name_ja,
  description = EXCLUDED.description,
  description_zh = EXCLUDED.description_zh,
  description_ja = EXCLUDED.description_ja,
  price_monthly = EXCLUDED.price_monthly,
  odoo19_product_id = EXCLUDED.odoo19_product_id,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

-- Count the products
SELECT 'Seeded products count: ' || COUNT(*) FROM subscription_products;
