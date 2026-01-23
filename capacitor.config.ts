import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.seisei.biznexus',
  appName: 'Seisei BizNexus',
  webDir: 'public', // Placeholder - we use remote URL
  server: {
    // Production server
    url: 'https://biznexus.seisei.tokyo',
    cleartext: false,
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true, // Auto-hide after duration
      backgroundColor: '#f8fafc', // Match login page gradient start (slate-50)
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'DARK', // Dark text on light background
      backgroundColor: '#f8fafc', // Match splash background
    },
  },
  ios: {
    contentInset: 'always',
    allowsLinkPreview: false,
    // Enable WebView scroll - CSS controls which element scrolls
    scrollEnabled: true,
    // Xcode project settings
    scheme: 'Seisei BizNexus',
    // Disable caching to always load fresh content
    limitsNavigationsToAppBoundDomains: false,
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
