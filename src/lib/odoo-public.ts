/**
 * Public Odoo Client
 * Used for anonymous/public OCR processing
 * Connects to a dedicated public tenant in Odoo 18
 */

import { OdooRPC } from './odoo';

// Public tenant configuration from environment
const PUBLIC_ODOO_URL = process.env.PUBLIC_ODOO_URL || process.env.DEFAULT_ODOO_URL || 'https://testodoo.seisei.tokyo';
const PUBLIC_ODOO_DB = process.env.PUBLIC_ODOO_DB || 'public';
const PUBLIC_ODOO_USER = process.env.PUBLIC_ODOO_USER || 'public@seisei.tokyo';
const PUBLIC_ODOO_PASSWORD = process.env.PUBLIC_ODOO_PASSWORD || '';

// Singleton client instance
let publicOdooClient: OdooRPC | null = null;
let clientPromise: Promise<OdooRPC> | null = null;

/**
 * Get authenticated Odoo client for public tenant
 * Uses singleton pattern to reuse connection
 */
export async function getPublicOdooClient(): Promise<OdooRPC> {
  // Return existing client if available
  if (publicOdooClient) {
    return publicOdooClient;
  }

  // Wait for existing authentication if in progress
  if (clientPromise) {
    return clientPromise;
  }

  // Validate configuration
  if (!PUBLIC_ODOO_PASSWORD) {
    throw new Error('Public Odoo credentials not configured');
  }

  // Create and authenticate client
  clientPromise = (async () => {
    const client = new OdooRPC({
      baseUrl: PUBLIC_ODOO_URL,
      db: PUBLIC_ODOO_DB,
    });

    try {
      await client.authenticate(PUBLIC_ODOO_USER, PUBLIC_ODOO_PASSWORD);
      console.log(`[Public Odoo] Authenticated to ${PUBLIC_ODOO_URL} db=${PUBLIC_ODOO_DB}`);
      publicOdooClient = client;
      return client;
    } catch (error) {
      clientPromise = null;
      throw error;
    }
  })();

  return clientPromise;
}

/**
 * Reset the public client (useful if session expires)
 */
export function resetPublicOdooClient(): void {
  publicOdooClient = null;
  clientPromise = null;
}
