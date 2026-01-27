# Nagashiro Theme - Odoo White Label Module

This module provides white-label customization for Odoo, removing Odoo branding and applying Nagashiro branding.

## Features

- ✅ Custom Logo
- ✅ Custom Favicon
- ✅ Custom Title ("Nagashiro ERP" instead of "Odoo")
- ✅ Custom CSS Styling
- ✅ Remove Odoo Branding
- ✅ Custom Color Scheme

## Installation

1. Place this module in your Odoo addons path (e.g., `/mnt/extra-addons/nagashiro_theme`)
2. Restart Odoo
3. Go to **Apps** menu
4. Remove the "Apps" filter
5. Search for "Nagashiro Theme"
6. Click **Install**

## Customization

### Logo

Place your logo file at:
```
nagashiro_theme/static/src/img/logo.png
```

Recommended size: 200x60px (or proportional)

### Favicon

Place your favicon file at:
```
nagashiro_theme/static/src/img/favicon.ico
```

Recommended size: 32x32px or 16x16px

### CSS Customization

Edit the CSS file to customize colors and styles:
```
nagashiro_theme/static/src/css/custom.css
```

### JavaScript Customization

Edit the JavaScript file for additional UI customization:
```
nagashiro_theme/static/src/js/custom.js
```

## Configuration

After installation, the theme will automatically:
- Replace Odoo logo with Nagashiro logo
- Change page titles to "Nagashiro ERP"
- Apply custom CSS styling
- Remove Odoo branding elements

## Technical Details

- **Odoo Version**: 18.0
- **Dependencies**: web, base
- **License**: LGPL-3

## Troubleshooting

### Logo not showing

1. Check that the logo file exists at the correct path
2. Clear browser cache
3. Restart Odoo
4. Check file permissions

### Changes not applying

1. Clear browser cache
2. Restart Odoo server
3. Update the module (Apps > Nagashiro Theme > Upgrade)

