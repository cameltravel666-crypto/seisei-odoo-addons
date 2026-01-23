import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';

// Static imports for standalone build compatibility
import en from '../../messages/en.json';
import zh from '../../messages/zh.json';
import ja from '../../messages/ja.json';

export const locales = ['en', 'zh', 'ja'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'ja';

const messages: Record<Locale, typeof en> = { en, zh, ja };

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get('locale')?.value;
  const locale = (locales.includes(localeCookie as Locale) ? localeCookie : defaultLocale) as Locale;

  return {
    locale,
    messages: messages[locale],
  };
});
