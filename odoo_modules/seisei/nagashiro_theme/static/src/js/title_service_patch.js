/** @odoo-module **/
// Replace "Odoo" with "Nagashiro ERP" in the dynamic browser tab title.
// The static <title> is set via webclient_templates.xml, but Odoo JS
// overwrites it at runtime (e.g. "Odoo - Sales"). This observer catches
// every such update and patches the text.
new MutationObserver(() => {
    if (document.title.includes("Odoo")) {
        document.title = document.title.replace(/Odoo/gi, "Nagashiro ERP");
    }
}).observe(document.querySelector("title"), { childList: true });
