import { NextRequest, NextResponse } from 'next/server';

const locales = ['en', 'zh', 'ja'];

export async function POST(request: NextRequest) {
  try {
    const { locale } = await request.json();

    if (!locales.includes(locale)) {
      return NextResponse.json({ success: false, error: 'Invalid locale' }, { status: 400 });
    }

    const response = NextResponse.json({ success: true });
    response.cookies.set('locale', locale, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365, // 1 year
      sameSite: 'lax',
    });

    return response;
  } catch {
    return NextResponse.json({ success: false, error: 'Failed to set locale' }, { status: 500 });
  }
}
