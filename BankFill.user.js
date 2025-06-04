// ==UserScript==
// @name         Faction Bank AutoFill (bobbot)
// @namespace    http://tampermonkey.net/
// @version      2.6.2
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

    const sleep = ms => new Promise(r => setTimeout(r, ms));

    const urlParams = new URLSearchParams(location.hash.replace('#', '?'));
    const targetName = urlParams.get('name') || 'OgBob';
    const targetAmount = urlParams.get('amount') || '1000000';

    console.log(`[AutoFill] 🚀 Starting with name: ${targetName}, amount: $${targetAmount}`);

    async function waitForElement(selector, max = 20, delay = 250) {
        for (let i = 0; i < max; i++) {
            const el = document.querySelector(selector);
            if (el) return el;
            await sleep(delay);
        }
        throw new Error(`⛔ Element not found: ${selector}`);
    }

    try {
        const userInput = await waitForElement('input[name="user"]');

        // ⬇️ Force "real" interaction
        userInput.scrollIntoView({ behavior: 'instant', block: 'center' });
        userInput.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        userInput.focus();
        userInput.click();
        await sleep(300); // Let Torn initialize dropdown listeners

        userInput.value = '';
        for (const char of targetName) {
            userInput.value += char;
            userInput.dispatchEvent(new Event('input', { bubbles: true }));
            await sleep(90);
        }

        await sleep(600); // Wait for dropdown to populate

        const dropdownItems = Array.from(document.querySelectorAll('.dropdown__item, .autocomplete__result'));
        const match = dropdownItems.find(el => el?.innerText?.includes(targetName));

        if (!match) {
            console.warn("[AutoFill] ❌ Could not find a matching dropdown item.");
            return;
        }

        match.click();
        console.log("[AutoFill] ✅ Selected user");

        await sleep(300);

        const amountInput = await waitForElement('input[name="money"]');
        amountInput.focus();
        amountInput.value = targetAmount;
        amountInput.dispatchEvent(new Event('input', { bubbles: true }));
        console.log(`[AutoFill] 💰 Filled amount: $${targetAmount}`);

    } catch (err) {
        console.error("[AutoFill] ❌ Script failed:", err);
    }
})();
