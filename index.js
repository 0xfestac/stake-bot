const express = require('express');
const app = express();
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');
const fs = require('fs');

const PORT = process.env.PORT || 3000;
const TARGET_PROFILE = 'https://x.com/pp_privatejet';
const STAKE_USERNAME = "0xfestac";
const AUTH_TOKEN = process.env.AUTH_TOKEN;

// Web server to keep Render alive
app.get('/', (req, res) => res.send('Bot is active!'));
app.listen(PORT, () => console.log(`Web server listening on port ${PORT}`));

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const HISTORY_FILE = '/tmp/processed_tweets.json'; // Use /tmp for cloud
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
    const isGiveaway = textLower.includes("giveaway") || textLower.includes("stake") || textLower.includes("username");
    if (!isGiveaway) return null;
    return STAKE_USERNAME;
}

async function scanTimeline(page) {
    console.log(`[+] Scanning: ${TARGET_PROFILE}`);
    await page.goto(TARGET_PROFILE, { waitUntil: 'networkidle2', timeout: 120000 });
    await delay(5000);

    const tweets = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('[data-testid="tweet"]'))
            .map(el => ({
                text: el.querySelector('[data-testid="tweetText"]')?.innerText || "",
                url: Array.from(el.querySelectorAll('a')).find(a => a.href.includes('/status/'))?.href.split('?')[0]
            })).filter(t => t.url);
    });

    for (const tweet of tweets) {
        if (processedTweets.has(tweet.url)) continue;
        const payload = extractGiveawayVariable(tweet.text);
        if (payload) {
            const entryPage = await page.browser().newPage();
            await entryPage.setViewport({ width: 375, height: 812, isMobile: true });
            await entryPage.setCookie({ name: 'auth_token', value: AUTH_TOKEN, domain: '.x.com' });
            try {
                await entryPage.goto(tweet.url, { waitUntil: 'networkidle2' });
                await delay(5000);
                const replyBtn = await entryPage.$('[data-testid="reply"]');
                if (replyBtn) {
                    await replyBtn.tap();
                    await delay(3000);
                    await entryPage.evaluate((val) => {
                        const el = document.querySelector('div[role="textbox"]');
                        el.focus();
                        document.execCommand('insertText', false, val);
                    }, payload);
                    await entryPage.tap('[data-testid="tweetButton"]');
                    console.log(`[+] Replied to: ${tweet.url}`);
                }
            } catch (err) { console.error("Error:", err.message); }
            finally { await entryPage.close(); }
            processedTweets.add(tweet.url);
            saveHistory();
        }
    }
}

async function run() {
    if (!AUTH_TOKEN) return;
    const browser = await puppeteer.launch({
        executablePath: await chromium.executablePath(),
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        headless: chromium.headless,
    });
    const page = await browser.newPage();
    await page.setCookie({ name: 'auth_token', value: AUTH_TOKEN, domain: '.x.com' });
    await scanTimeline(page);
    await browser.close();
}

setInterval(run, 600000); // 10 minutes
run();
