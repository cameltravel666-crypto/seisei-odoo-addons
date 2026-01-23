'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Redirect to POS BOM page as they share the same functionality
export default function ProductsBomPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/pos/product-management/bom');
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-[200px]">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>
  );
}
