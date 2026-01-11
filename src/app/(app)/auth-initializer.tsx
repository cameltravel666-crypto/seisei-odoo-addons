'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/stores/auth';
import type { JWTPayload } from '@/lib/auth';
import type { VisibleModule } from '@/types';

interface AuthInitializerProps {
  session: JWTPayload;
  modules: VisibleModule[];
  children: React.ReactNode;
}

export function AuthInitializer({ session, modules, children }: AuthInitializerProps) {
  const { setUser, setVisibleModules, setLoading } = useAuthStore();

  useEffect(() => {
    // Set user from session
    setUser({
      id: session.userId,
      tenantId: session.tenantId,
      odooUserId: session.odooUserId,
      odooLogin: '',
      displayName: '',
      email: null,
      isAdmin: session.isAdmin,
      tenant: {
        id: session.tenantId,
        tenantCode: session.tenantCode,
        name: session.tenantCode,
        planCode: 'basic',
      },
    });

    // Set visible modules
    setVisibleModules(modules);
    setLoading(false);
  }, [session, modules, setUser, setVisibleModules, setLoading]);

  return <>{children}</>;
}
