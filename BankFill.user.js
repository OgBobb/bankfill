// ==UserScript==
// @name         Faction Bank AutoFill (bobbot)
// @namespace    http://tampermonkey.net/
// @version      2.6.1
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

    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

    const urlParams = new URLSearchParams(location.hash.replace('#', '?'));
    const targetName = urlParams.get('name') || 'OgBob';
    const targetAmount = urlParams.get('amount') || '1000000';

    console.log(`[AutoFill] 🚀 Starting with name: ${targetName}, amount: $${targetAmount}`);

    // Helper to wait for an element
    async function waitForElement(selector, maxRetries = 10, delay = 300) {
        for (let i = 0; i < maxRetries; i++) {
            const el = document.querySelector(selector);
            if (el) return el;
            await sleep(delay);
        }
        throw new Error(`Element not found: ${selector}`);
    }

    try {
        // Focus and type into the player input box
        const userInput = await waitForElement('input[name="user"]');
        userInput.focus();
        userInput.value = '';
        for (const char of targetName) {
            userInput.value += char;
            userInput.dispatchEvent(new Event('input', { bubbles: true }));
            await sleep(80); // Slight delay between keystrokes
        }

        // Wait for dropdown to appear
        await sleep(500);

        const dropdownItems = Array.from(document.querySelectorAll('.dropdown__item, .autocomplete__result'));
        const match = dropdownItems.find(el => el?.innerText?.includes(targetName));

        if (!match) {
            console.warn("[AutoFill] ❌ Could not find a matching dropdown item.");
            return;
        }

        match.click();
        console.log("[AutoFill] ✅ Clicked name from dropdown");

        await sleep(400);

        // Fill the amount input
        const amountInput = await waitForElement('input[name="money"]');
        amountInput.focus();
        amountInput.value = targetAmount;
        amountInput.dispatchEvent(new Event('input', { bubbles: true }));
        console.log(`[AutoFill] 💰 Filled amount: $${targetAmount}`);

    } catch (err) {
        console.error("[AutoFill] ❌ Script error:", err);
    }

})();
