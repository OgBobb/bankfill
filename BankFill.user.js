// ==UserScript==
// @name         Faction Bank AutoFill (bobbot)
// @namespace    http://tampermonkey.net/
// @version      2.4.4
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
        // Remove leading “#/” or “#”
        const raw = window.location.hash.replace(/^#\/?/, '');
        const params = {};
        raw.replace(/([^=&]+)=([^&]+)/g, (_, k, v) => {
            params[k] = decodeURIComponent(v);
        });
        return params;
    }

    /**
     * Waits up to `timeoutMs` ms for document.querySelector(selector) to return a non-null element.
     * Throws if timeout elapses without finding anything.
     */
    async function waitForSelector(selector, timeoutMs = DEFAULT_TIMEOUT) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            const el = document.querySelector(selector);
            if (el) return el;
            await new Promise((r) => setTimeout(r, 200));
        }
        throw new Error(`Timeout waiting for selector: ${selector}`);
    }

    /**
     * Looks for a visible dropdown item (<button> inside div.dropdown-content)
     * whose textContent (lowercased) includes `matcher` (lowercased).
     * Returns it, or null if none appear within `timeoutMs` ms.
     */
    async function waitForDropdownItem(matcher, timeoutMs = 7000) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            const items = Array.from(
                document.querySelectorAll('div.dropdown-content > button.item')
            );
            for (const item of items) {
                // Only consider items that are actually visible
                if (item.offsetParent === null) continue;
                const txt = item.textContent.trim().toLowerCase();
                if (txt.includes(matcher.toLowerCase())) {
                    return item;
                }
            }
            await new Promise((r) => setTimeout(r, 300));
        }
        return null;
    }

    /**
     * The main autofill routine:
     *   1) Read `name` and `amount` from the URL hash.
     *   2) Wait for Torn’s “searchAccount” input, then set its full value to `name` and dispatch one “input” event.
     *   3) Wait for the autocomplete dropdown and click the matching entry.
     *   4) Read “current balance” from the DOM and compare to `amount`.
     *   5) If balance is enough, wait for the money‐input and set its value to `amount` + input event.
     *   6) Leaves you ready to press “GIVE MONEY.”
     */
    async function autoFill() {
        const { name, amount } = getParamsFromHash();
        if (!name || !amount) {
            log('❌ Missing name or amount in URL hash.');
            return;
        }

        log(`🚀 Starting autofill for name: ${name}, amount: ${amount}`);
        try {
            // 1) Wait for Torn’s player‐search input (name‐field)
            const input = await waitForSelector('input[name="searchAccount"]', 10000);
            log('✅ Found player input → setting full value…');
            input.focus();
            input.value = name;
            input.dispatchEvent(new InputEvent('input', { bubbles: true }));

            // 2) Wait a bit, then click the correct dropdown entry
            log('🔍 Waiting for dropdown to populate…');
            const dropdownItem = await waitForDropdownItem(name, 7000);
            if (!dropdownItem) {
                showWarning(`❌ Could not find dropdown match for ${name}`);
                return;
            }

            log(`✅ Found and clicking dropdown: ${dropdownItem.textContent.trim()}`);
            dropdownItem.dispatchEvent(
                new MouseEvent('click', { bubbles: true, cancelable: true })
            );

            // 3) After clicking, wait for “current balance” to appear and parse it
            let currentBalance = null;
            for (let i = 0; i < 30; i++) {
                const balanceEl = Array.from(
                    document.querySelectorAll('span.nowrap___Egae2')
                ).find((el) => el.textContent.includes('current balance'));
                if (balanceEl) {
                    const text = balanceEl.textContent.replace(/[`’]/g, "'").trim();
                    const match = text.match(/\$([\d,]+)/);
                    if (match) {
                        currentBalance = parseInt(match[1].replace(/,/g, ''), 10);
                        break;
                    }
                }
                await new Promise((r) => setTimeout(r, 300));
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

            // 4) Wait for the money‐input field and set its value
            const amountInput = await waitForSelector('input.input-money', 5000);
            amountInput.focus();
            amountInput.value = amount;
            amountInput.dispatchEvent(new Event('input', { bubbles: true }));

            log(`💰 Filled amount: $${amount}`);
            // Now you can click “GIVE MONEY” manually, or uncomment the next line:
            // document.querySelector('#other_submit').click();
        } catch (e) {
            log('❌ AutoFill error:', e.message);
            showWarning(`AutoFill failed: ${e.message}`);
        }
    }

    // Run on initial page load if the hash contains “name=”
    window.addEventListener('load', () => {
        if (window.location.hash.includes('name=')) {
            log('📦 Script triggered. URL hash:', window.location.hash);
            setTimeout(autoFill, 1200);
        } else {
            log('⏹️ Hash does not include `name=`, script will not run.');
        }
    });

    // Also rerun if the hash ever changes (e.g. clicking an in‐page link)
    window.addEventListener('hashchange', () => {
        if (window.location.hash.includes('name=')) {
            log('🔄 Hash changed. New hash:', window.location.hash);
            setTimeout(autoFill, 1200);
        }
    });
})();
