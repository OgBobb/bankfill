// ==UserScript==
// @name         Faction Bank AutoFill (bobbot)
// @namespace    http://tampermonkey.net/
// @version      2.2
// @description  Auto-fills the faction money form for a user with balance checks
// @author       OgBob
// @license      MIT
// @match        https://www.torn.com/factions.php*
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/OgBobb/bankfill/main/BankFill.user.js
// @updateURL    https://raw.githubusercontent.com/OgBobb/bankfill/main/BankFill.meta.js
// ==/UserScript==

(async function () {
    'use strict';

    const timeout = 15000;

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
        const hash = window.location.hash;
        const params = {};
        hash.replace(/([^=&]+)=([^&]+)/g, (_, k, v) => params[k] = decodeURIComponent(v));
        return params;
    }

    async function waitForSelector(selector, timeoutMs = timeout) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            const el = document.querySelector(selector);
            if (el) return el;
            await new Promise(res => setTimeout(res, 200));
        }
        throw new Error(`Timeout: ${selector}`);
    }

    async function waitForDropdownItem(matcher, timeoutMs = 5000) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            const items = [...document.querySelectorAll('div.dropdown-content > button.item')];
            for (const item of items) {
                const visible = item.offsetParent !== null;
                const textMatch = item.textContent.trim().toLowerCase() === matcher.toLowerCase();
                if (visible && textMatch) {
                    return item;
                }
            }
            await new Promise(res => setTimeout(res, 250));
        }
        return null;
    }

    async function simulateTyping(el, text) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.focus();

        // 🟡 Click the wrapper to open dropdown
        el.closest('div.inputWrapper___Egae2')?.click();
        el.click();

        await new Promise(r => setTimeout(r, 500));
        el.value = '';
        el.dispatchEvent(new InputEvent('input', { bubbles: true }));

        for (const char of text) {
            el.value += char;
            el.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
            el.dispatchEvent(new InputEvent('input', { bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
            await new Promise(r => setTimeout(r, 100));
        }

        el.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise(r => setTimeout(r, 600));
    }

    async function autoFill() {
        const { name, amount } = getParamsFromHash();
        if (!name || !amount) {
            log('❌ Missing name or amount in URL hash.');
            return;
        }

        log(`🚀 Starting autofill for name: ${name}, amount: ${amount}`);

        try {
            const input = await waitForSelector('input[name="searchAccount"]', 10000);
            log('✅ Found player input, starting typing...');
            await simulateTyping(input, name);

            log('🔍 Waiting for dropdown to populate...');
            const dropdownItem = await waitForDropdownItem(name);
            if (!dropdownItem) {
                showWarning(`❌ Could not find dropdown match for ${name}`);
                return;
            }

            log(`✅ Found and clicking dropdown: ${dropdownItem.textContent.trim()}`);
            dropdownItem.click();

            let currentBalance = null;
            for (let i = 0; i < 30; i++) {
                const balanceEl = [...document.querySelectorAll('span.nowrap___Egae2')].find(
                    el => el.textContent.includes("current balance")
                );
                if (balanceEl) {
                    const text = balanceEl.textContent.replace(/[`’]/g, "'").trim();
                    const match = text.match(/\$([\d,]+)/);
                    if (match) {
                        currentBalance = parseInt(match[1].replace(/,/g, ''));
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

            const requestedAmount = parseInt(amount.replace(/,/g, ''));
            if (requestedAmount > currentBalance) {
                const msg = `⛔ STOPPED: Trying to send $${requestedAmount.toLocaleString()}, but only $${currentBalance.toLocaleString()} is available.`;
                log(msg);
                showWarning(msg);
                return;
            }

            log(`💵 Balance OK: $${currentBalance.toLocaleString()} available`);

            const amountInput = await waitForSelector('input.input-money');
            amountInput.focus();
            amountInput.value = amount;
            amountInput.dispatchEvent(new Event('input', { bubbles: true }));

            log(`💰 Filled amount: $${amount}`);
        } catch (e) {
            log('❌ AutoFill error:', e.message);
            showWarning(`AutoFill failed: ${e.message}`);
        }
    }

    if (window.location.hash.includes('name=')) {
        window.addEventListener('DOMContentLoaded', () => {
            log('📦 DOM loaded, triggering autofill...');
            setTimeout(autoFill, 1000);
        });
    } else {
        log('⏹️ Hash does not include `name=`, script will not run.');
    }
})();
