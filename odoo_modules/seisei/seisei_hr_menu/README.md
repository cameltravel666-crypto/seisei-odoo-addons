# Seisei HR Menu Restructure

## Overview

This module restructures the HR and Payroll menus in Odoo 18 Community to provide a cleaner, role-based user experience.

## New Menu Structure

### 1. Personnel (人事) - Sequence 10
- **Employees** - Employee list and management
- **Organization**
  - Departments
- **Contracts** - Employee contracts

### 2. Payroll (薪资) - Sequence 20
- **Payslips** - Daily payslip management
- **Batches** - Payslip batch processing
- **Japan: Social & Tax** (Admin only)
  - Contribution Registers
  - Insurance Prefectures
  - Insurance Rates
  - Insurance Grades
  - Withholding Tax

### 3. Reports (报表) - Sequence 30
- **HR Reports**
- **Payroll Reports**

### 4. Settings (设置) - Sequence 90 (Admin only)
- **General**
  - HR Settings
- **Basic Data**
  - Work Locations
  - Departure Reasons
- **Payroll Configuration**
  - Salary Structures
  - Salary Rule Categories
  - Salary Rules
  - Contract Templates
- **Recruitment**
  - Job Positions

## Permission Groups

| Group | Description | Access |
|-------|-------------|--------|
| `group_seisei_store_manager` | Store Manager | Personnel + Reports |
| `group_seisei_hr_manager` | HR Manager | Personnel + Payroll (daily) + Reports |
| `group_seisei_hr_admin` | HR Administrator | Full access including Settings |

## Installation

```bash
# On server
cd /opt/seisei-test
docker compose exec web odoo -d <database> -i seisei_hr_menu --stop-after-init
docker compose restart web
```

## Rollback

To rollback, simply uninstall the module:

```bash
# Via command line
docker compose exec web odoo -d <database> -u seisei_hr_menu --stop-after-init

# Or via UI
# Settings > Apps > Search "Seisei HR Menu" > Uninstall
```

Uninstalling this module will:
- Remove the new menu structure
- Restore visibility of legacy menus
- Remove the custom permission groups

## Testing Checklist

### As HR Admin
- [ ] Can see all 4 top-level menus (Personnel, Payroll, Reports, Settings)
- [ ] Can access all Settings menus
- [ ] Can access all Payroll configuration items

### As HR Manager
- [ ] Can see Personnel, Payroll, Reports
- [ ] Cannot see Settings menu
- [ ] Cannot see Payroll configuration items (Japan Social & Tax admin-only items)

### As Store Manager
- [ ] Can see Personnel, Reports
- [ ] Cannot see Payroll menu
- [ ] Cannot see Settings menu

### General
- [ ] Old "员工" top-level menu is hidden
- [ ] No duplicate menu entries visible
- [ ] All actions work correctly

## Dependencies

- `hr` (core HR module)
- `hr_contract` (contracts)
- `bi_hr_payroll` (optional, for payroll features)

## Menus Hidden by This Module

The following legacy menus are hidden (groups set to `base.group_no_one`):

| Original XML ID | Original Name |
|----------------|---------------|
| `hr.menu_hr_root` | 员工 (old top-level) |
| `bi_hr_payroll.menu_hr_payroll_root` | Payroll (under HR) |
| `bi_hr_payroll.menu_hr_payroll_configuration` | Configuration (under Payroll) |
| `bi_hr_payroll.menu_japan_payroll_config` | Japan (under Config) |

## Version History

- **18.0.1.0.0** - Initial release
