// ==UserScript==
// @name         Faction Bank Autofill (bobbot)
// @namespace    http://tampermonkey.net/
// @version      2.9
// @description  Fill name + amount on Torn PDA without clicking dropdown
// @author       OgBob
// @match        https://www.torn.com/factions.php*
// @grant        none
// ==/UserScript==

(async function () {
    'use strict';
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    const targetName = 'OgBob';
    const targetAmount = '1000000';
    console.log(`[AutoFill] 🚀 Typing name: ${targetName}, amount: $${targetAmount}`);

    async function waitForInput(placeholder) {
        for (let i = 0; i < 20; i++) {
            const el = [...document.querySelectorAll("input,textarea")].find(e =>
                e.placeholder?.toLowerCase().includes(placeholder)
            );
            if (el && el.offsetParent !== null) return el;
            await sleep(300);
        }
        throw new Error(`[AutoFill] ⛔ Couldn't find input with placeholder containing "${placeholder}"`);
    }

    try {
        const nameInput = await waitForInput('give money or change balance');
        nameInput.focus();
        nameInput.value = targetName;
        nameInput.dispatchEvent(new Event('input', { bubbles: true }));

        await sleep(500);

        const moneyInput = [...document.querySelectorAll('input')].find(e => e.type === 'text' && e.value === '');
        if (!moneyInput) throw new Error("[AutoFill] ⛔ Couldn't find money input.");
        moneyInput.focus();
        moneyInput.value = targetAmount;
        moneyInput.dispatchEvent(new Event('input', { bubbles: true }));

        console.log("[AutoFill] ✅ Filled both fields.");
    } catch (err) {
        console.error(`[AutoFill] ❌ Script failed: ${err}`);
    }
})();
