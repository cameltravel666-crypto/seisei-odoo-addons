# Seisei Theme Module

## 概述

这个模块将 Odoo 的默认紫色主题改为蓝色，以匹配 Seisei 公司网站的品牌颜色。

## 功能

- 将 Odoo 的主色调从紫色 (#875A7B) 改为蓝色 (#2563eb)
- 覆盖所有主要的 UI 元素，包括：
  - 顶部导航栏
  - Discuss/Mail 模块的顶部栏
  - 按钮和链接
  - 状态栏和徽章
  - 表单元素
  - 图表和视图

## 安装

1. 将 `seisei_theme` 模块放置在 `addons` 目录下
2. 更新应用列表：在 Odoo 中，进入 **应用** > **更新应用列表**
3. 安装模块：搜索 "Seisei Theme" 并点击安装

## 颜色方案

- **主蓝色**: #2563eb
- **深蓝色**: #1e40af
- **浅蓝色**: #3b82f6

这些颜色与公司网站 (`www/assets/css/style.css`) 中定义的颜色保持一致。

## 技术细节

- 使用 CSS `!important` 规则确保覆盖 Odoo 的默认样式
- 通过 CSS 变量覆盖 Odoo 的主题变量
- 兼容 Odoo 18.0

## 文件结构

```
seisei_theme/
├── __init__.py
├── __manifest__.py
├── README.md
└── static/
    └── src/
        └── css/
            └── seisei_theme.css
```

## 注意事项

- 安装此模块后，需要刷新浏览器缓存才能看到效果
- 如果某些元素仍然显示紫色，可能需要清除浏览器缓存或重启 Odoo 服务

