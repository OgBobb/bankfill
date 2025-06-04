// ==UserScript==
// @name         Faction Bank AutoFill (bobbot)
// @namespace    http://tampermonkey.net/
// @version      2.4.3
// @description  Auto-fills the faction money form for a user with balance checks
// @author       OgBob
// @license      MIT
// @match        *://*.torn.com/factions.php*
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/OgBobb/bankfill/main/BankFill.user.js
// @updateURL    https://raw.githubusercontent.com/OgBobb/bankfill/main/BankFill.meta.js
// @run-at       document-idle
// ==/UserScript==

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
     * Parses window.location.hash (everything after '#') into a key/value object.
     * Example: "#/tab=controls&name=OgBob&amount=1000000" 
     *   → { tab: "controls", name: "OgBob", amount: "1000000" }
     */
    function getParamsFromHash() {
        // Remove leading “#/” or “#”:
        const raw = window.location.hash.replace(/^#\/?/, '');
        const params = {};
        raw.replace(/([^=&]+)=([^&]+)/g, (_, k, v) => {
            params[k] = decodeURIComponent(v);
        });
        return params;
    }

    /**
     * Waits up to `timeoutMs` milliseconds for document.querySelector(selector) to return a non-null element.
     * Throws an Error if the timeout elapses without finding the element.
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
     * Looks for a visible dropdown item (under `div.dropdown-content > button.item`)
     * whose textContent (lowercased) includes `matcher`. Returns it, or null if none
     * appear within `timeoutMs` milliseconds.
     */
    async function waitForDropdownItem(matcher, timeoutMs = 7000) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
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
     * “Types” the string `text` into the input `el` by:
     *   1) Clicking its wrapper (if present) to focus
     *   2) Clearing any existing value
     *   3) For each character, appending it to el.value and dispatching keydown/input/keyup
     *   4) Finally dispatching a “change” event
     *
     * Waits a short delay between keystrokes so Torn’s autocomplete logic can fire.
     */
    async function simulateTyping(el, text) {
        // Some Torn inputs are wrapped in a `.inputWrapper` div—click that if it exists
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

        // Final “change” event after typing is complete
        el.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise(r => setTimeout(r, 700));
    }

    /**
     * The main autofill routine:
     *   1) Read `name` and `amount` from the URL hash.
     *   2) Wait for Torn’s “searchAccount” input (the “Give money to User” search).
     *   3) Simulate typing the `name` into that field.
     *   4) Wait for Torn’s autocomplete dropdown to appear, find the match, click it.
     *   5) Read the “current balance” from the DOM and compare to `amount`.
     *   6) If balance is OK, wait for the money‐input field and fill in the `amount`.
     *   7) Leave you ready to hit “GIVE MONEY.”
     */
    async function autoFill() {
        const { name, amount } = getParamsFromHash();
        if (!name || !amount) {
            log('❌ Missing name or amount in URL hash.');
            return;
        }

        log(`🚀 Starting autofill for name: ${name}, amount: ${amount}`);
        try {
            // 1) Wait for the search‐player input to load:
            const input = await waitForSelector('input[name="searchAccount"]', 10000);
            log('✅ Found player input, starting typing...');
            await simulateTyping(input, name);

            // 2) Wait for Torn’s dropdown to populate, then pick the matching entry
            log('🔍 Waiting for dropdown to populate...');
            const dropdownItem = await waitForDropdownItem(name, 7000);
            if (!dropdownItem) {
                showWarning(`❌ Could not find dropdown match for ${name}`);
                return;
            }

            log(`✅ Found and clicking dropdown: ${dropdownItem.textContent.trim()}`);
            dropdownItem.click();

            // 3) After clicking, wait for the “current balance” text to appear and parse it:
            let currentBalance = null;
            for (let i = 0; i < 30; i++) {
                // Torn’s “current balance” often lives in a <span class="nowrap___Egae2">…</span>
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

            // 4) Wait for the money‐input field, then fill it:
            const amountInput = await waitForSelector('input.input-money', 5000);
            amountInput.focus();
            amountInput.value = amount;
            amountInput.dispatchEvent(new Event('input', { bubbles: true }));

            log(`💰 Filled amount: $${amount}`);
            // Now the “Give Money” button is enabled; you can click it manually,
            // or uncomment the next line if you want it to auto-click:
            // document.querySelector('#other_submit').click();
        }
        catch (e) {
            log('❌ AutoFill error:', e.message);
            showWarning(`AutoFill failed: ${e.message}`);
        }
    }

    // Run autoFill() on initial load if the hash contains “name=”
    window.addEventListener('load', () => {
        if (window.location.hash.includes('name=')) {
            log('📦 Script triggered. URL hash:', window.location.hash);
            setTimeout(autoFill, 1200);
        } else {
            log('⏹️ Hash does not include `name=`, script will not run.');
        }
    });

    // Also re-run if the hash ever changes (e.g. you clicked a faction-link that updates the hash)
    window.addEventListener('hashchange', () => {
        if (window.location.hash.includes('name=')) {
            log('🔄 Hash changed. New hash:', window.location.hash);
            setTimeout(autoFill, 1200);
        }
    });
})();
