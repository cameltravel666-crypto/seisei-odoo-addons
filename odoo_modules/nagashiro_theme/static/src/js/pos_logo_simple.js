/** @odoo-module **/

// Nagashiro Theme - Simple POS Logo Replacement
// Minimal JavaScript to replace POS logo without interfering with Odoo initialization

console.log('Nagashiro Theme: pos_logo_simple.js loaded');

function replaceLogo() {
    try {
        const logos = document.querySelectorAll('img.pos-logo');
        console.log('Nagashiro Theme: Found', logos.length, 'logo(s)');
        
        if (logos.length === 0) {
            return false;
        }
        
        const newLogoSrc = '/nagashiro_theme/static/src/img/logo.png';
        let replaced = false;
        
        logos.forEach((logo, index) => {
            if (logo) {
                const currentSrc = logo.src || logo.getAttribute('src') || '';
                console.log('Nagashiro Theme: Logo', index, 'src:', currentSrc);
                
                if (currentSrc.includes('/web/static/img/logo.png') || 
                    (currentSrc.includes('logo.png') && !currentSrc.includes('nagashiro_theme'))) {
                    logo.setAttribute('src', newLogoSrc);
                    logo.src = newLogoSrc;
                    replaced = true;
                    console.log('Nagashiro Theme: Replaced logo', index, 'with', newLogoSrc);
                }
            }
        });
        
        return replaced;
    } catch (e) {
        console.error('Nagashiro Theme: Error replacing logo:', e);
        return false;
    }
}

function hideScreensaverLogo() {
    try {
        // First, try to find screensaver containers
        const screensaverSelectors = [
            '.pos-screensaver',
            '.pos .screensaver',
            '[class*="screensaver"]',
            '[class*="Screensaver"]',
            'div[class*="screensaver"]'
        ];
        
        let foundScreensaver = false;
        
        screensaverSelectors.forEach(selector => {
            const screensavers = document.querySelectorAll(selector);
            screensavers.forEach(screensaver => {
                foundScreensaver = true;
                console.log('Nagashiro Theme: Found screensaver:', selector, screensaver);
                
                // Use TreeWalker to find all text nodes containing "odoo"
                const walker = document.createTreeWalker(
                    screensaver,
                    NodeFilter.SHOW_TEXT,
                    null
                );
                
                const textNodes = [];
                let node;
                while (node = walker.nextNode()) {
                    const text = node.textContent || '';
                    if (text.toLowerCase().includes('odoo') && text.trim().length < 20) {
                        // Found "odoo" text (likely the logo text)
                        textNodes.push(node);
                    }
                }
                
                // Hide parent elements of text nodes containing "odoo"
                textNodes.forEach(textNode => {
                    const parent = textNode.parentElement;
                    if (parent) {
                        parent.style.display = 'none';
                        parent.style.visibility = 'hidden';
                        parent.style.opacity = '0';
                        parent.setAttribute('data-nagashiro-hidden', 'true');
                        console.log('Nagashiro Theme: Hidden screensaver logo element:', parent, parent.className);
                    }
                });
                
                // Also hide any elements with "odoo" in class name
                const odooElements = screensaver.querySelectorAll('[class*="odoo"], [class*="logo"]');
                odooElements.forEach(element => {
                    const className = element.className || '';
                    const text = element.textContent || '';
                    if (className.toLowerCase().includes('odoo') || 
                        className.toLowerCase().includes('logo') ||
                        text.toLowerCase().includes('odoo')) {
                        element.style.display = 'none';
                        element.style.visibility = 'hidden';
                        element.style.opacity = '0';
                        element.setAttribute('data-nagashiro-hidden', 'true');
                        console.log('Nagashiro Theme: Hidden screensaver element:', element);
                    }
                });
            });
        });
        
        // Always search for "odoo" text in POS interface (fallback method)
        const allElements = document.querySelectorAll('.pos *');
        allElements.forEach(element => {
            // Skip already hidden elements
            if (element.getAttribute('data-nagashiro-hidden') === 'true') {
                return;
            }
            
            const text = (element.textContent || '').trim();
            const className = element.className || '';
            
            // Check if element contains only "odoo" text (likely the logo)
            if (text.toLowerCase() === 'odoo' || 
                (text.toLowerCase().includes('odoo') && text.length < 10 && !text.includes(' '))) {
                // Check if it's in a screensaver-like context (centered, large text, or in screensaver)
                const style = window.getComputedStyle(element);
                const isCentered = style.textAlign === 'center';
                const fontSize = parseFloat(style.fontSize) || 0;
                const isLargeText = fontSize > 20;
                const isInScreensaver = element.closest('[class*="screensaver"]') !== null;
                
                // Hide if it matches screensaver logo characteristics
                if (isCentered || isLargeText || isInScreensaver) {
                    element.style.display = 'none';
                    element.style.visibility = 'hidden';
                    element.style.opacity = '0';
                    element.setAttribute('data-nagashiro-hidden', 'true');
                    console.log('Nagashiro Theme: Hidden "odoo" text element:', element, {
                        className: className,
                        tagName: element.tagName,
                        textAlign: style.textAlign,
                        fontSize: style.fontSize
                    });
                }
            }
        });
    } catch (e) {
        console.error('Nagashiro Theme: Error hiding screensaver logo:', e);
    }
}

// Use MutationObserver to watch for logo elements being added dynamically
function setupLogoWatcher() {
    try {
        if (!document.body) {
            return;
        }
        
        const observer = new MutationObserver(function(mutations) {
            replaceLogo();
            hideScreensaverLogo();
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: false
        });
        
        console.log('Nagashiro Theme: MutationObserver setup complete');
    } catch (e) {
        console.error('Nagashiro Theme: Error setting up watcher:', e);
    }
}

// Run immediately and also set up watcher
if (document.body) {
    setTimeout(replaceLogo, 100);
    setTimeout(hideScreensaverLogo, 100);
    setupLogoWatcher();
} else {
    // Wait for body to be available
    const checkBody = setInterval(function() {
        if (document.body) {
            clearInterval(checkBody);
            setTimeout(replaceLogo, 100);
            setTimeout(hideScreensaverLogo, 100);
            setupLogoWatcher();
        }
    }, 50);
    
    // Timeout after 5 seconds
    setTimeout(function() {
        clearInterval(checkBody);
    }, 5000);
}

// Also try periodically (but only a few times)
let attempts = 0;
const maxAttempts = 10;
const intervalId = setInterval(function() {
    attempts++;
    replaceLogo();
    hideScreensaverLogo();
    if (attempts >= maxAttempts) {
        clearInterval(intervalId);
        console.log('Nagashiro Theme: Logo replacement attempts finished');
    }
}, 500);

