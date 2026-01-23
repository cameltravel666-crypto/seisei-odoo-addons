'use client';

/**
 * StickyActionBar Component
 *
 * A responsive sticky action bar that:
 * - Respects safe-area-inset-bottom on iOS devices
 * - Moves above the keyboard when it opens (iOS Safari/WebView)
 * - Works on both mobile and desktop layouts
 *
 * Usage:
 * ```tsx
 * <StickyActionBar>
 *   <button className="btn btn-primary">Save</button>
 * </StickyActionBar>
 * ```
 */
import { ReactNode } from 'react';
import { useIOSKeyboardInset } from '@/hooks/use-ios-keyboard';

interface StickyActionBarProps {
  children: ReactNode;
  className?: string;
  /** Show on mobile only (hidden on md and up) */
  mobileOnly?: boolean;
}

export function StickyActionBar({
  children,
  className = '',
  mobileOnly = false,
}: StickyActionBarProps) {
  const { keyboardHeight, isKeyboardOpen } = useIOSKeyboardInset();

  // Calculate bottom offset
  // On desktop (md+), we have a 64-wide sidebar so left needs adjustment
  // On mobile, we have a bottom tab bar (16 = 64px in tailwind units)
  // When keyboard is open, we add keyboard height to lift above it
  const bottomOffset = isKeyboardOpen ? keyboardHeight : 0;

  return (
    <>
      {/* Spacer to prevent content being hidden behind sticky bar */}
      <div
        className="w-full"
        style={{
          height: `calc(var(--height-bottom-bar, 64px) + env(safe-area-inset-bottom, 0px) + ${bottomOffset}px)`,
        }}
      />

      {/* Sticky Action Bar */}
      <div
        className={`
          fixed left-0 right-0 bg-white border-t border-gray-200 z-40
          ${mobileOnly ? 'md:hidden' : 'md:left-64'}
          ${className}
        `}
        style={{
          bottom: `calc(${isKeyboardOpen ? 0 : 'var(--height-tab-bar, 64px)'} + ${bottomOffset}px)`,
          // On desktop, bottom is 0; on mobile, it's above the tab bar
          // When keyboard is open on mobile, we ignore the tab bar height
          paddingBottom: `calc(var(--space-3, 12px) + env(safe-area-inset-bottom, 0px))`,
          paddingTop: 'var(--space-3, 12px)',
          paddingLeft: 'var(--space-4, 16px)',
          paddingRight: 'var(--space-4, 16px)',
          // Smooth transition when keyboard opens/closes
          transition: 'bottom 0.2s ease-out',
        }}
      >
        {children}
      </div>
    </>
  );
}

/**
 * StickyActionBarContent - Flex container for action bar buttons
 */
export function StickyActionBarContent({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex gap-2 ${className}`}>
      {children}
    </div>
  );
}

/**
 * Hook to get the padding needed for content above sticky action bar
 */
export function useStickyActionBarPadding() {
  const { keyboardHeight, isKeyboardOpen } = useIOSKeyboardInset();
  const baseHeight = 64; // var(--height-bottom-bar)
  const safeArea = 0; // Will be added via CSS env()
  const mobileTabBar = 64; // var(--height-tab-bar)

  return {
    mobile: baseHeight + safeArea + mobileTabBar + (isKeyboardOpen ? keyboardHeight : 0),
    desktop: baseHeight + safeArea,
    className: 'pb-32 md:pb-20',
  };
}
