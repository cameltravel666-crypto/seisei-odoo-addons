'use client';

import { useEffect, useState, useCallback } from 'react';

// Check if running in Capacitor native app
export function useIsNative() {
  const [isNative, setIsNative] = useState(false);

  useEffect(() => {
    // Capacitor injects a window.Capacitor object
    setIsNative(typeof window !== 'undefined' && !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());
  }, []);

  return isNative;
}

// Get current platform
export function usePlatform(): 'ios' | 'android' | 'web' {
  const [platform, setPlatform] = useState<'ios' | 'android' | 'web'>('web');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
    if (cap?.getPlatform) {
      const p = cap.getPlatform();
      if (p === 'ios' || p === 'android') {
        setPlatform(p);
      }
    }
  }, []);

  return platform;
}

// Haptic feedback hook
export function useHaptics() {
  const isNative = useIsNative();

  const impact = useCallback(async (style: 'light' | 'medium' | 'heavy' = 'medium') => {
    if (!isNative) return;

    try {
      const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
      const styleMap = {
        light: ImpactStyle.Light,
        medium: ImpactStyle.Medium,
        heavy: ImpactStyle.Heavy,
      };
      await Haptics.impact({ style: styleMap[style] });
    } catch (e) {
      console.log('Haptics not available', e);
    }
  }, [isNative]);

  const vibrate = useCallback(async (duration = 100) => {
    if (!isNative) return;

    try {
      const { Haptics } = await import('@capacitor/haptics');
      await Haptics.vibrate({ duration });
    } catch (e) {
      console.log('Haptics not available', e);
    }
  }, [isNative]);

  const selectionChanged = useCallback(async () => {
    if (!isNative) return;

    try {
      const { Haptics } = await import('@capacitor/haptics');
      await Haptics.selectionChanged();
    } catch (e) {
      console.log('Haptics not available', e);
    }
  }, [isNative]);

  return { impact, vibrate, selectionChanged };
}

// Status bar hook
export function useStatusBar() {
  const isNative = useIsNative();

  const setStyle = useCallback(async (style: 'dark' | 'light') => {
    if (!isNative) return;

    try {
      const { StatusBar, Style } = await import('@capacitor/status-bar');
      await StatusBar.setStyle({ style: style === 'dark' ? Style.Dark : Style.Light });
    } catch (e) {
      console.log('StatusBar not available', e);
    }
  }, [isNative]);

  const setBackgroundColor = useCallback(async (color: string) => {
    if (!isNative) return;

    try {
      const { StatusBar } = await import('@capacitor/status-bar');
      await StatusBar.setBackgroundColor({ color });
    } catch (e) {
      console.log('StatusBar not available', e);
    }
  }, [isNative]);

  const hide = useCallback(async () => {
    if (!isNative) return;

    try {
      const { StatusBar } = await import('@capacitor/status-bar');
      await StatusBar.hide();
    } catch (e) {
      console.log('StatusBar not available', e);
    }
  }, [isNative]);

  const show = useCallback(async () => {
    if (!isNative) return;

    try {
      const { StatusBar } = await import('@capacitor/status-bar');
      await StatusBar.show();
    } catch (e) {
      console.log('StatusBar not available', e);
    }
  }, [isNative]);

  return { setStyle, setBackgroundColor, hide, show };
}

// Keyboard hook
export function useKeyboard() {
  const isNative = useIsNative();
  const [isVisible, setIsVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (!isNative) return;

    let cleanup: (() => void) | undefined;

    (async () => {
      try {
        const { Keyboard } = await import('@capacitor/keyboard');

        const showHandler = await Keyboard.addListener('keyboardWillShow', (info) => {
          setIsVisible(true);
          setKeyboardHeight(info.keyboardHeight);
        });

        const hideHandler = await Keyboard.addListener('keyboardWillHide', () => {
          setIsVisible(false);
          setKeyboardHeight(0);
        });

        cleanup = () => {
          showHandler.remove();
          hideHandler.remove();
        };
      } catch (e) {
        console.log('Keyboard not available', e);
      }
    })();

    return () => cleanup?.();
  }, [isNative]);

  const hide = useCallback(async () => {
    if (!isNative) return;

    try {
      const { Keyboard } = await import('@capacitor/keyboard');
      await Keyboard.hide();
    } catch (e) {
      console.log('Keyboard not available', e);
    }
  }, [isNative]);

  return { isVisible, keyboardHeight, hide };
}
