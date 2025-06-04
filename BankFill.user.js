// ==UserScript==
// @name         Faction Bank AutoFill (bobbot)
// @namespace    http://tampermonkey.net/
// @version      3.4
// @description  Auto-fills the faction money form for a user with balance checks (PC+PDA)
// @author       OgBob
// @license      MIT
// @match        https://www.torn.com/factions.php*
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/OgBobb/bankfill/main/BankFill.user.js
// @updateURL    https://raw.githubusercontent.com/OgBobb/bankfill/main/BankFill.meta.js
// ==/UserScript==

(function () {
    'use strict';

    // Only run on URLs with a ?#/tab=controls&name=...&amount=...
    if (!location.hash.includes('tab=controls') || !location.hash.includes('name=') || !location.hash.includes('amount=')) return;

    const qs = location.hash.split('?')[1] || '';
    const params = {};
    for (const part of qs.split('&')) {
        const [key, val] = part.split('=');
        if (key && val) params[key] = decodeURIComponent(val);
    }
    const targetName = params['name'];
    const targetAmount = parseInt(params['amount'], 10);

    if (!targetName || !targetAmount || isNaN(targetAmount)) return;

    function dispatchInput(el) {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function showPopup(msg) {
        let popup = document.getElementById('bobbot-bankfill-popup');
        if (!popup) {
            popup = document.createElement('div');
            popup.id = 'bobbot-bankfill-popup';
            popup.style.cssText = 'position:fixed;top:30px;left:50%;transform:translateX(-50%);background:#c0392b;color:#fff;padding:15px 30px;border-radius:8px;font-size:1.3em;z-index:9999;box-shadow:0 0 12px #000c;opacity:0.97;';
            document.body.appendChild(popup);
        }
        popup.textContent = msg;
        popup.style.display = '';
        setTimeout(() => { popup.style.display = 'none'; }, 3700);
    }

    // Helper to wait for an element to appear
    function waitForSelector(selectors, maxTries=25, interval=150) {
        return new Promise(resolve => {
            let tries = 0;
            const loop = () => {
                let el = null;
                for (const sel of selectors) {
                    el = document.querySelector(sel);
                    if (el) break;
                }
                if (el) return resolve(el);
                if (++tries > maxTries) return resolve(null);
                setTimeout(loop, interval);
            };
            loop();
        });
    }

    // Helper to select from dropdown
    function selectUserDropdown(name) {
        return new Promise((resolve) => {
            let tries = 0;
            const timer = setInterval(() => {
                tries++;
                // For both PC and PDA, look for divs/buttons containing the name
                let candidates = Array.from(document.querySelectorAll('div[role="option"], .autocompleteItem, .userAutocomplete___xqlGt div'))
                    .filter(el => el.textContent && el.textContent.toLowerCase().includes(name.toLowerCase()));
                if (candidates.length > 0) {
                    candidates[0].click();
                    clearInterval(timer);
                    setTimeout(resolve, 250); // let React update
                } else if (tries > 25) {
                    clearInterval(timer);
                    showPopup('Failed to select the name in dropdown.');
                    resolve();
                }
            }, 100);
        });
    }

    async function tryAutoFill() {
        // Selectors for all Torn variants (PC and PDA)
        const nameSelectors = [
            'input[name="user"]',
            'input[name="searchAccount"]',
            'input.userAutocomplete___xqlGt',
            '.userAutocomplete___xqlGt input',
            'input[placeholder="search player..."]'
        ];
        const moneySelectors = [
            'input.input-money',
            'input[name="amount"]'
        ];

        const nameInput = await waitForSelector(nameSelectors, 40, 150);
        if (!nameInput) return showPopup('Name input not found!');
        nameInput.focus();
        nameInput.value = '';
        dispatchInput(nameInput);

        setTimeout(async () => {
            nameInput.value = targetName;
            dispatchInput(nameInput);

            // Wait for and click dropdown suggestion
            await selectUserDropdown(targetName);

            setTimeout(async () => {
                const moneyInput = await waitForSelector(moneySelectors, 20, 120);
                if (!moneyInput) return showPopup('Could not find amount field!');

                // Try to click the "Add to balance" radio
                let addRadio = document.querySelector('input[type="radio"][value="addToBalance"]') ||
                               document.querySelector('input[type="radio"][value="add"]');
                if (!addRadio) {
                    // fallback: 2nd radio button
                    let radios = document.querySelectorAll('input[type="radio"]');
                    if (radios.length >= 2) addRadio = radios[1];
                }
                if (addRadio && !addRadio.checked) addRadio.click();

                // Set the amount
                moneyInput.focus();
                moneyInput.value = targetAmount;
                dispatchInput(moneyInput);

                // --- Balance check ---
                // Get *highest* current balance found
                let balanceVal = 0;
                Array.from(document.querySelectorAll('span, p')).forEach(e => {
                    if (e.textContent && e.textContent.includes('current balance is')) {
                        let match = e.textContent.match(/\$([\d,]+)/);
                        if (match) {
                            let bal = parseInt(match[1].replace(/,/g, ''), 10);
                            if (bal > balanceVal) balanceVal = bal;
                        }
                    }
                });

                if (balanceVal < targetAmount) {
                    showPopup(`Not enough balance! You have $${balanceVal.toLocaleString()} (need $${targetAmount.toLocaleString()})`);
                    return;
                }

                // You can auto-submit by uncommenting the following lines:
                // let giveBtn = document.querySelector('button.wai-btn, button[type="submit"], .moneyActionBtn');
                // if (giveBtn) giveBtn.click();

            }, 200);
        }, 120);
    }

    setTimeout(tryAutoFill, 700);
})();
