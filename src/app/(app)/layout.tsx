import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getVisibleModules } from '@/lib/features';
import { Navigation } from '@/components/layout/nav';
import { AuthInitializer } from './auth-initializer';
import { SubscriptionBanner } from '@/components/subscription-banner';
import { ProvisioningWrapper } from './provisioning-wrapper';
import { prisma } from '@/lib/db';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect('/login');
  }

  // Check tenant's provision status
  const tenant = await prisma.tenant.findUnique({
    where: { id: session.tenantId },
    select: { provisionStatus: true },
  });

  // If tenant is still provisioning, show provisioning status page
  if (tenant?.provisionStatus === 'provisioning' || tenant?.provisionStatus === 'pending') {
    return <ProvisioningWrapper />;
  }

  // If provisioning failed, show provisioning status page with error
  if (tenant?.provisionStatus === 'failed') {
    return <ProvisioningWrapper />;
  }

  const visibleModules = await getVisibleModules(session.userId, session.tenantId);

  return (
    <AuthInitializer
      session={session}
      modules={visibleModules.map((m) => ({
        code: m.code,
        name: m.name,
        icon: m.icon,
        path: m.path,
      }))}
    >
      {/*
        App Shell 布局 - 统一的移动端/桌面端布局结构

        移动端: 固定 header + 可滚动 main
        桌面端: 固定侧边栏 + 可滚动 main

        CSS 控制在 globals.css 中通过媒体查询实现
        - [data-app-header="mobile"]: 移动端顶栏样式
        - [data-main-scroll]: 主滚动区样式
        - --app-header-total-h: 统一的顶栏高度（含 safe-area）
      */}
      <div
        className="app-shell bg-[var(--color-bg-page)]"
        data-app-shell
        suppressHydrationWarning
      >
        <Navigation />
        {/* Subscription status banner - shows warnings for expiring trials or payment issues */}
        <div className="md:pl-64">
          <SubscriptionBanner />
        </div>
        <main
          data-main-scroll
          data-app-main
          className="md:pl-64"
          suppressHydrationWarning
        >
          <div className="p-[var(--page-padding-x)] md:p-[var(--space-6)] pb-20 md:pb-6">{children}</div>
        </main>
      </div>
    </AuthInitializer>
  );
}
