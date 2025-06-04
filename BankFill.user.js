// ==UserScript==
// @name         Faction Bank AutoFill (bobbot)
// @namespace    http://tampermonkey.net/
// @version      2.5.1
// @description  Auto-fills the faction money form for a user, supporting both desktop and PDA skins
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
     * Looks for a visible dropdown item, trying multiple selectors:
     *   1) div.dropdown-content > button.item          (desktop)
     *   2) li.autocomplete-item                        (legacy UI)
     *   3) div.ts-suggestion__item                     (newer UI)
     *   4) li.ts-suggestion-item                       (alternative)
     *
     * Returns the first match whose textContent (lowercased) includes `matcher` (lowercased),
     * or null if none appear within `timeoutMs`.
     */
    async function waitForDropdownItem(matcher, timeoutMs = 7000) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            const items1 = Array.from(document.querySelectorAll('div.dropdown-content > button.item'));
            const items2 = Array.from(document.querySelectorAll('li.autocomplete-item'));
            const items3 = Array.from(document.querySelectorAll('div.ts-suggestion__item'));
            const items4 = Array.from(document.querySelectorAll('li.ts-suggestion-item'));
            const candidates = [...items1, ...items2, ...items3, ...items4];

            for (const item of candidates) {
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
     * Simulates “typing” into the input `el` by:
     *   1) Clicking its wrapper (if present) to focus.
     *   2) Clearing any existing value.
     *   3) For each character, appending to el.value and dispatching keydown → input → keyup.
     *   4) Finally dispatching a “change” event.
     *
     * Waits small delays so Torn’s autocomplete logic can run.
     */
    async function simulateTyping(el, text) {
        const wrapper = el.closest('.inputWrapper') || el;
        wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
        wrapper.click();
        await new Promise((r) => setTimeout(r, 300));

        el.focus();
        el.value = '';
        el.dispatchEvent(new InputEvent('input', { bubbles: true }));

        for (const char of text) {
            el.value += char;
            el.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
            el.dispatchEvent(new InputEvent('input', { bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
            await new Promise((r) => setTimeout(r, 120));
        }

        el.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise((r) => setTimeout(r, 700));
    }

    /**
     * Main autofill routine supporting both desktop and PDA:
     *   1) Read `name` and `amount` from the URL hash.
     *   2) Attempt to find desktop input[name="searchAccount"]; if not found, find PDA input[placeholder="Search player..."].
     *   3) Simulate typing the full `name`.
     *   4) Wait for the autocomplete dropdown and click the matching entry.
     *   5) Read “current balance” from <span class="nowrap___Egae2">…</span> and compare to `amount`.
     *   6) If balance is sufficient, fill the money‐input field (desktop: input.input-money; PDA fallback: input[name="money"]).
     *   7) Leaves you ready to click “GIVE MONEY.”
     */
    async function autoFill() {
        const { name, amount } = getParamsFromHash();
        if (!name || !amount) {
            log('❌ Missing name or amount in URL hash.');
            return;
        }

        log(`🚀 Starting autofill for name: ${name}, amount: ${amount}`);
        try {
            let input;
            // 2) Try desktop “searchAccount” first:
            try {
                input = await waitForSelector('input[name="searchAccount"]', 8000);
                log('✅ Found desktop input: searchAccount');
            } catch {
                // Fallback to PDA “Search player...” placeholder
                input = await waitForSelector('input[placeholder="Search player..."]', 8000);
                log('✅ Found PDA input: Search player...');
            }

            // 3) Type the name into that input
            log('🔤 Simulating typing into:', input);
            await simulateTyping(input, name);

            // 4) Wait for and click the matching dropdown item
            log('🔍 Waiting for dropdown to populate…');
            const dropdownItem = await waitForDropdownItem(name, 7000);
            if (!dropdownItem) {
                showWarning(`❌ Could not find dropdown match for "${name}"`);
                return;
            }
            log(`✅ Found dropdown item, clicking → ${dropdownItem.textContent.trim()}`);
            dropdownItem.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

            // 5) After clicking, wait for “current balance” and parse it
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
                log('⚠️ Could not read “current balance” after selecting player.');
                showWarning('⚠️ Could not detect player balance.');
                return;
            }
            log(`💲 Detected current balance = $${currentBalance.toLocaleString()}`);

            // 6) Compare requested amount
            const requestedAmount = parseInt(amount.replace(/,/g, ''), 10);
            if (requestedAmount > currentBalance) {
                const msg = `⛔ STOPPED: Trying to send $${requestedAmount.toLocaleString()}, but only $${currentBalance.toLocaleString()} available.`;
                log(msg);
                showWarning(msg);
                return;
            }
            log(`✅ Balance OK – filling $${requestedAmount.toLocaleString()}`);

            // 7) Fill the money‐input field:
            //    Desktop uses <input class="input-money">; PDA fallback uses <input name="money">
            let amountInput;
            try {
                amountInput = await waitForSelector('input.input-money', 5000);
                log('✅ Found desktop money input: input.input-money');
            } catch {
                amountInput = await waitForSelector('input[name="money"]', 5000);
                log('✅ Found PDA money input: money');
            }
            amountInput.focus();
            amountInput.value = amount;
            amountInput.dispatchEvent(new Event('input', { bubbles: true }));
            log(`💰 Filled amount: $${amount}`);
        } catch (err) {
            log('❌ AutoFill error:', err.message);
            showWarning(`AutoFill failed: ${err.message}`);
        }
    }

    // Run on initial page load if the hash contains “name=”
    window.addEventListener('load', () => {
        if (window.location.hash.includes('name=')) {
            log('📦 Script triggered. URL hash =', window.location.hash);
            setTimeout(autoFill, 1200);
        } else {
            log('⏹️ URL hash does not include “name=”, script will not run.');
        }
    });

    // Also re‐run if the hash ever changes (e.g. clicking a link that updates the fragment)
    window.addEventListener('hashchange', () => {
        if (window.location.hash.includes('name=')) {
            log('🔄 Hash changed. New hash =', window.location.hash);
            setTimeout(autoFill, 1200);
        }
    });
})();
