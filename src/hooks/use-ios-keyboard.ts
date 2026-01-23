/**
 * iOS Keyboard Inset Hook
 *
 * Uses the visualViewport API to detect keyboard open/close states on iOS.
 * When the keyboard opens, the visual viewport shrinks, and this hook calculates
 * the keyboard height to allow UI elements (like sticky action bars) to stay visible.
 *
 * Usage:
 * ```tsx
 * const { keyboardHeight, isKeyboardOpen } = useIOSKeyboardInset();
 *
 * // In sticky bar:
 * style={{ paddingBottom: `calc(12px + ${isKeyboardOpen ? keyboardHeight : 0}px + env(safe-area-inset-bottom, 0px))` }}
 * ```
 */
import { useState, useEffect, useCallback } from 'react';

interface KeyboardInset {
  keyboardHeight: number;
  isKeyboardOpen: boolean;
  viewportHeight: number;
}

export function useIOSKeyboardInset(): KeyboardInset {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(
    typeof window !== 'undefined' ? window.innerHeight : 0
  );

  const handleResize = useCallback(() => {
    if (typeof window === 'undefined') return;

    const visualViewport = window.visualViewport;
    if (!visualViewport) {
      // Fallback for browsers without visualViewport support
      setViewportHeight(window.innerHeight);
      setKeyboardHeight(0);
      setIsKeyboardOpen(false);
      return;
    }

    const windowHeight = window.innerHeight;
    const vpHeight = visualViewport.height;

    // Calculate keyboard height as the difference between window and viewport
    // This works because on iOS, when keyboard opens, visualViewport shrinks
    const kbHeight = Math.max(0, windowHeight - vpHeight);

    // Consider keyboard "open" if the height difference is significant (> 100px)
    // This threshold helps avoid false positives from browser chrome changes
    const isOpen = kbHeight > 100;

    setViewportHeight(vpHeight);
    setKeyboardHeight(kbHeight);
    setIsKeyboardOpen(isOpen);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Initial calculation
    handleResize();

    const visualViewport = window.visualViewport;

    if (visualViewport) {
      // Use visualViewport events for accurate keyboard detection
      visualViewport.addEventListener('resize', handleResize);
      visualViewport.addEventListener('scroll', handleResize);
    } else {
      // Fallback to window resize
      window.addEventListener('resize', handleResize);
    }

    // Also listen for focus events on input elements
    const handleFocusIn = () => {
      // Small delay to let the keyboard animation start
      setTimeout(handleResize, 100);
      setTimeout(handleResize, 300);
    };

    const handleFocusOut = () => {
      setTimeout(handleResize, 100);
    };

    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);

    return () => {
      if (visualViewport) {
        visualViewport.removeEventListener('resize', handleResize);
        visualViewport.removeEventListener('scroll', handleResize);
      } else {
        window.removeEventListener('resize', handleResize);
      }
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
    };
  }, [handleResize]);

  return {
    keyboardHeight,
    isKeyboardOpen,
    viewportHeight,
  };
}

/**
 * Hook for safe area insets
 * Returns CSS env() values as usable numbers when available
 */
export function useSafeAreaInsets() {
  const [insets, setInsets] = useState({
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Create a hidden element to measure CSS env() values
    const measure = document.createElement('div');
    measure.style.cssText = `
      position: fixed;
      top: env(safe-area-inset-top, 0px);
      bottom: env(safe-area-inset-bottom, 0px);
      left: env(safe-area-inset-left, 0px);
      right: env(safe-area-inset-right, 0px);
      pointer-events: none;
      visibility: hidden;
    `;
    document.body.appendChild(measure);

    const computedStyle = getComputedStyle(measure);

    setInsets({
      top: parseFloat(computedStyle.top) || 0,
      bottom: parseFloat(computedStyle.bottom) || 0,
      left: parseFloat(computedStyle.left) || 0,
      right: parseFloat(computedStyle.right) || 0,
    });

    document.body.removeChild(measure);
  }, []);

  return insets;
}
