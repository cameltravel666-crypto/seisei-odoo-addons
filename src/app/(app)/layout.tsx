import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getVisibleModules } from '@/lib/features';
import { Navigation } from '@/components/layout/nav';
import { AuthInitializer } from './auth-initializer';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect('/login');
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
      <div className="min-h-screen bg-[var(--color-bg-page)]">
        <Navigation />
        {/* Main Content - Fixed header offset with safe area */}
        <main
          className="md:pl-64 pb-20 md:pb-0"
          style={{ paddingTop: 'calc(var(--height-header) + env(safe-area-inset-top, 0px))' }}
        >
          <div className="md:pt-0 p-[var(--page-padding-x)] md:p-[var(--space-6)]">{children}</div>
        </main>
      </div>
    </AuthInitializer>
  );
}
