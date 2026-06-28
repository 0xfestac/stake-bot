const puppeteer = require('puppeteer');

async function runBot() {
    console.log("Initializing cloud worker...");
    const browser = await puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    // Using environment variable for security
    const authToken = process.env.AUTH_TOKEN;
    
    await page.setCookie({ 
        name: 'auth_token', 
        value: authToken, 
        domain: '.x.com' 
    });

    // Add your scanning and reply logic here...
    
    console.log("Bot cycle completed.");
    await browser.close();
}

// Run immediately, then repeat every 3 minutes
setInterval(runBot, 180000);
runBot();
