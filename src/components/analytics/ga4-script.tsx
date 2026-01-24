'use client';

import Script from 'next/script';
import { useEffect } from 'react';
import { initGA4 } from '@/lib/analytics';

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || '';

/**
 * GA4 Script Component
 * Add this to the root layout to enable Google Analytics tracking
 */
export function GA4Script() {
  useEffect(() => {
    // Initialize GA4 after the script loads
    initGA4();
  }, []);

  if (!GA_MEASUREMENT_ID) {
    return null;
  }

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="gtag-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_MEASUREMENT_ID}', {
            linker: {
              domains: ['seisei.tokyo', 'biznexus.seisei.tokyo'],
              accept_incoming: true
            }
          });
        `}
      </Script>
    </>
  );
}
