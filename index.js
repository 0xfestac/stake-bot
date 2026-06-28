const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(port, () => console.log(`Web server listening on port ${port}`));

const puppeteer = require('puppeteer-core');
const fs = require('fs');

const TARGET_PROFILE = 'https://x.com/pp_privatejet';
const STAKE_USERNAME = "0xfestac";
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Use environment variable for token (works in Cloud and local export)
const AUTH_TOKEN = process.env.AUTH_TOKEN;

const HISTORY_FILE = 'processed_tweets.json';
let processedTweets = new Set();

if (fs.existsSync(HISTORY_FILE)) {
    try {
        const data = fs.readFileSync(HISTORY_FILE, 'utf8');
        processedTweets = new Set(JSON.parse(data));
    } catch (e) { processedTweets = new Set(); }
}

function saveHistory() {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify([...processedTweets]), 'utf8');
}

function extractGiveawayVariable(text) {
    const textLower = text.toLowerCase();
    const isGiveaway = textLower.includes("giveaway") || textLower.includes("stake") || textLower.includes("username") || textLower.includes("for tip");
    if (!isGiveaway) return null;

    const hashtagMatch = text.match(/#[a-zA-Z0-9_]+/);
    if (hashtagMatch) return `${STAKE_USERNAME} ${hashtagMatch[0]}`;

    const universalEmojiRegex = /\p{Extended_Pictographic}/gu;
    const emojisFound = text.match(universalEmojiRegex);
    
    if (emojisFound && emojisFound.length > 0) {
        const cleanEmojis = emojisFound.filter(e => e !== '😎' && e !== '🚀');
        if (cleanEmojis.length > 0) return `${STAKE_USERNAME} ${cleanEmojis[0]}`;
    }

    const separatorMatch = text.match(/[+\-—–:]/);
    if (separatorMatch) {
        const separatorIndex = text.indexOf(separatorMatch[0]);
        let afterSeparator = text.substring(separatorIndex + 1).trim();
        afterSeparator = afterSeparator.replace(/["'“‘”’]/g, "").replace(/for tip.*/i, "").replace(/drop.*/i, "").replace(/below.*/i, "");
        const cleanVar = afterSeparator.trim();
        if (cleanVar) return `${STAKE_USERNAME} ${cleanVar}`;
    }
    return `${STAKE_USERNAME}`;
}

async function scanTimeline(page) {
    console.log(`\n[+] Scanning: ${TARGET_PROFILE}`);
    await page.goto(TARGET_PROFILE, { waitUntil: 'networkidle2', timeout: 60000 });
    await delay(5000); 

    const tweets = await page.evaluate(() => {
        const elements = document.querySelectorAll('[data-testid="tweet"]');
        return Array.from(elements).filter(el => !el.innerText.toLowerCase().startsWith('pinned')).map(el => {
            const text = el.querySelector('[data-testid="tweetText"]')?.innerText || "";
            const url = Array.from(el.querySelectorAll('a')).find(a => a.href.includes('/status/'))?.href.split('?')[0];
            return { url, text };
        }).filter(t => t.url && t.text);
    });

    for (const tweet of tweets) {
        if (processedTweets.has(tweet.url)) continue;

        const payload = extractGiveawayVariable(tweet.text);
        if (payload) {
            console.log(`[✓] Match Found! Payload: "${payload}"`);
            const entryPage = await page.browser().newPage();
            await entryPage.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
            
            try {
                await entryPage.goto(tweet.url, { waitUntil: 'networkidle2', timeout: 45000 });
                await delay(6000);

                const replyButton = await entryPage.$('[data-testid="reply"], div[aria-label*="Reply"]');
                if (replyButton) await replyButton.tap();
                await delay(4000);

                const inputSelector = 'div[role="textbox"], [data-testid="tweetTextarea_0"]';
                await entryPage.waitForSelector(inputSelector, { timeout: 5000 });
                
                await entryPage.evaluate((sel, val) => {
                    const el = document.querySelector(sel);
                    el.focus();
                    document.execCommand('insertText', false, val);
                }, inputSelector, payload);

                await delay(2000);
                const sendButton = await entryPage.$('[data-testid="tweetButtonInline"], [data-testid="tweetButton"]');
                await sendButton.tap();
                
                console.log(`[+] Reply dispatched.`);
                processedTweets.add(tweet.url);
                saveHistory();
            } catch (err) { console.error(`[!] Failed:`, err.message); }
            finally { await entryPage.close(); }
            await delay(Math.floor(Math.random() * 20000) + 15000);
        } else {
            processedTweets.add(tweet.url); 
            saveHistory();
        }
    }
}

async function run() {
    if (!AUTH_TOKEN) { console.error("Missing AUTH_TOKEN!"); process.exit(1); }
    const browser = await puppeteer.launch({
        executablePath: '/data/data/com.termux/files/usr/bin/chromium-browser',
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setCookie({ name: 'auth_token', value: AUTH_TOKEN, domain: '.x.com' });
    await scanTimeline(page);
    await browser.close();
}

run();
