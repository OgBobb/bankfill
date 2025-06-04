// ==UserScript==
// @name         Faction Bank AutoFill (bobbot)
// @namespace    http://tampermonkey.net/
// @version      2.4.2
// @description  Auto-fills the faction money form for a user with balance checks
// @author       OgBob
// @license      MIT
// @match        *://*.torn.com/factions.php*
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/OgBobb/bankfill/main/BankFill.user.js
// @updateURL    https://raw.githubusercontent.com/OgBobb/bankfill/main/BankFill.meta.js
// ==/UserScript==


// @match        *://*.torn.com/factions.php*

(function () {
    'use strict';

    const DEFAULT_TIMEOUT = 15000;

    function log(...args) {
        console.log('[AutoFill]', ...args);
    }

    function showWarning(message) {
        const existing = document.getElementById('autofill-warning');
        if (existing) existing.remove();

        const warn = document.createElement('div');
        warn.id = 'autofill-warning';
        warn.textContent = message;
        warn.style.position = 'fixed';
        warn.style.top = '20px';
        warn.style.left = '50%';
        warn.style.transform = 'translateX(-50%)';
        warn.style.background = '#ff4444';
        warn.style.color = 'white';
        warn.style.padding = '10px 20px';
        warn.style.fontWeight = 'bold';
        warn.style.zIndex = '9999';
        warn.style.borderRadius = '6px';
        warn.style.boxShadow = '0 0 10px black';
        warn.style.cursor = 'pointer';
        warn.title = 'Click to dismiss';
        warn.onclick = () => warn.remove();

        document.body.appendChild(warn);
    }

    /**
     * Parses window.location.hash (everything after '#') into a simple key/value map.
     * Example: "#/tab=controls&name=OgBob&amount=1000000" → { tab: "controls", name: "OgBob", amount: "1000000" }
     */
    function getParamsFromHash() {
        const hash = window.location.hash.replace(/^#\/?/, '');
        const params = {};
        hash.replace(/([^=&]+)=([^&]+)/g, (_, k, v) => {
            params[k] = decodeURIComponent(v);
        });
        return params;
    }

    /**
     * Waits up to `timeoutMs` milliseconds for document.querySelector(selector) to return a non-null element.
     * Rejects (throws) if timeout is exceeded.
     */
    async function waitForSelector(selector, timeoutMs = DEFAULT_TIMEOUT) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            const el = document.querySelector(selector);
            if (el) return el;
            await new Promise(res => setTimeout(res, 200));
        }
        throw new Error(`Timeout waiting for selector: ${selector}`);
    }

    /**
     * Looks for a visible dropdown item whose textContent (lowercased) includes `matcher` (lowercased).
     * Returns the first match, or null if none appear within `timeoutMs` milliseconds.
     * 
     * In Torn’s autocomplete, suggestions often appear under div.dropdown-content > button.item.
     */
    async function waitForDropdownItem(matcher, timeoutMs = 7000) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            // Grab all buttons inside any dropdown-content
            const items = Array.from(document.querySelectorAll('div.dropdown-content > button.item'));
            for (const item of items) {
                // Only consider items that are actually visible
                if (item.offsetParent === null) continue;
                const txt = item.textContent.trim().toLowerCase();
                if (txt.includes(matcher.toLowerCase())) {
                    return item;
                }
            }
            await new Promise(res => setTimeout(res, 300));
        }
        return null;
    }

    /**
     * Simulates “typing” into a text input `el` by:
     *   1) Clicking its wrapper (if present) to focus
     *   2) Clearing any existing value
     *   3) For each character in `text`, appending it to el.value and dispatching keydown/input/keyup
     *   4) Finally dispatching a change event at the end
     *
     * Waits between keystrokes to let Torn’s autocomplete logic fire.
     */
    async function simulateTyping(el, text) {
        const wrapper = el.closest('.inputWrapper') || el;
        wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
        wrapper.click();
        await new Promise(r => setTimeout(r, 300));

        el.focus();
        el.value = '';
        el.dispatchEvent(new InputEvent('input', { bubbles: true }));

        for (const char of text) {
            el.value += char;
            el.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
            el.dispatchEvent(new InputEvent('input', { bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
            await new Promise(r => setTimeout(r, 100));
        }

        // Dispatch a final “change” event after typing is complete
        el.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise(r => setTimeout(r, 700));
    }

    /**
     * Main autofill routine:
     *   1) Reads `name` and `amount` from the URL hash.
     *   2) Waits for Torn’s “searchAccount” input to appear, then simulates typing the player name.
     *   3) Waits for the autocomplete dropdown to populate, finds the correct entry, and clicks it.
     *   4) Extracts the user’s current faction balance from the “current balance” span.
     *   5) If balance is sufficient, waits for the money‐input field, sets the amount, and dispatches input.
     *   6) Leaves you ready to hit “Give Money.”
     */
    async function autoFill() {
        const { name, amount } = getParamsFromHash();
        if (!name || !amount) {
            log('❌ Missing name or amount in URL hash.');
            return;
        }

        log(`🚀 Starting autofill for name: ${name}, amount: ${amount}`);
        try {
            // 1) Wait for the “searchAccount” text input (player search) to load
            const input = await waitForSelector('input[name="searchAccount"]', 10000);
            log('✅ Found player input, starting typing...');
            await simulateTyping(input, name);

            // 2) Wait for Torn’s dropdown to appear, then pick the matching entry
            log('🔍 Waiting for dropdown to populate...');
            const dropdownItem = await waitForDropdownItem(name, 7000);
            if (!dropdownItem) {
                showWarning(`❌ Could not find dropdown match for ${name}`);
                return;
            }

            log(`✅ Found and clicking dropdown: ${dropdownItem.textContent.trim()}`);
            dropdownItem.click();

            // 3) After clicking, wait briefly for Torn to insert the hidden user‐ID, then read “current balance”
            let currentBalance = null;
            for (let i = 0; i < 30; i++) {
                const balanceEl = Array.from(document.querySelectorAll('span.nowrap___Egae2'))
                    .find(el => el.textContent.includes("current balance"));
                if (balanceEl) {
                    const text = balanceEl.textContent.replace(/[`’]/g, "'").trim();
                    const match = text.match(/\$([\d,]+)/);
                    if (match) {
                        currentBalance = parseInt(match[1].replace(/,/g, ''), 10);
                        break;
                    }
                }
                await new Promise(r => setTimeout(r, 300));
            }

            if (currentBalance === null) {
                log('⚠️ Could not read current balance after selecting player.');
                showWarning('⚠️ Could not detect player balance.');
                return;
            }

            const requestedAmount = parseInt(amount.replace(/,/g, ''), 10);
            if (requestedAmount > currentBalance) {
                const msg = `⛔ STOPPED: Trying to send $${requestedAmount.toLocaleString()}, but only $${currentBalance.toLocaleString()} is available.`;
                log(msg);
                showWarning(msg);
                return;
            }

            log(`💵 Balance OK: $${currentBalance.toLocaleString()} available`);

            // 4) Wait for the actual money‐input field and fill it
            const amountInput = await waitForSelector('input.input-money', 5000);
            amountInput.focus();
            amountInput.value = amount;
            amountInput.dispatchEvent(new Event('input', { bubbles: true }));

            log(`💰 Filled amount: $${amount}`);
            // At this point, you can manually click “Give Money.”
            // If you want to auto‐click it, uncomment the next line:
            // document.querySelector('#other_submit').click();

        } catch (e) {
            log('❌ AutoFill error:', e.message);
            showWarning(`AutoFill failed: ${e.message}`);
        }
    }

    // Run autoFill() on page load if hash contains “name=”
    window.addEventListener('load', () => {
        if (window.location.hash.includes('name=')) {
            log('📦 Script triggered. URL hash:', window.location.hash);
            setTimeout(autoFill, 1200);
        } else {
            log('⏹️ Hash does not include `name=`, script will not run.');
        }
    });

    // Also re-run if the hash changes (e.g. you navigate via a link)
    window.addEventListener('hashchange', () => {
        if (window.location.hash.includes('name=')) {
            log('🔄 Hash changed. New hash:', window.location.hash);
            setTimeout(autoFill, 1200);
        }
    });
})();
