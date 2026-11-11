import 'dotenv/config';
import { chromium } from 'playwright';
import { generateToken } from '../auth/token.js';

async function testFitDrawer() {
  const candidateUserId = 'ee9c7230-e25f-4163-9675-b6c29e7b013a';
  const candidateEmail = 'same60806@gmail.com';

  const token = generateToken({
    userId: candidateUserId,
    email: candidateEmail,
    name: 'Candidate User',
  });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.goto('http://localhost:5173');
  await page.evaluate(
    ({ t, u }) => {
      localStorage.setItem('roleradar_auth_token', t);
      localStorage.setItem('roleradar_auth_user', JSON.stringify(u));
    },
    {
      t: token,
      u: { id: candidateUserId, email: candidateEmail, name: 'Candidate User', role: 'CANDIDATE' },
    }
  );

  await page.goto('http://localhost:5173/#/dashboard/verified-jobs');
  await page.waitForTimeout(2000);

  const cardCount = await page.locator('.vjc').count();
  const fitButtons = await page.locator('[data-job-fit-id]').count();
  console.log(`Verified Job Cards (.vjc): ${cardCount}`);
  console.log(`Fit Intelligence Buttons ([data-job-fit-id]): ${fitButtons}`);

  if (fitButtons > 0) {
    const firstBtn = page.locator('[data-job-fit-id]').first();
    const jobId = await firstBtn.getAttribute('data-job-fit-id');
    console.log(`Clicking Fit Intelligence button for job ${jobId}...`);
    await firstBtn.click();
    await page.waitForTimeout(1500);

    const drawer = page.locator('#job-fit-drawer, [role="dialog"]').first();
    const isVisible = await drawer.isVisible();
    const role = await drawer.getAttribute('role');
    const ariaModal = await drawer.getAttribute('aria-modal');
    const badgeText = await page.locator('.rr-fit-status, [data-fit-status], .kn-badge').first().textContent().catch(() => '');
    const drawerHtml = await drawer.innerHTML().catch(() => '');

    console.log(`Fit Drawer visible: ${isVisible}`);
    console.log(`Role: ${role}, aria-modal: ${ariaModal}`);
    console.log(`Badge Text: ${badgeText?.trim()}`);
    console.log(`Drawer snippet: ${drawerHtml.slice(0, 300).replace(/\s+/g, ' ')}`);

    // Check dispute and clarify buttons
    const disputeBtns = await page.locator('.rr-fit-dispute-btn, button:has-text("Dispute")').count();
    const clarifyBtns = await page.locator('.rr-fit-clarify-btn, button:has-text("Clarify")').count();
    console.log(`Dispute buttons: ${disputeBtns}, Clarify buttons: ${clarifyBtns}`);
  }

  await browser.close();
  process.exit(0);
}

testFitDrawer().catch(console.error);

