# Seisei BizNexus - Mobile App Build Guide

## Overview

This project uses Capacitor to build native iOS and Android apps that wrap the Next.js web application.

## Prerequisites

### iOS Development
- macOS with Xcode 15+ installed
- iOS Simulator or physical iOS device
- Apple Developer account (for App Store distribution)

### Android Development
- Android Studio with SDK 34+
- Android Emulator or physical Android device
- JDK 17+

## Project Structure

```
├── ios/                    # Xcode project
│   └── App/
│       ├── App/            # App source files
│       └── App.xcworkspace # Open this in Xcode
├── android/                # Android Studio project
│   └── app/
│       └── src/
├── capacitor.config.ts     # Capacitor configuration
└── public/
    ├── manifest.json       # PWA manifest
    └── icons/              # App icons (need to generate)
```

## Configuration

### Server URL

Edit `capacitor.config.ts` to set your production server URL:

```typescript
server: {
  url: 'https://your-production-server.com',
  // ...
}
```

For development, use localhost:
```typescript
server: {
  url: 'http://localhost:3000',
  cleartext: true, // Required for localhost
}
```

## Building the Apps

### 1. Start the Dev Server

```bash
npm run dev
```

### 2. Sync Capacitor

```bash
npm run cap:sync
```

### 3. Open in IDE

**iOS (Xcode):**
```bash
npm run cap:ios
```

**Android (Android Studio):**
```bash
npm run cap:android
```

### 4. Build & Run

- **iOS**: Select a simulator/device in Xcode and click Run (⌘R)
- **Android**: Select a device in Android Studio and click Run (▶️)

## App Icons & Splash Screens

### Generate Icons

1. Create a 1024x1024 PNG icon (`icon.png`)
2. Use a tool like [capacitor-assets](https://github.com/ionic-team/capacitor-assets):

```bash
npm install -D @capacitor/assets
npx capacitor-assets generate --iconBackgroundColor '#111827' --splashBackgroundColor '#111827'
```

Or manually place icons in:
- iOS: `ios/App/App/Assets.xcassets/AppIcon.appiconset/`
- Android: `android/app/src/main/res/mipmap-*/`

### Splash Screen

Configure in `capacitor.config.ts`:
```typescript
plugins: {
  SplashScreen: {
    backgroundColor: '#111827',
    launchShowDuration: 2000,
    launchAutoHide: true,
  }
}
```

## Distribution

### iOS App Store

1. Configure signing in Xcode:
   - Select your Team
   - Set Bundle Identifier: `com.seisei.biznexus`
2. Archive: Product → Archive
3. Upload via App Store Connect

### Google Play Store

1. Generate signed APK/AAB:
   - Build → Generate Signed Bundle/APK
2. Upload to Google Play Console

### TestFlight / Firebase App Distribution

For internal testing before public release.

## Native Features

### Haptic Feedback

```typescript
import { useHaptics } from '@/hooks/use-native';

function MyComponent() {
  const { impact } = useHaptics();

  const handleTap = () => {
    impact('medium');
    // ... your logic
  };
}
```

### Platform Detection

```typescript
import { useIsNative, usePlatform } from '@/hooks/use-native';

function MyComponent() {
  const isNative = useIsNative();
  const platform = usePlatform(); // 'ios' | 'android' | 'web'

  if (isNative) {
    // Native-only features
  }
}
```

### Keyboard

```typescript
import { useKeyboard } from '@/hooks/use-native';

function MyComponent() {
  const { isVisible, keyboardHeight, hide } = useKeyboard();

  return (
    <div style={{ paddingBottom: keyboardHeight }}>
      {/* Your content */}
    </div>
  );
}
```

## Troubleshooting

### iOS Build Errors

1. Clean build: Product → Clean Build Folder (⇧⌘K)
2. Update CocoaPods: `cd ios/App && pod install --repo-update`

### Android Build Errors

1. Sync Gradle: File → Sync Project with Gradle Files
2. Invalidate caches: File → Invalidate Caches and Restart

### Server Connection Issues

- Ensure `cleartext: true` for HTTP localhost
- Check firewall settings
- Verify server URL is accessible from device

## Environment Variables

Set in `capacitor.config.ts` or use environment variables:

```bash
CAPACITOR_SERVER_URL=https://your-server.com npm run cap:sync
```
