import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { QueryProvider } from "@/providers/query-provider";
import { ViewportHeight } from "@/components/layout/viewport-height";
import { SplashScreenHandler } from "@/components/layout/splash-screen-handler";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap", // Prevent layout shift during font loading
});

export const metadata: Metadata = {
  title: "Seisei BizNexus",
  description: "商家管理系统 - Odoo 18 CE Integration",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "BizNexus",
  },
  formatDetection: {
    telephone: false,
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#f8fafc', // Match splash screen for seamless transition
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <head>
        {/* Inline critical CSS to prevent flash during app startup */}
        <style dangerouslySetInnerHTML={{ __html: `
          /* Critical: Set background immediately to prevent white flash */
          html, body {
            background-color: #f8fafc !important;
            min-height: 100%;
          }
          /* Ensure smooth transition from splash to content */
          body {
            opacity: 1;
            transition: opacity 0.15s ease-out;
          }
          /* Hide content until hydration completes (prevents layout shift) */
          body.loading {
            opacity: 0;
          }
        `}} />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        {/* iOS Safari 100vh 修复：动态设置 --app-vh CSS 变量 */}
        <ViewportHeight />
        {/* Capacitor SplashScreen 控制：防止跳闪 */}
        <SplashScreenHandler />
        <NextIntlClientProvider locale={locale} messages={messages}>
          <QueryProvider>
            {children}
          </QueryProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
