// ==UserScript==
// @name         Faction Bank AutoFill (bobbot)
// @namespace    http://tampermonkey.net/
// @version      3.5.0
// @description  Auto-fills the faction money form for a user, supporting both desktop and PDA skins
// @author       OgBob
// @license      MIT
// @match        *://*.torn.com/factions.php*
// @grant        none
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/OgBobb/bankfill/main/BankFill.user.js
// @updateURL    https://raw.githubusercontent.com/OgBobb/bankfill/main/BankFill.meta.js
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
        while (Date.now() - start < timeoutMs) {
            const el = document.querySelector(selector);
            if (el) return el;
            await new Promise((r) => setTimeout(r, 200));
        }
        throw new Error(`Timeout waiting for selector: ${selector}`);
    }

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

    async function simulateTyping(el, text) {
        const wrapper = el.closest('.inputWrapper') || el;
        wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
        wrapper.click();
        await new Promise((r) => setTimeout(r, 300));

        el.focus();
        el.value = '';
        el.dispatchEvent(new InputEvent('input', { bubbles: true }));

        // 🔧 wait before first keystroke so Torn doesn't miss it
        await new Promise(r => setTimeout(r, 250));

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

    async function detectBalance(maxTries = 30, delay = 300) {
        for (let i = 0; i < maxTries; i++) {
            const el = [...document.querySelectorAll('span, p')]
                .find(node => /current balance/i.test(node.textContent) && /\$\d/.test(node.textContent));
            if (el) {
                const num = el.textContent.replace(/[^\d]/g, '');
                if (num) return parseInt(num, 10);
            }
            await new Promise(r => setTimeout(r, delay));
        }
        return null;
    }

    async function autoFill() {
        const { name, amount } = getParamsFromHash();
        if (!name || !amount) {
            log('❌ Missing name or amount in URL hash.');
            return;
        }

        log(`🚀 Starting autofill for name: ${name}, amount: ${amount}`);
        try {
            let input;
            try {
                input = await waitForSelector('input[name="searchAccount"]', 8000);
                log('✅ Found desktop input: searchAccount');
            } catch {
                input = await waitForSelector('input[name="userword"]', 8000);
                log('✅ Found PDA input: userword');
            }

            log('🔤 Simulating typing into:', input);
            await simulateTyping(input, name);

            log('🔍 Waiting for dropdown to populate…');
            const dropdownItem = await waitForDropdownItem(name, 7000);
            if (!dropdownItem) {
                showWarning(`❌ Could not find dropdown match for "${name}"`);
                return;
            }
            log(`✅ Found dropdown item, clicking → ${dropdownItem.textContent.trim()}`);
            dropdownItem.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

            const currentBalance = await detectBalance();
            if (currentBalance == null) {
                log('⚠️ Could not detect player balance.');
                showWarning('⚠️ Could not detect player balance.');
                return;
            }
            log(`💲 Detected current balance = $${currentBalance.toLocaleString()}`);

            const requestedAmount = parseInt(amount.replace(/,/g, ''), 10);
            if (!requestedAmount || requestedAmount > currentBalance) {
                const msg = `⛔ STOPPED: Trying to send $${amount}, but only $${currentBalance.toLocaleString()} available.`;
                log(msg);
                showWarning(msg);
                return;
            }
            log(`✅ Balance OK – filling $${requestedAmount.toLocaleString()}`);

            let amountInput;
            try {
                amountInput = await waitForSelector('input.input-money', 5000);
                log('✅ Found desktop money input: input.input-money');
            } catch {
                amountInput = await waitForSelector('input[name="amount"]', 5000);
                log('✅ Found PDA money input: input[name="amount"]');
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

    // 🔁 debounce wrapper
    let autofillTimer;
    function triggerAutoFill() {
        clearTimeout(autofillTimer);
        autofillTimer = setTimeout(autoFill, 2000); // 2s wait to let Torn fully render
    }

    window.addEventListener('load', () => {
        if (window.location.hash.includes('name=')) {
            log('📦 Script triggered. URL hash =', window.location.hash);
            triggerAutoFill();
        } else {
            log('⏹️ URL hash does not include “name=”, script will not run.');
        }
    });

    window.addEventListener('hashchange', () => {
        if (window.location.hash.includes('name=')) {
            log('🔄 Hash changed. New hash =', window.location.hash);
            triggerAutoFill();
        }
    });
})();
