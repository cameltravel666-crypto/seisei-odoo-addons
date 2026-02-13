/** @odoo-module **/
import { registry } from "@web/core/registry";

// Remove Odoo-specific user menu items at module load time
const userMenuRegistry = registry.category("user_menuitems");

// Wrap in try-catch — items may not exist in all configurations
try { userMenuRegistry.remove("odoo_account"); } catch (e) {}
try { userMenuRegistry.remove("documentation"); } catch (e) {}
try { userMenuRegistry.remove("support"); } catch (e) {}
