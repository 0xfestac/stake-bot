const express = require('express');
const app = express();
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');
const fs = require('fs');

const PORT = process.env.PORT || 3000;
const TARGET_PROFILE = 'https://m.x.com/pp_privatejet'; // Using mobile site for efficiency
const STAKE_USERNAME = "0xfestac";
const AUTH_TOKEN = process.env.AUTH_TOKEN;

// Keep-alive web server
app.get('/', (req, res) => res.send('Bot is running efficiently!'));
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
    const t = text.toLowerCase();
    return (t.includes("giveaway") || t.includes("stake") || t.includes("username")) ? STAKE_USERNAME : null;
}

async function scanTimeline(page) {
    await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1');
    
    try {
        console.log(`[+] Accessing: ${TARGET_PROFILE}`);
        await page.goto(TARGET_PROFILE, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForSelector('article', { timeout: 30000 });
        await delay(5000);

        const tweets = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('article'))
                .map(el => ({ text: el.innerText || "", url: el.querySelector('a')?.href?.split('?')[0] }))
                .filter(t => t.url && t.url.includes('/status/'));
        });

        for (const tweet of tweets) {
            if (processedTweets.has(tweet.url)) continue;
            
            const payload = extractGiveawayVariable(tweet.text);
            if (payload) {
                console.log(`[!] Target found: ${tweet.url}`);
                await page.goto(tweet.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
                await delay(5000);
                
                // Attempt to reply
                const input = await page.$('div[role="textbox"]');
                if (input) {
                    await input.click();
                    await page.keyboard.type(payload);
                    await delay(2000);
                    // Click the 'Reply'/'Post' button
                    const btn = await page.$$('button[data-testid="tweetButton"]');
                    if (btn.length > 0) {
                        await btn[btn.length - 1].click();
                        console.log(`[+] Successfully replied.`);
                        processedTweets.add(tweet.url);
                        saveHistory();
                    }
                }
                await delay(10000); // Cool down after reply
            }
        }
    } catch (err) { console.error(`[!] Scan error: ${err.message}`); }
}

async function run() {
    if (!AUTH_TOKEN) return;
    const browser = await puppeteer.launch({
        executablePath: await chromium.executablePath(),
        args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'],
        headless: chromium.headless,
    });
    
    const page = await browser.newPage();
    await page.setCookie({ name: 'auth_token', value: AUTH_TOKEN, domain: '.x.com' });
    await scanTimeline(page);
    await browser.close();
}

setInterval(run, 600000); // Runs every 10 mins
run();
