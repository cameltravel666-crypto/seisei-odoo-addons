/** @odoo-module **/

// Nagashiro Theme - Remove "由 Odoo 提供支持" from POS receipt
// Since POS receipts are rendered in JavaScript, we use JavaScript to remove the text

console.log('Nagashiro Theme: pos_receipt_patch.js loaded');

function removeOdooBrandingFromReceipt() {
    try {
        // Find all text nodes containing "由 Odoo 提供支持" or "Powered by Odoo"
        // Search in the entire document, not just specific selectors
        const walker = document.createTreeWalker(
            document.body || document.documentElement,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: function(node) {
                    const text = node.textContent || '';
                    if (text.includes('由 Odoo 提供支持') || 
                        text.includes('Powered by Odoo')) {
                        return NodeFilter.FILTER_ACCEPT;
                    }
                    return NodeFilter.FILTER_REJECT;
                }
            }
        );
        
        const textNodes = [];
        let node;
        while (node = walker.nextNode()) {
            textNodes.push(node);
        }
        
        // Hide parent elements of text nodes containing Odoo branding
        textNodes.forEach(textNode => {
            const parent = textNode.parentElement;
            if (parent) {
                const text = parent.textContent.trim();
                // Hide if the parent contains only the branding text, or if it's a significant part
                if (text === '由 Odoo 提供支持' || text === 'Powered by Odoo' ||
                    text.includes('由 Odoo 提供支持') || text.includes('Powered by Odoo')) {
                    parent.style.display = 'none';
                    parent.style.visibility = 'hidden';
                    parent.style.opacity = '0';
                    parent.setAttribute('data-nagashiro-hidden', 'true');
                    console.log('Nagashiro Theme: Hidden Odoo branding in receipt:', parent, text);
                } else {
                    // If parent contains other text, try to remove just the branding part
                    const newText = text.replace(/由 Odoo 提供支持/g, '').replace(/Powered by Odoo/gi, '').trim();
                    if (newText !== text) {
                        // Replace the text content
                        textNode.textContent = textNode.textContent.replace(/由 Odoo 提供支持/g, '').replace(/Powered by Odoo/gi, '');
                        console.log('Nagashiro Theme: Removed Odoo branding text from receipt');
                    }
                }
            }
        });
        
        // Also search for receipt-specific containers
        const receiptSelectors = [
            '.receipt-screen .order-receipt',
            '.pos-receipt',
            '.receipt-screen .receipt',
            '[class*="receipt"]',
            '.order-receipt',
            '[class*="OrderReceipt"]'
        ];
        
        receiptSelectors.forEach(selector => {
            const receipts = document.querySelectorAll(selector);
            receipts.forEach(receipt => {
                // Find all elements containing the branding text
                const allElements = receipt.querySelectorAll('*');
                allElements.forEach(element => {
                    const text = element.textContent || '';
                    if (text.includes('由 Odoo 提供支持') || text.includes('Powered by Odoo')) {
                        // Check if this element only contains the branding text
                        if (text.trim() === '由 Odoo 提供支持' || text.trim() === 'Powered by Odoo') {
                            element.style.display = 'none';
                            element.style.visibility = 'hidden';
                            element.style.opacity = '0';
                            element.setAttribute('data-nagashiro-hidden', 'true');
                            console.log('Nagashiro Theme: Hidden Odoo branding element in receipt:', element);
                        }
                    }
                });
            });
        });
    } catch (e) {
        console.error('Nagashiro Theme: Error removing Odoo branding from receipt:', e);
    }
}

// Run immediately and repeatedly
function runRemoval() {
    removeOdooBrandingFromReceipt();
}

// Run when DOM is ready
if (document.readyState === 'complete') {
    setTimeout(runRemoval, 100);
    setTimeout(runRemoval, 500);
    setTimeout(runRemoval, 1000);
} else {
    window.addEventListener('load', function() {
        setTimeout(runRemoval, 100);
        setTimeout(runRemoval, 500);
        setTimeout(runRemoval, 1000);
    });
}

// Watch for dynamically added receipts
if (document.body) {
    const observer = new MutationObserver(function(mutations) {
        runRemoval();
    });
    
    observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true
    });
}

// Also run periodically
let attempts = 0;
const maxAttempts = 20;
const intervalId = setInterval(function() {
    attempts++;
    runRemoval();
    if (attempts >= maxAttempts) {
        clearInterval(intervalId);
    }
}, 500);

