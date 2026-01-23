'use client';

/**
 * App Channel Detection Utilities
 *
 * Used for App Store compliance (Apple Guidelines 3.1.1, 3.1.3):
 * - iOS App Store builds must not show external purchase links
 * - iOS App Store builds must not reference subscription pricing
 * - Web and other channels maintain full functionality
 */

import { useEffect, useState } from 'react';

// Environment variable for app channel (set at build time)
const APP_CHANNEL = process.env.NEXT_PUBLIC_APP_CHANNEL || 'web';

/**
 * Check if running in iOS App Store build (client-side hook)
 *
 * Returns true when:
 * - Running in Capacitor native app
 * - Platform is iOS
 * - App channel is 'appstore'
 *
 * Use this to hide subscription/pricing UI elements
 */
export function useIsIOSAppStoreBuild(): boolean {
  const [isIOSAppStore, setIsIOSAppStore] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const cap = (window as unknown as {
      Capacitor?: {
        isNativePlatform?: () => boolean;
        getPlatform?: () => string;
      }
    }).Capacitor;

    // Check if running in native iOS with appstore channel
    const isNative = cap?.isNativePlatform?.() ?? false;
    const platform = cap?.getPlatform?.() ?? 'web';
    const isAppStoreChannel = APP_CHANNEL === 'appstore';

    setIsIOSAppStore(isNative && platform === 'ios' && isAppStoreChannel);
  }, []);

  return isIOSAppStore;
}

/**
 * Check if running in any native app (iOS or Android)
 * This is a convenience wrapper that combines platform detection
 */
export function useIsNativeApp(): boolean {
  const [isNative, setIsNative] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const cap = (window as unknown as {
      Capacitor?: { isNativePlatform?: () => boolean }
    }).Capacitor;

    setIsNative(cap?.isNativePlatform?.() ?? false);
  }, []);

  return isNative;
}

/**
 * Get current platform
 */
export function usePlatform(): 'ios' | 'android' | 'web' {
  const [platform, setPlatform] = useState<'ios' | 'android' | 'web'>('web');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const cap = (window as unknown as {
      Capacitor?: { getPlatform?: () => string }
    }).Capacitor;

    if (cap?.getPlatform) {
      const p = cap.getPlatform();
      if (p === 'ios' || p === 'android') {
        setPlatform(p);
      }
    }
  }, []);

  return platform;
}

/**
 * Get app channel (web, appstore, playstore, enterprise, etc.)
 */
export function getAppChannel(): string {
  return APP_CHANNEL;
}

/**
 * Server-side check for app channel
 * Note: Cannot detect Capacitor on server, use for channel-based logic only
 */
export function isAppStoreChannel(): boolean {
  return APP_CHANNEL === 'appstore';
}

/**
 * Neutral message for restricted features in iOS App Store builds
 * Use this instead of subscription/upgrade prompts
 */
export const FEATURE_RESTRICTED_MESSAGE = {
  ja: 'この機能は現在ご利用いただけません。管理者にお問い合わせください。',
  zh: '此功能目前不可用。请联系管理员。',
  en: 'This feature is currently unavailable. Please contact your administrator.',
};
