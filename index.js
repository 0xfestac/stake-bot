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
const HISTORY_FILE = '/tmp/processed_tweets.json';
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
    if (textLower.includes("giveaway") || textLower.includes("stake") || textLower.includes("username")) {
        return STAKE_USERNAME;
    }
    return null;
}

async function scanTimeline(page) {
    // Spoofing the browser to look like a standard desktop user
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36');
    console.log(`[+] Scanning: ${TARGET_PROFILE}`);
    
    try {
        // 'domcontentloaded' is faster and less likely to timeout than 'networkidle2'
        await page.goto(TARGET_PROFILE, { waitUntil: 'domcontentloaded', timeout: 60000 });
        
        // Wait until tweets are actually visible before trying to scan
        await page.waitForSelector('[data-testid="tweet"]', { timeout: 30000 });
        await delay(3000);

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
                    await entryPage.goto(tweet.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
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
                } catch (err) { console.error("Reply Error:", err.message); }
                finally { await entryPage.close(); }
                processedTweets.add(tweet.url);
                saveHistory();
            }
        }
    } catch (err) { console.error(`[!] Scan failed: ${err.message}`); }
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

setInterval(run, 600000);
run();
