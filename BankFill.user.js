// ==UserScript==
// @name         Faction Bank AutoFill (bobbot)
// @namespace    http://tampermonkey.net/
// @version      2.6.3
// @description  Auto-fills the faction money form reliably, even in PDA/mobile mode.
// @author       OgBob
// @license      MIT
// @match        https://www.torn.com/factions.php*
// @grant        none
// ==/UserScript==

(async function () {
    'use strict';

    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

    const urlParams = new URLSearchParams(location.hash.replace('#', '?'));
    const targetName = urlParams.get('name') || 'OgBob';
    const targetAmount = urlParams.get('amount') || '1000000';
    console.log(`[AutoFill] 🚀 Starting with name: ${targetName}, amount: $${targetAmount}`);

    // Wait until the bank tab is actually visible (not just in URL hash)
    async function waitForBankTab() {
        for (let i = 0; i < 30; i++) {
            const input = document.querySelector('input[name="user"], input[placeholder*="player"], .faction-controls input');
            if (input && input.offsetParent !== null) return input;
            await sleep(500);
        }
        throw new Error("⛔ Bank input never became visible.");
    }

    try {
        const userInput = await waitForBankTab();

        // Wake it up like a user
        userInput.scrollIntoView({ behavior: 'instant', block: 'center' });
        userInput.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        userInput.focus();
        userInput.click();
        await sleep(400);

        // Type the name
        userInput.value = '';
        for (const char of targetName) {
            userInput.value += char;
            userInput.dispatchEvent(new Event('input', { bubbles: true }));
            await sleep(100);
        }

        await sleep(600);

        const dropdownItems = Array.from(document.querySelectorAll('.dropdown__item, .autocomplete__result'));
        const match = dropdownItems.find(el => el?.innerText?.includes(targetName));
        if (!match) return console.warn("[AutoFill] ⚠️ Dropdown match not found.");
        match.click();
        console.log("[AutoFill] ✅ Selected name from dropdown");

        await sleep(300);

        const amountInput = document.querySelector('input[name="money"]');
        if (!amountInput) throw new Error("⛔ Amount input not found.");
        amountInput.focus();
        amountInput.value = targetAmount;
        amountInput.dispatchEvent(new Event('input', { bubbles: true }));
        console.log(`[AutoFill] 💰 Filled amount: $${targetAmount}`);

    } catch (err) {
        console.error("[AutoFill] ❌ Script failed:", err);
    }
})();
