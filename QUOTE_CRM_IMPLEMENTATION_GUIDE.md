# 🎯 Quote Builder → Odoo 19 CRM 完整实施指南

**Odoo 19 服务器**: http://13.159.193.191:8069/  
**数据库**: ERP  
**日期**: 2026年1月12日

---

## 📋 实施步骤总览

### Phase 1: Odoo 19 配置 ✅
1. 创建自定义模型 `quote.request`
2. 扩展 `crm.lead` 字段
3. 配置 UTM 来源/媒介
4. 设置访问权限

### Phase 2: Seisei ERP API 开发 ⏳
1. 创建公开 API endpoints
2. 实现 Odoo RPC 调用
3. PDF 生成逻辑
4. 安全验证

### Phase 3: seisei.tokyo 前端更新 ⏳
1. 状态机实现
2. 联系表单组件
3. PDF/共享视图
4. Quote 详情页

### Phase 4: 测试与部署 ⏳
1. 端到端测试
2. 生产环境部署
3. 监控和追踪

---

## 📦 Phase 1: Odoo 19 配置

### Step 1.1: 登录 Odoo 19

```bash
# 访问
http://13.159.193.191:8069/

# 选择数据库: ERP
# 用户名: admin
# 密码: [您的密码]
```

### Step 1.2: 启用开发者模式

```
Settings → Activate the developer mode
或
Settings → Technical → Developer mode → Activate
```

### Step 1.3: 创建自定义模型 `quote.request`

#### 方法 A: 通过 UI 创建（推荐）

**路径**: `Settings → Technical → Database Structure → Models → Create`

**模型定义**:

```
Model Name: quote.request
Model Description: Quote Request from Website

Fields:
┌──────────────────────────────────────────────────────────────┐
│ Field Name           │ Type         │ Required │ Widget      │
├──────────────────────┼──────────────┼──────────┼─────────────┤
│ name                 │ Char         │ Yes      │ -           │
│ lead_id              │ Many2one     │ Yes      │ crm.lead    │
│ state                │ Selection    │ Yes      │ -           │
│   Options: draft, sent, viewed, converted                    │
│ contact_name         │ Char         │ Yes      │ -           │
│ email                │ Char         │ Yes      │ -           │
│ phone                │ Char         │ No       │ -           │
│ company              │ Char         │ No       │ -           │
│ store_count          │ Integer      │ Yes      │ -           │
│ plan_id              │ Char         │ Yes      │ -           │
│ modules              │ Text         │ No       │ JSON        │
│ pos_seats            │ Integer      │ No       │ -           │
│ kds_screens          │ Integer      │ No       │ -           │
│ printhub_enabled     │ Boolean      │ No       │ -           │
│ printhub_endpoints   │ Integer      │ No       │ -           │
│ maintenance_plan     │ Char         │ No       │ -           │
│ onboarding_package   │ Char         │ No       │ -           │
│ onboarding_installments │ Integer  │ No       │ -           │
│ hardware_config      │ Text         │ No       │ JSON        │
│ software_monthly     │ Float        │ Yes      │ monetary    │
│ software_monthly_original │ Float   │ Yes      │ monetary    │
│ discount_rate        │ Float        │ No       │ -           │
│ hardware_monthly     │ Float        │ No       │ monetary    │
│ onboarding_fee       │ Float        │ No       │ monetary    │
│ onboarding_monthly   │ Float        │ No       │ monetary    │
│ first_month_total    │ Float        │ Yes      │ monetary    │
│ recurring_monthly    │ Float        │ Yes      │ monetary    │
│ pdf_url              │ Char         │ No       │ -           │
│ share_token          │ Char         │ No       │ -           │
│ share_url            │ Char         │ No       │ -           │
│ shared_at            │ Datetime     │ No       │ -           │
│ viewed_count         │ Integer      │ No       │ -           │
│ last_viewed_at       │ Datetime     │ No       │ -           │
│ downloaded_count     │ Integer      │ No       │ -           │
│ last_downloaded_at   │ Datetime     │ No       │ -           │
│ source_url           │ Char         │ No       │ -           │
│ utm_source           │ Char         │ No       │ -           │
│ utm_campaign         │ Char         │ No       │ -           │
│ user_agent           │ Text         │ No       │ -           │
│ ip_address           │ Char         │ No       │ -           │
│ create_date          │ Datetime     │ Auto     │ -           │
│ write_date           │ Datetime     │ Auto     │ -           │
└──────────────────────────────────────────────────────────────┘
```

#### 方法 B: 通过 Python 模块创建（推荐生产环境）

**创建自定义模块**:

```bash
# 在 Odoo 19 服务器上
ssh -i /path/to/key.pem ubuntu@13.159.193.191

# 进入 Odoo addons 目录
cd /opt/odoo/addons  # 或您的实际路径

# 创建模块
mkdir -p quote_crm_integration
cd quote_crm_integration
```

**文件结构**:
```
quote_crm_integration/
├── __init__.py
├── __manifest__.py
├── models/
│   ├── __init__.py
│   ├── quote_request.py
│   └── crm_lead.py
├── security/
│   └── ir.model.access.csv
└── views/
    ├── quote_request_views.xml
    └── crm_lead_views.xml
```

**`__manifest__.py`**:
```python
{
    'name': 'Quote CRM Integration',
    'version': '1.0',
    'category': 'Sales/CRM',
    'summary': 'Integrate website quote builder with CRM',
    'description': """
        This module creates a bridge between the website quote builder
        and Odoo CRM, allowing automatic lead creation and quote tracking.
    """,
    'author': 'Seisei',
    'depends': ['crm', 'sale', 'utm'],
    'data': [
        'security/ir.model.access.csv',
        'views/quote_request_views.xml',
        'views/crm_lead_views.xml',
    ],
    'installable': True,
    'application': False,
    'auto_install': False,
}
```

**`models/__init__.py`**:
```python
from . import quote_request
from . import crm_lead
```

**`models/quote_request.py`**:
```python
# -*- coding: utf-8 -*-
from odoo import models, fields, api
import json
import secrets

class QuoteRequest(models.Model):
    _name = 'quote.request'
    _description = 'Website Quote Request'
    _order = 'create_date desc'
    _inherit = ['mail.thread', 'mail.activity.mixin']
    
    # Basic Info
    name = fields.Char('Quote Number', required=True, copy=False, 
                       readonly=True, default='New')
    lead_id = fields.Many2one('crm.lead', string='Related Lead', 
                              ondelete='cascade', tracking=True)
    state = fields.Selection([
        ('draft', 'Draft'),
        ('sent', 'Sent'),
        ('viewed', 'Viewed'),
        ('converted', 'Converted'),
    ], string='Status', default='draft', tracking=True)
    
    # Contact Information
    contact_name = fields.Char('Contact Name', required=True)
    email = fields.Char('Email', required=True)
    phone = fields.Char('Phone')
    company = fields.Char('Company')
    
    # Quote Configuration
    store_count = fields.Integer('Store Count', required=True, default=1)
    plan_id = fields.Char('Plan ID', required=True)
    modules = fields.Text('Modules (JSON)')
    pos_seats = fields.Integer('POS Seats', default=0)
    kds_screens = fields.Integer('KDS Screens', default=0)
    printhub_enabled = fields.Boolean('PrintHub Enabled')
    printhub_endpoints = fields.Integer('PrintHub Endpoints', default=0)
    maintenance_plan = fields.Char('Maintenance Plan')
    onboarding_package = fields.Char('Onboarding Package')
    onboarding_installments = fields.Integer('Onboarding Installments', default=0)
    hardware_config = fields.Text('Hardware Config (JSON)')
    
    # Pricing
    currency_id = fields.Many2one('res.currency', string='Currency',
                                   default=lambda self: self.env.company.currency_id)
    software_monthly = fields.Monetary('Software Monthly Fee', 
                                        currency_field='currency_id', required=True)
    software_monthly_original = fields.Monetary('Original Software Monthly', 
                                                 currency_field='currency_id')
    discount_rate = fields.Float('Discount Rate (%)')
    hardware_monthly = fields.Monetary('Hardware Monthly', 
                                        currency_field='currency_id')
    onboarding_fee = fields.Monetary('Onboarding Fee', 
                                      currency_field='currency_id')
    onboarding_monthly = fields.Monetary('Onboarding Monthly', 
                                          currency_field='currency_id')
    first_month_total = fields.Monetary('First Month Total', 
                                         currency_field='currency_id', required=True)
    recurring_monthly = fields.Monetary('Recurring Monthly', 
                                         currency_field='currency_id', required=True)
    
    # PDF & Sharing
    pdf_url = fields.Char('PDF URL')
    share_token = fields.Char('Share Token', copy=False)
    share_url = fields.Char('Share URL', compute='_compute_share_url', store=True)
    shared_at = fields.Datetime('Shared At')
    
    # Tracking
    viewed_count = fields.Integer('View Count', default=0)
    last_viewed_at = fields.Datetime('Last Viewed')
    downloaded_count = fields.Integer('Download Count', default=0)
    last_downloaded_at = fields.Datetime('Last Downloaded')
    
    # Source Tracking
    source_url = fields.Char('Source URL')
    utm_source = fields.Char('UTM Source')
    utm_campaign = fields.Char('UTM Campaign')
    user_agent = fields.Text('User Agent')
    ip_address = fields.Char('IP Address')
    
    @api.model
    def create(self, vals):
        # Generate quote number
        if vals.get('name', 'New') == 'New':
            vals['name'] = self.env['ir.sequence'].next_by_code('quote.request') or 'New'
        
        # Generate share token if not provided
        if not vals.get('share_token'):
            vals['share_token'] = secrets.token_urlsafe(16)
        
        record = super(QuoteRequest, self).create(vals)
        
        # Create related lead if not exists
        if not record.lead_id:
            record._create_related_lead()
        
        return record
    
    @api.depends('share_token')
    def _compute_share_url(self):
        base_url = self.env['ir.config_parameter'].sudo().get_param('web.base.url')
        for record in self:
            if record.share_token:
                record.share_url = f"{base_url}/quote/{record.share_token}"
            else:
                record.share_url = False
    
    def _create_related_lead(self):
        """Create a CRM lead from quote request"""
        self.ensure_one()
        
        # Parse modules
        modules_list = []
        if self.modules:
            try:
                modules_list = json.loads(self.modules)
            except:
                modules_list = []
        
        # Build description
        description = f"""
=== 見積依頼 ===
Quote ID: {self.name}
店舗数: {self.store_count}
プラン: {self.plan_id}
追加モジュール: {', '.join(modules_list) if modules_list else 'なし'}

=== 価格 ===
ソフトウェア月額: ¥{self.software_monthly:,.0f}
初月支払: ¥{self.first_month_total:,.0f}
翌月以降: ¥{self.recurring_monthly:,.0f}

=== 来源 ===
URL: {self.source_url or 'N/A'}
UTM Source: {self.utm_source or 'N/A'}
UTM Campaign: {self.utm_campaign or 'N/A'}
        """.strip()
        
        # Find or create UTM source
        utm_source = self.env['utm.source'].search([
            ('name', '=', 'ウェブ見積')
        ], limit=1)
        if not utm_source:
            utm_source = self.env['utm.source'].create({
                'name': 'ウェブ見積'
            })
        
        # Find or create UTM medium
        utm_medium = self.env['utm.medium'].search([
            ('name', '=', 'Website')
        ], limit=1)
        if not utm_medium:
            utm_medium = self.env['utm.medium'].create({
                'name': 'Website'
            })
        
        # Create lead
        lead_vals = {
            'name': f"【見積依頼】{self.contact_name} - {self.store_count}店舗",
            'type': 'lead',
            'contact_name': self.contact_name,
            'email_from': self.email,
            'phone': self.phone,
            'company_name': self.company,
            'description': description,
            'source_id': utm_source.id,
            'medium_id': utm_medium.id,
            'tag_ids': [(6, 0, self._get_quote_tags().ids)],
            'x_quote_id': self.id,
            'x_estimated_monthly': self.recurring_monthly,
            'x_store_count': self.store_count,
        }
        
        lead = self.env['crm.lead'].create(lead_vals)
        self.lead_id = lead.id
        
        # Log activity
        self.lead_id.message_post(
            body=f"Quote created from website: {self.name}",
            subject="Quote Created",
        )
        
        return lead
    
    def _get_quote_tags(self):
        """Get or create quote-related tags"""
        tag = self.env['crm.tag'].search([
            ('name', '=', '見積依頼')
        ], limit=1)
        if not tag:
            tag = self.env['crm.tag'].create({
                'name': '見積依頼',
                'color': 2,  # Blue
            })
        return tag
    
    def action_mark_downloaded(self):
        """Mark quote as downloaded"""
        self.write({
            'downloaded_count': self.downloaded_count + 1,
            'last_downloaded_at': fields.Datetime.now(),
        })
        
        # Log activity on lead
        if self.lead_id:
            self.lead_id.message_post(
                body=f"Quote PDF downloaded (Total: {self.downloaded_count})",
                subject="Quote Downloaded",
            )
    
    def action_mark_shared(self):
        """Mark quote as shared"""
        self.write({
            'shared_at': fields.Datetime.now(),
            'state': 'sent',
        })
        
        # Log activity on lead
        if self.lead_id:
            self.lead_id.message_post(
                body=f"Quote shared via link: {self.share_url}",
                subject="Quote Shared",
            )
    
    def action_mark_viewed(self, ip_address=None):
        """Mark quote as viewed"""
        self.write({
            'viewed_count': self.viewed_count + 1,
            'last_viewed_at': fields.Datetime.now(),
            'state': 'viewed' if self.state == 'sent' else self.state,
        })
        
        # Log activity on lead
        if self.lead_id:
            viewer_info = f" by {ip_address}" if ip_address else ""
            self.lead_id.message_post(
                body=f"Quote viewed{viewer_info} (Total views: {self.viewed_count})",
                subject="Quote Viewed",
            )
```

**`models/crm_lead.py`**:
```python
# -*- coding: utf-8 -*-
from odoo import models, fields

class CrmLead(models.Model):
    _inherit = 'crm.lead'
    
    # Custom fields for quote integration
    x_quote_id = fields.Many2one('quote.request', string='Quote Request', 
                                  ondelete='set null')
    x_estimated_monthly = fields.Monetary('Estimated Monthly Fee', 
                                           currency_field='company_currency')
    x_store_count = fields.Integer('Store Count')
    
    quote_request_ids = fields.One2many('quote.request', 'lead_id', 
                                         string='Quote Requests')
    quote_count = fields.Integer('Quote Count', compute='_compute_quote_count')
    
    def _compute_quote_count(self):
        for lead in self:
            lead.quote_count = len(lead.quote_request_ids)
    
    def action_view_quotes(self):
        """Action to view related quotes"""
        self.ensure_one()
        return {
            'name': 'Quote Requests',
            'type': 'ir.actions.act_window',
            'res_model': 'quote.request',
            'view_mode': 'tree,form',
            'domain': [('lead_id', '=', self.id)],
            'context': {'default_lead_id': self.id},
        }
```

**`security/ir.model.access.csv`**:
```csv
id,name,model_id:id,group_id:id,perm_read,perm_write,perm_create,perm_unlink
access_quote_request_user,quote.request.user,model_quote_request,base.group_user,1,1,1,0
access_quote_request_manager,quote.request.manager,model_quote_request,sales_team.group_sale_manager,1,1,1,1
access_quote_request_public,quote.request.public,model_quote_request,base.group_public,1,0,1,0
```

**`views/quote_request_views.xml`**:
```xml
<?xml version="1.0" encoding="utf-8"?>
<odoo>
    <!-- Quote Request Form View -->
    <record id="view_quote_request_form" model="ir.ui.view">
        <field name="name">quote.request.form</field>
        <field name="model">quote.request</field>
        <field name="arch" type="xml">
            <form string="Quote Request">
                <header>
                    <field name="state" widget="statusbar" 
                           statusbar_visible="draft,sent,viewed,converted"/>
                </header>
                <sheet>
                    <div class="oe_button_box" name="button_box">
                        <button name="action_mark_downloaded" type="object" 
                                class="oe_stat_button" icon="fa-download">
                            <field name="downloaded_count" widget="statinfo" 
                                   string="Downloads"/>
                        </button>
                        <button name="action_mark_shared" type="object" 
                                class="oe_stat_button" icon="fa-share">
                            <div class="o_field_widget o_stat_info">
                                <span class="o_stat_text">Shared</span>
                            </div>
                        </button>
                        <field name="viewed_count" widget="statinfo" 
                               string="Views" class="oe_stat_button" 
                               icon="fa-eye"/>
                    </div>
                    
                    <div class="oe_title">
                        <h1>
                            <field name="name" readonly="1"/>
                        </h1>
                    </div>
                    
                    <group>
                        <group name="contact_info" string="Contact Information">
                            <field name="contact_name"/>
                            <field name="email" widget="email"/>
                            <field name="phone" widget="phone"/>
                            <field name="company"/>
                            <field name="lead_id" 
                                   options="{'no_create': True, 'no_create_edit': True}"/>
                        </group>
                        <group name="quote_info" string="Quote Information">
                            <field name="store_count"/>
                            <field name="plan_id"/>
                            <field name="currency_id" invisible="1"/>
                            <field name="software_monthly" widget="monetary"/>
                            <field name="recurring_monthly" widget="monetary"/>
                            <field name="first_month_total" widget="monetary"/>
                        </group>
                    </group>
                    
                    <notebook>
                        <page string="Configuration" name="config">
                            <group>
                                <group string="Modules">
                                    <field name="modules" widget="text"/>
                                </group>
                                <group string="Terminals">
                                    <field name="pos_seats"/>
                                    <field name="kds_screens"/>
                                    <field name="printhub_enabled"/>
                                    <field name="printhub_endpoints" 
                                           attrs="{'invisible': [('printhub_enabled', '=', False)]}"/>
                                </group>
                            </group>
                            <group>
                                <group string="Services">
                                    <field name="maintenance_plan"/>
                                    <field name="onboarding_package"/>
                                    <field name="onboarding_installments"/>
                                </group>
                                <group string="Hardware">
                                    <field name="hardware_config" widget="text"/>
                                    <field name="hardware_monthly" widget="monetary"/>
                                </group>
                            </group>
                        </page>
                        
                        <page string="Pricing Details" name="pricing">
                            <group>
                                <group string="Software">
                                    <field name="software_monthly_original" widget="monetary"/>
                                    <field name="discount_rate"/>
                                    <field name="software_monthly" widget="monetary"/>
                                </group>
                                <group string="Onboarding">
                                    <field name="onboarding_fee" widget="monetary"/>
                                    <field name="onboarding_monthly" widget="monetary"/>
                                    <field name="onboarding_installments"/>
                                </group>
                            </group>
                        </page>
                        
                        <page string="Sharing & Tracking" name="tracking">
                            <group>
                                <group string="Share Information">
                                    <field name="share_token" readonly="1"/>
                                    <field name="share_url" widget="url" readonly="1"/>
                                    <field name="shared_at" readonly="1"/>
                                    <field name="pdf_url" readonly="1"/>
                                </group>
                                <group string="Tracking">
                                    <field name="viewed_count" readonly="1"/>
                                    <field name="last_viewed_at" readonly="1"/>
                                    <field name="downloaded_count" readonly="1"/>
                                    <field name="last_downloaded_at" readonly="1"/>
                                </group>
                            </group>
                            <group>
                                <group string="Source">
                                    <field name="source_url" widget="url" readonly="1"/>
                                    <field name="utm_source" readonly="1"/>
                                    <field name="utm_campaign" readonly="1"/>
                                    <field name="ip_address" readonly="1"/>
                                </group>
                            </group>
                        </page>
                    </notebook>
                </sheet>
                <div class="oe_chatter">
                    <field name="message_follower_ids"/>
                    <field name="activity_ids"/>
                    <field name="message_ids"/>
                </div>
            </form>
        </field>
    </record>
    
    <!-- Quote Request Tree View -->
    <record id="view_quote_request_tree" model="ir.ui.view">
        <field name="name">quote.request.tree</field>
        <field name="model">quote.request</field>
        <field name="arch" type="xml">
            <tree string="Quote Requests" 
                  decoration-info="state=='draft'" 
                  decoration-success="state=='converted'">
                <field name="name"/>
                <field name="contact_name"/>
                <field name="email"/>
                <field name="store_count"/>
                <field name="recurring_monthly" widget="monetary" sum="Total"/>
                <field name="viewed_count"/>
                <field name="downloaded_count"/>
                <field name="state"/>
                <field name="create_date"/>
            </tree>
        </field>
    </record>
    
    <!-- Quote Request Search View -->
    <record id="view_quote_request_search" model="ir.ui.view">
        <field name="name">quote.request.search</field>
        <field name="model">quote.request</field>
        <field name="arch" type="xml">
            <search string="Search Quote Requests">
                <field name="name"/>
                <field name="contact_name"/>
                <field name="email"/>
                <field name="company"/>
                <filter string="Draft" name="draft" domain="[('state','=','draft')]"/>
                <filter string="Sent" name="sent" domain="[('state','=','sent')]"/>
                <filter string="Viewed" name="viewed" domain="[('state','=','viewed')]"/>
                <filter string="Converted" name="converted" domain="[('state','=','converted')]"/>
                <group expand="0" string="Group By">
                    <filter string="Status" name="group_state" context="{'group_by':'state'}"/>
                    <filter string="Plan" name="group_plan" context="{'group_by':'plan_id'}"/>
                    <filter string="Creation Date" name="group_date" context="{'group_by':'create_date'}"/>
                </group>
            </search>
        </field>
    </record>
    
    <!-- Quote Request Action -->
    <record id="action_quote_request" model="ir.actions.act_window">
        <field name="name">Quote Requests</field>
        <field name="res_model">quote.request</field>
        <field name="view_mode">tree,form</field>
        <field name="search_view_id" ref="view_quote_request_search"/>
        <field name="help" type="html">
            <p class="o_view_nocontent_smiling_face">
                Create your first quote request
            </p>
        </field>
    </record>
    
    <!-- Menu Item -->
    <menuitem id="menu_quote_request"
              name="Quote Requests"
              parent="crm.crm_menu_sales"
              action="action_quote_request"
              sequence="10"/>
    
    <!-- Sequence for Quote Number -->
    <record id="seq_quote_request" model="ir.sequence">
        <field name="name">Quote Request</field>
        <field name="code">quote.request</field>
        <field name="prefix">Q-</field>
        <field name="padding">8</field>
        <field name="number_next">1</field>
        <field name="number_increment">1</field>
    </record>
</odoo>
```

**`views/crm_lead_views.xml`**:
```xml
<?xml version="1.0" encoding="utf-8"?>
<odoo>
    <!-- Extend CRM Lead Form -->
    <record id="view_crm_lead_form_inherit" model="ir.ui.view">
        <field name="name">crm.lead.form.inherit</field>
        <field name="model">crm.lead</field>
        <field name="inherit_id" ref="crm.crm_lead_view_form"/>
        <field name="arch" type="xml">
            <!-- Add Quote button to button box -->
            <xpath expr="//div[@name='button_box']" position="inside">
                <button name="action_view_quotes" type="object" 
                        class="oe_stat_button" icon="fa-file-text-o"
                        attrs="{'invisible': [('quote_count', '=', 0)]}">
                    <field name="quote_count" widget="statinfo" string="Quotes"/>
                </button>
            </xpath>
            
            <!-- Add custom fields to lead form -->
            <xpath expr="//group[@name='lead_details']" position="after">
                <group string="Quote Information" name="quote_info" 
                       attrs="{'invisible': [('x_quote_id', '=', False)]}">
                    <field name="x_quote_id" readonly="1"/>
                    <field name="x_estimated_monthly" widget="monetary"/>
                    <field name="x_store_count"/>
                </group>
            </xpath>
        </field>
    </record>
</odoo>
```

### Step 1.4: 安装模块

```bash
# 方法 1: 通过 UI 安装
# Apps → Update Apps List → Search "Quote CRM Integration" → Install

# 方法 2: 通过命令行安装
ssh -i /path/to/key.pem ubuntu@13.159.193.191
cd /opt/odoo  # 或您的 Odoo 安装路径

# 重启 Odoo 并安装模块
./odoo-bin -d ERP -i quote_crm_integration --stop-after-init

# 重启 Odoo 服务
sudo systemctl restart odoo
```

### Step 1.5: 验证安装

```bash
# 登录 Odoo 19
# 访问: Sales → Configuration → Quote Requests
# 应该看到空列表（新安装）

# 访问: Sales → Leads
# 应该看到自定义字段已添加
```

---

## 🔌 Phase 2: Seisei ERP API 开发

现在开始在 Seisei ERP 项目中创建 API endpoints...

---

**准备好继续到 Phase 2 了吗？** 🚀
