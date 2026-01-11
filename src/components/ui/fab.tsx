'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';

interface FABProps {
  href: string;
  label?: string;
}

export function FAB({ href, label }: FABProps) {
  return (
    <Link
      href={href}
      className="fixed right-4 bottom-20 z-40 flex items-center justify-center w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 active:scale-95 transition-all"
      aria-label={label || 'Create'}
    >
      <Plus className="w-6 h-6" />
    </Link>
  );
}
