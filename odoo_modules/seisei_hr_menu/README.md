# Seisei HR Menu Restructure

Odoo 18 模块，用于重构 HR/Payroll 菜单信息架构，减少重复入口，将日常操作与配置彻底分离。

## 功能概述

### 新菜单结构 (4个独立顶栏)

| 顶栏 | 说明 | 权限要求 |
|------|------|----------|
| **Personnel** (人事) | 员工、部门、合同管理 | Store Manager, HR Manager, HR Admin |
| **Payroll** (薪資) | 工资单、发薪批次、日本社保税 | HR Manager, HR Admin |
| **Reports** (報表) | HR报表、薪资报表 | Store Manager, HR Manager, HR Admin |
| **Settings** (設置) | 所有配置项（仅管理员可见） | HR Admin only |

### 详细菜单结构

```
Personnel (seq=10)
├── Employees                    → hr.open_view_employee_list_my
├── Organization
│   └── Departments             → hr.hr_department_kanban_action
└── Contracts                   → hr_contract.action_hr_contract

Payroll (seq=20)
├── Payslips                    → bi_hr_payroll.action_view_hr_payslip_form
├── Batches                     → bi_hr_payroll.action_hr_payslip_run_tree
└── Japan: Social & Tax
    ├── Contribution Registers  → bi_hr_payroll.action_contribution_register_form
    ├── Insurance Prefectures   → bi_hr_payroll.hr_insurance_prefecture_action
    ├── Insurance Rates         → bi_hr_payroll.hr_insurance_rate_action
    ├── Insurance Grades        → bi_hr_payroll.hr_insurance_grade_action
    └── Withholding Tax         → bi_hr_payroll.hr_withholding_tax_action

Reports (seq=30)
├── HR Reports                  → (placeholder)
└── Payroll Reports             → (placeholder)

Settings (seq=90) [HR Admin only]
├── General
│   └── HR Settings             → hr.hr_config_settings_action
├── Basic Data
│   ├── Work Locations          → hr.hr_work_location_action
│   └── Departure Reasons       → hr.hr_departure_reason_action
├── Payroll Configuration
│   ├── Salary Structures       → bi_hr_payroll.action_view_hr_payroll_structure_list_form
│   ├── Salary Rule Categories  → bi_hr_payroll.action_hr_salary_rule_category
│   ├── Salary Rules            → bi_hr_payroll.action_salary_rule_form
│   └── Contract Templates      → bi_hr_payroll.hr_contract_advantage_template_action
└── Recruitment
    └── Job Positions           → hr.action_hr_job
```

## 权限组

本模块定义了三个权限组：

| 权限组 | 说明 | 可见菜单 |
|--------|------|----------|
| `group_seisei_store_manager` | 店长/门店经理 | Personnel, Reports |
| `group_seisei_hr_manager` | HR经理 | Personnel, Payroll(日常), Reports |
| `group_seisei_hr_admin` | HR管理员 | 全部，包括Settings |

权限继承关系：
- HR Admin ⊃ HR Manager ⊃ Store Manager

## 安装

### 前置条件

- Odoo 18 Community Edition
- 已安装模块：`hr`, `hr_contract`, `bi_hr_payroll`

### Docker 安装 (推荐)

```bash
# 进入项目目录
cd /opt/seisei-test

# 安装模块
docker compose exec web odoo -d <database> -i seisei_hr_menu --stop-after-init

# 重启服务
docker compose restart web
```

### 升级模块

```bash
docker compose exec web odoo -d <database> -u seisei_hr_menu --stop-after-init
docker compose restart web
```

### 命令行安装 (非 Docker)

```bash
./odoo-bin -d <database> -i seisei_hr_menu --stop-after-init
```

## 回滚

直接卸载本模块即可恢复原始菜单结构：

**Docker 方式:**
```bash
# 通过 Odoo 命令行
docker compose exec web odoo shell -d <database>
>>> env['ir.module.module'].search([('name', '=', 'seisei_hr_menu')]).button_immediate_uninstall()
```

**界面方式:**
1. 设置 → 应用
2. 移除"已安装"过滤器
3. 搜索 "Seisei HR Menu"
4. 点击卸载

卸载后：
- 新菜单结构将被移除
- 旧菜单恢复可见
- 自定义权限组被删除

## 验证测试清单

### 1. HR Admin 用户测试
- [ ] 能看到所有4个顶栏：Personnel, Payroll, Reports, Settings
- [ ] Settings 下可见所有配置项
- [ ] Payroll → Japan: Social & Tax 下所有子菜单可见

### 2. HR Manager 用户测试
- [ ] 能看到3个顶栏：Personnel, Payroll, Reports
- [ ] **不能**看到 Settings 顶栏
- [ ] Payroll 下可见 Payslips 和 Batches
- [ ] Japan: Social & Tax 菜单可见，但子项受限

### 3. Store Manager 用户测试
- [ ] 能看到2个顶栏：Personnel, Reports
- [ ] **不能**看到 Payroll 和 Settings
- [ ] Personnel 下可见 Employees, Organization

### 4. 普通用户测试
- [ ] 不应看到任何新顶栏（除非有其他权限）

### 5. 旧菜单隐藏测试
- [ ] 原始 HR 顶栏（员工）已隐藏
- [ ] 原始 Payroll 子菜单已隐藏
- [ ] 无重复入口

## 文件结构

```
seisei_hr_menu/
├── __init__.py
├── __manifest__.py
├── README.md
├── security/
│   └── security.xml          # 权限组定义
└── views/
    ├── menu.xml              # 新菜单结构
    └── menu_hide_legacy.xml  # 隐藏旧菜单
```

## 被隐藏的旧菜单

| Original XML ID | Original Name |
|----------------|---------------|
| `hr.menu_hr_root` | 员工 (旧顶栏) |
| `bi_hr_payroll.menu_hr_payroll_root` | Payroll (HR下) |
| `bi_hr_payroll.menu_hr_payroll_configuration` | Configuration |
| `bi_hr_payroll.menu_japan_payroll_config` | Japan Config |
| `bi_hr_payroll.menu_hr_payroll_global_settings` | Payroll Settings |

## 重挂菜单映射表

| 旧菜单位置 | 新菜单位置 | Action |
|-----------|-----------|--------|
| 员工 → 员工 | Personnel → Employees | hr.open_view_employee_list_my |
| 员工 → 部门 | Personnel → Organization → Departments | hr.hr_department_kanban_action |
| 员工 → 合同 | Personnel → Contracts | hr_contract.action_hr_contract |
| 工资管理 → 工资单 | Payroll → Payslips | bi_hr_payroll.action_view_hr_payslip_form |
| 工资管理 → 发薪批次 | Payroll → Batches | bi_hr_payroll.action_hr_payslip_run_tree |
| 配置 → 薪资结构 | Settings → Payroll Configuration → Salary Structures | bi_hr_payroll.action_view_hr_payroll_structure_list_form |
| 配置 → 薪资规则 | Settings → Payroll Configuration → Salary Rules | bi_hr_payroll.action_salary_rule_form |
| 配置 → 工作地点 | Settings → Basic Data → Work Locations | hr.hr_work_location_action |

## 注意事项

1. **不破坏性修改**：本模块仅重新挂载菜单，不修改任何业务逻辑
2. **旧菜单保留**：原始菜单使用 `groups=base.group_no_one` 隐藏，不删除
3. **权限独立**：新权限组与原有 Odoo 权限互不干扰
4. **依赖检查**：必须先安装 `bi_hr_payroll` 模块才能安装本模块

## 版本历史

- **18.0.1.1.0**: Settings 独立为顶栏菜单，完善文档
- **18.0.1.0.0**: 初始版本

## 依赖模块

- `hr` (核心 HR 模块)
- `hr_contract` (合同管理)
- `bi_hr_payroll` (薪资管理 - 必需)

## License

LGPL-3
