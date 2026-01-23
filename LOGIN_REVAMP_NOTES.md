# Login Page Revamp Notes

## Overview

This document describes the login page redesign and App flash fix implemented on 2026-01-17.

## Changes Summary

### 1. Login Page Redesign (`src/app/login/page.tsx`)

**New Features:**
- **Tab Navigation**: Login and Register tabs for clear separation
- **Unified Tenant Code Input**: Accepts full codes like `TEN-DEMO01` or just `DEMO01` (auto-prefixes `TEN-`)
- **Password Visibility Toggle**: Eye icon to show/hide password
- **Remember Me Checkbox**: Saves tenant code and username to localStorage
- **Forgot Password Link**: Displays help message (expandable to full flow)
- **Field-Level Validation**: Red borders and error messages on individual fields
- **Enterprise SSO Section**: Dedicated section for Google Workspace/Azure AD login

**UX Improvements:**
- Fixed height inputs (`h-12`) to prevent Cumulative Layout Shift (CLS)
- Language selector moved to top-right corner
- Mobile-friendly responsive design
- Clear visual hierarchy with proper spacing

### 2. App Flash Fix (Capacitor iOS/Android)

**Root Cause:**
- SplashScreen background: `#111827` (dark gray)
- Web body/login page: `#f8fafc` (slate-50, light)
- This mismatch caused a visible flash when transitioning from native splash to web content

**Solution - 5-Point Strategy:**

#### 2.1 Unified Background Color Chain
All colors now match `#f8fafc` (slate-50):
- `capacitor.config.ts`: SplashScreen.backgroundColor
- `capacitor.config.ts`: StatusBar.backgroundColor
- `layout.tsx`: viewport.themeColor
- `globals.css`: html/body background-color
- Login page: `bg-gradient-to-br from-slate-50` (starts at #f8fafc)

#### 2.2 SplashScreen Timing Control
```typescript
// capacitor.config.ts
SplashScreen: {
  launchAutoHide: false, // Manual hide after web loads
  launchShowDuration: 1500,
  // ...
}
```

New component `SplashScreenHandler` handles manual hide with fade animation:
```typescript
// src/components/layout/splash-screen-handler.tsx
await SplashScreen.hide({ fadeOutDuration: 300 });
```

#### 2.3 Inline Critical CSS
Added to `layout.tsx` to set background immediately before CSS loads:
```typescript
<style dangerouslySetInnerHTML={{ __html: `
  html, body {
    background-color: #f8fafc !important;
    min-height: 100%;
  }
`}} />
```

#### 2.4 Fixed Heights to Prevent CLS
All input fields use fixed heights:
- Login inputs: `h-12` (48px)
- Buttons: `h-12` (48px)
- Tab bar: Fixed height with consistent border-bottom

#### 2.5 StatusBar Configuration
Updated for light theme:
```typescript
StatusBar: {
  style: 'DARK', // Dark text on light background
  backgroundColor: '#f8fafc',
}
```

## Files Modified

| File | Changes |
|------|---------|
| `src/app/login/page.tsx` | Complete rewrite with new UI |
| `capacitor.config.ts` | SplashScreen/StatusBar colors and timing |
| `src/app/layout.tsx` | Added inline critical CSS, SplashScreenHandler |
| `src/app/globals.css` | Updated html/body background colors |
| `src/components/layout/splash-screen-handler.tsx` | New component |

## Testing Checklist

### Web Browser
- [ ] Login tab shows correctly
- [ ] Register tab shows correctly
- [ ] Tab switching clears errors
- [ ] Tenant code auto-prefixes TEN-
- [ ] Password visibility toggle works
- [ ] Remember me saves/loads data
- [ ] Field validation shows individual errors
- [ ] Language selector changes locale
- [ ] Google login redirects correctly
- [ ] Email verification flow works

### iOS App (Capacitor)
- [ ] No white flash on startup
- [ ] SplashScreen fades smoothly to login
- [ ] StatusBar text is dark (readable on light background)
- [ ] Safe area insets handled correctly
- [ ] Keyboard doesn't cause layout shift

### Android App (Capacitor)
- [ ] No white flash on startup
- [ ] SplashScreen fades smoothly to login
- [ ] StatusBar matches app theme
- [ ] Soft keyboard doesn't cause issues

## Rebuilding Native Apps

After these changes, native apps need to be rebuilt:

```bash
# Sync Capacitor config
npx cap sync

# iOS
npx cap open ios
# Build in Xcode

# Android
npx cap open android
# Build in Android Studio
```

## Color Reference

| Location | Color Code | Color Name |
|----------|------------|------------|
| SplashScreen | `#f8fafc` | Tailwind slate-50 |
| StatusBar | `#f8fafc` | Tailwind slate-50 |
| html/body | `#f8fafc` | Tailwind slate-50 |
| Login gradient start | `from-slate-50` | #f8fafc |
| Login gradient end | `to-blue-100` | #dbeafe |
| Primary button | `bg-blue-600` | #2563eb |

## Future Improvements

1. **Full Password Reset Flow**: Currently shows alert; could add email-based reset
2. **Biometric Login**: Add Face ID / Touch ID for returning users
3. **SSO Providers**: Add Microsoft, SAML support
4. **Progressive Enhancement**: Add offline indicator for App
5. **Dark Mode**: Support system dark mode preference

---

*Last updated: 2026-01-17*
