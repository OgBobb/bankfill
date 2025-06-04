// ==UserScript==
// @name         Faction Bank AutoFill (bobbot) v2.6
// @namespace    http://tampermonkey.net/
// @version      2.6
// @description  Auto‐fills the faction money form for a user, with improved timing so it waits until Torn’s autocomplete is ready before typing (desktop + PDA support) 
// @author       OgBob
// @license      MIT
// @match        *://*.torn.com/factions.php*
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/OgBobb/bankfill/main/BankFill.user.js
// @updateURL    https://raw.githubusercontent.com/OgBobb/bankfill/main/BankFill.meta.js
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    const DEFAULT_TIMEOUT = 15000;

    function log(...args) {
        console.log('[AutoFill]', ...args);
    }
    function warn(...args) {
        console.warn('[AutoFill]', ...args);
    }
    function showWarning(msg) {
        const existing = document.getElementById('autofill-warning');
        if (existing) existing.remove();
        const w = document.createElement('div');
        w.id = 'autofill-warning';
        w.textContent = msg;
        w.style.position = 'fixed';
        w.style.top = '20px';
        w.style.left = '50%';
        w.style.transform = 'translateX(-50%)';
        w.style.background = '#ff4444';
        w.style.color = 'white';
        w.style.padding = '10px 20px';
        w.style.fontWeight = 'bold';
        w.style.zIndex = '9999';
        w.style.borderRadius = '6px';
        w.style.boxShadow = '0 0 10px black';
        w.style.cursor = 'pointer';
        w.title = 'Click to dismiss';
        w.onclick = () => w.remove();
        document.body.appendChild(w);
    }

    function getParamsFromHash() {
        const raw = window.location.hash.replace(/^#\/?/, '');
        const params = {};
        raw.replace(/([^=&]+)=([^&]+)/g, (_, k, v) => {
            params[k] = decodeURIComponent(v);
        });
        return params;
    }

    async function waitForSelector(selector, timeoutMs = DEFAULT_TIMEOUT) {
        const start = Date.now();
        while ((Date.now() - start) < timeoutMs) {
            const el = document.querySelector(selector);
            if (el) return el;
            await new Promise(r => setTimeout(r, 200));
        }
        throw new Error(`Timeout waiting for selector: ${selector}`);
    }

    /**
     * Waits until Torn’s own JS has likely attached event listeners to the input.
     * We check if the input has a non‐null “onkeydown” or “oninput” property,
     * which indicates that Torn’s autocomplete handler is bound.
     */
    async function waitForAutocompleteReady(inputEl, timeoutMs = 5000) {
        const start = Date.now();
        while ((Date.now() - start) < timeoutMs) {
            // If Torn’s code has set an onkeydown or oninput (or similar) on the element,
            // that’s a good sign autocomplete is wired up.
            // In many Torn builds, the input ends up with an internal listener on “onkeydown.”
            if (inputEl.onkeydown || inputEl.oninput) {
                return;
            }
            await new Promise(r => setTimeout(r, 200));
        }
        // If we time out, we proceed anyway – sometimes Torn wires it up slightly differently,
        // but at least we tried waiting.
    }

    /**
     * Looks for the faction player dropdown items. We try multiple selectors:
     *   1) div.dropdown-content > button.item   (desktop)
     *   2) li.autocomplete-item                 (legacy)
     *   3) div.ts-suggestion__item              (newer)
     *   4) li.ts-suggestion-item                (alternative)
     *   5) ul.ac-options li                     (PDA auto‐complete list)
     *
     * Returns the first visible <li> or <button> containing the “matcher” text.
     */
    async function waitForDropdownItem(matcher, timeoutMs = 7000) {
        const start = Date.now();
        while ((Date.now() - start) < timeoutMs) {
            const c1 = Array.from(document.querySelectorAll('div.dropdown-content > button.item'));
            const c2 = Array.from(document.querySelectorAll('li.autocomplete-item'));
            const c3 = Array.from(document.querySelectorAll('div.ts-suggestion__item'));
            const c4 = Array.from(document.querySelectorAll('li.ts-suggestion-item'));
            const c5 = Array.from(document.querySelectorAll('ul.ac-options li'));
            const candidates = [...c1, ...c2, ...c3, ...c4, ...c5];
            for (const item of candidates) {
                if (item.offsetParent === null) continue;
                const txt = item.textContent.trim().toLowerCase();
                if (txt.includes(matcher.toLowerCase())) {
                    return item;
                }
            }
            await new Promise(r => setTimeout(r, 200));
        }
        return null;
    }

    /**
     * Simulates typing each character into the input element.
     * This dispatches keydown → input → keyup for each char, with small delays,
     * then a final “change” event. We wait longer if the field was just created,
     * to ensure Torn’s autocomplete is fully listening.
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
            await new Promise(r => setTimeout(r, 120));
        }

        el.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise(r => setTimeout(r, 700));
    }

    async function autoFill() {
        const { name, amount } = getParamsFromHash();
        if (!name || !amount) {
            log('❌ Missing name or amount in URL hash.');
            return;
        }
        log(`🚀 Starting autofill for name="${name}", amount="${amount}"`);

        // 1) Wait until the “Give money → search player” input is in the DOM
        let nameInput = null;
        try {
            // Try the desktop selector first:
            nameInput = await waitForSelector('input[name="searchAccount"]', 8000);
            log('✅ Found desktop name input: input[name="searchAccount"]');
        } catch {
            warn('(Desktop) input[name="searchAccount"] not found.');
            // Try mobile/PDA selector by placeholder:
            try {
                nameInput = await waitForSelector('input[placeholder="Search player..."]', 8000);
                log('✅ Found PDA name input: input[placeholder="Search player..."]');
            } catch {
                warn('(PDA) input[placeholder="Search player..."] not found.');
                // Fallback: any text input inside faction controls
                try {
                    nameInput = await waitForSelector('.tab-content input[type="text"]', 8000);
                    log('✅ Found fallback text input: .tab-content input[type="text"] →', nameInput);
                } catch {
                    showWarning('❌ Could not locate username input on desktop or PDA.');
                    return;
                }
            }
        }

        // 2) Wait until Torn’s autocomplete handler is attached before injecting keystrokes
        await waitForAutocompleteReady(nameInput, 5000);
        log('✨ Autocomplete appears ready (or timed out waiting).');

        // 3) Simulate typing the full username
        log('🔤 Simulating typing into username input...');
        await simulateTyping(nameInput, name);

        // 4) Wait for and click the correct dropdown entry
        log('🔍 Waiting for dropdown suggestions...');
        const dropdownItem = await waitForDropdownItem(name, 7000);
        if (!dropdownItem) {
            showWarning(`❌ Could not find dropdown entry matching "${name}".`);
            return;
        }
        log(`✅ Found dropdown entry, clicking → ${dropdownItem.textContent.trim()}`);
        dropdownItem.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

        // 5) Now wait for “current balance” to appear and parse it
        let currentBalance = null;
        for (let i = 0; i < 30; i++) {
            const spanList = Array.from(document.querySelectorAll('span.nowrap___Egae2'));
            const balanceEl = spanList.find(el => el.textContent.includes('current balance'));
            if (balanceEl) {
                const txt = balanceEl.textContent.replace(/[`’]/g, "'").trim();
                const m = txt.match(/\$([\d,]+)/);
                if (m) {
                    currentBalance = parseInt(m[1].replace(/,/g, ''), 10);
                }
                break;
            }
            await new Promise(r => setTimeout(r, 300));
        }
        if (currentBalance === null) {
            showWarning('⚠️ Could not detect “current balance” after user selection.');
            return;
        }
        log(`💲 Current balance detected = $${currentBalance.toLocaleString()}`);

        // 6) Compare with requested amount
        const requestedAmount = parseInt(amount.replace(/,/g, ''), 10);
        if (requestedAmount > currentBalance) {
            const msg = `⛔ STOPPED: Attempting $${requestedAmount.toLocaleString()}, but only $${currentBalance.toLocaleString()} is available.`;
            showWarning(msg);
            return;
        }
        log(`✅ Balance OK – will fill $${requestedAmount.toLocaleString()}`);

        // 7) Wait for the money‐amount input to appear
        let amountInput = null;
        try {
            amountInput = await waitForSelector('input.input-money', 5000);
            log('✅ Found desktop amount input: input.input-money');
        } catch {
            warn('(Desktop) input.input-money not found.');
            try {
                amountInput = await waitForSelector('input[name="money"]', 5000);
                log('✅ Found PDA amount input: input[name="money"]');
            } catch {
                showWarning('❌ Could not find any amount input field.');
                return;
            }
        }

        // 8) Fill in the requested amount
        amountInput.focus();
        amountInput.value = amount;
        amountInput.dispatchEvent(new Event('input', { bubbles: true }));
        log(`💰 Filled amount: $${amount}`);
    }

    // When the page finishes loading, if the hash has “name=”, run autofill
    window.addEventListener('load', () => {
        if (window.location.hash.includes('name=')) {
            log('📦 Script triggered. URL hash =', window.location.hash);
            setTimeout(autoFill, 1200);
        } else {
            log('⏹️ URL hash does not include “name=”, script will not run.');
        }
    });

    // Also re‐run if the hash changes (e.g. clicking a Torn in‐page link)
    window.addEventListener('hashchange', () => {
        if (window.location.hash.includes('name=')) {
            log('🔄 Hash changed. New hash =', window.location.hash);
            setTimeout(autoFill, 1200);
        }
    });
})();
