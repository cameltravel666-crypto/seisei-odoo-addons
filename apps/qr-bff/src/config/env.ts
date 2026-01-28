export default () => ({
  port: parseInt(process.env.PORT || '3100', 10),

  // Redis for token storage
  redis: {
    host: process.env.REDIS_HOST || 'odoo-redis',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || '',
    db: parseInt(process.env.REDIS_DB || '1', 10), // Use DB 1 for qr-bff
  },

  // Odoo connection
  odoo: {
    url: process.env.ODOO_URL || 'http://seisei-odoo-router:80',
    serviceLogin: process.env.ODOO_SERVICE_LOGIN || 'qr_service',
    servicePassword: process.env.ODOO_SERVICE_PASSWORD || '',
    timeout: parseInt(process.env.ODOO_TIMEOUT || '10000', 10),
    retries: parseInt(process.env.ODOO_RETRIES || '1', 10),
  },

  // Domain to database mapping (fallback if token not in Redis)
  domainDbMap: {
    'demo.nagashiro.top': 'ten_testodoo',
    'testodoo.seisei.tokyo': 'ten_testodoo',
  },

  // Default database for testing
  defaultDb: process.env.DEFAULT_DB || 'ten_testodoo',
});
