'use client';

import { useEffect } from 'react';

/**
 * ViewportHeight - iOS Safari 100vh 问题修复组件
 *
 * 问题：iOS Safari 的 100vh 包含地址栏高度，导致内容被裁切
 *
 * 解决方案：
 * 1. 使用 visualViewport API 获取实际可见视口高度
 * 2. 将高度值写入 CSS 变量 --app-vh
 * 3. CSS 使用 calc(var(--app-vh) * 100) 代替 100vh
 *
 * 测试验证：
 * - iPhone Safari: 地址栏收起/展开时高度正确调整
 * - iOS WebView (App): 固定高度，无地址栏
 * - Android WebView: 同上
 * - Desktop Chrome: 使用 100vh fallback
 */
export function ViewportHeight() {
  useEffect(() => {
    // 设置 --app-vh CSS 变量
    function setVh() {
      // 优先使用 visualViewport (更精确)
      const vh = window.visualViewport
        ? window.visualViewport.height * 0.01
        : window.innerHeight * 0.01;

      document.documentElement.style.setProperty('--app-vh', `${vh}px`);
    }

    // 初始设置
    setVh();

    // 监听 visualViewport 变化 (iOS Safari 地址栏收起/展开)
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', setVh);
    }

    // 监听 window resize 作为 fallback
    window.addEventListener('resize', setVh);

    // 监听 orientationchange (横竖屏切换)
    window.addEventListener('orientationchange', () => {
      // 延迟执行，等待方向切换完成
      setTimeout(setVh, 100);
    });

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', setVh);
      }
      window.removeEventListener('resize', setVh);
    };
  }, []);

  // 此组件不渲染任何 UI
  return null;
}
