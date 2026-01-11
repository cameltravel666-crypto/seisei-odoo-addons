import { NextResponse } from 'next/server';
import { getSession, clearAuthCookie } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function POST() {
  try {
    const session = await getSession();

    if (session) {
      // Delete session from database
      await prisma.session.delete({
        where: { id: session.sessionId },
      }).catch(() => {
        // Session might already be deleted
      });
    }

    // Clear auth cookie
    await clearAuthCookie();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Logout Error]', error);
    // Always clear cookie even if there's an error
    await clearAuthCookie();
    return NextResponse.json({ success: true });
  }
}
