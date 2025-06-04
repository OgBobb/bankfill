// ==UserScript==
// @name         Faction Bank AutoFill (PDA/desktop fix)
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  Auto-fill bank transfer form on Torn, no dropdown required
// @author       OgBob
// @match        https://www.torn.com/factions.php*
// @grant        none
// ==/UserScript==

(async function () {
    'use strict';
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    const name = 'OgBob';
    const amount = '1000000';
    console.log(`[AutoFill] 🚀 Typing name: ${name}, amount: $${amount}`);

    // Wait for element matching selector
    async function waitForElement(selector, timeout = 8000) {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            const el = document.querySelector(selector);
            if (el && el.offsetParent !== null) return el;
            await sleep(250);
        }
        throw new Error(`⛔ Element not found: ${selector}`);
    }

    try {
        const nameInput = await waitForElement('input[aria-label="Give money or change balance"]');
        nameInput.focus();
        nameInput.value = name;
        nameInput.dispatchEvent(new Event('input', { bubbles: true }));

        await sleep(300);

        const moneyInput = document.querySelector('input[type="text"]:not([aria-label])');
        if (!moneyInput) throw new Error("⛔ Money input not found.");
        moneyInput.focus();
        moneyInput.value = amount;
        moneyInput.dispatchEvent(new Event('input', { bubbles: true }));

        console.log(`[AutoFill] ✅ Filled name and amount.`);
    } catch (err) {
        console.error(`[AutoFill] ❌ Script failed: ${err}`);
    }
})();
