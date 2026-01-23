'use client';

import { useEffect } from 'react';

/**
 * SplashScreenHandler - Capacitor SplashScreen 控制组件
 *
 * 功能：
 * 1. 检测是否在 Capacitor 环境中运行
 * 2. 等待 Web 内容加载完成
 * 3. 平滑隐藏 SplashScreen
 * 4. 防止白屏闪烁 (Flash of White Screen)
 *
 * 配合策略：
 * - capacitor.config.ts: launchAutoHide: false
 * - layout.tsx: inline critical CSS 设置背景色
 * - 本组件: 在合适时机隐藏 splash
 */
export function SplashScreenHandler() {
  useEffect(() => {
    // 动态导入 Capacitor 模块 (仅在 App 环境中可用)
    const hideSplash = async () => {
      try {
        // 检查是否在 Capacitor 环境中
        const { Capacitor } = await import('@capacitor/core');

        if (!Capacitor.isNativePlatform()) {
          // 不在原生 App 中，无需处理
          return;
        }

        // 导入 SplashScreen 插件
        const { SplashScreen } = await import('@capacitor/splash-screen');

        // 等待一小段时间确保 CSS 完全应用
        // 这比使用 requestAnimationFrame 更可靠
        await new Promise(resolve => setTimeout(resolve, 100));

        // 使用渐变动画隐藏 splash screen
        await SplashScreen.hide({
          fadeOutDuration: 300, // 300ms 渐变
        });

        console.log('[SplashScreen] Hidden successfully');
      } catch (error) {
        // 在非 Capacitor 环境中会失败，这是正常的
        if (error instanceof Error && !error.message.includes('not implemented')) {
          console.warn('[SplashScreen] Error hiding:', error);
        }
      }
    };

    // 等待页面完全加载后再隐藏 splash
    if (document.readyState === 'complete') {
      hideSplash();
    } else {
      window.addEventListener('load', hideSplash, { once: true });
    }

    return () => {
      window.removeEventListener('load', hideSplash);
    };
  }, []);

  // 此组件不渲染任何 UI
  return null;
}
