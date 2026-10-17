import {chromium} from '@playwright/test';
import fs from 'node:fs';
const base=process.env.TEST_BASE_URL||'http://localhost:3000';
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,timeout:30000,args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];
page.on('pageerror',e=>errors.push(e.stack||e.message));
const check=(value,message)=>{if(!value)throw Error(message)};
async function checkSponsorCards(){
 const cards=page.locator('a.promotion-empty');
 check(await cards.count()===6,'All six empty cards must be full-card links');
 check(JSON.stringify(await page.locator('.promotion-tile-top b').allTextContents())===JSON.stringify(['$70','$50','$30','$70','$50','$30']),'Promotion prices differ from requested amounts');
 for(let index=0;index<6;index++){
  const card=cards.nth(index),label=card.locator('.promotion-placeholder');
  check((await card.innerText()).trim().replace(/\s+/g,' ')===`${['$70','$50','$30'][index%3]} Sponsor`,'Empty card should only show its price and Sponsor');
  const href=new URL(await card.getAttribute('href'),base);
  check(href.pathname==='/promote'&&href.searchParams.get('slot')===String(index+1),'Card must open its own booking selection');
  const bounds=await card.boundingBox(),text=await label.boundingBox();
  check(Math.abs(bounds.x+bounds.width/2-text.x-text.width/2)<2&&Math.abs(bounds.y+bounds.height/2-text.y-text.height/2)<2,'Sponsor label must be centered in its card');
 }
}
try{
 await page.goto(base,{waitUntil:'networkidle'});
 await page.getByRole('heading',{name:'The winner’s circle.'}).waitFor();
 check(await page.locator('.promotion-left .promotion-tile').count()===3,'Three left promotion cards required');
 check(await page.locator('.promotion-right .promotion-tile').count()===3,'Three right promotion cards required');
 await checkSponsorCards();
 const sections=await page.locator('main > section').evaluateAll(nodes=>nodes.slice(0,2).map(n=>n.className));
 check(sections[0].includes('summit-hero')&&sections[1].includes('tournament-first'),'Hero and competition order incorrect');
 const center=await page.locator('.hero-winner').boundingBox(),left=await page.locator('.promotion-left').boundingBox(),right=await page.locator('.promotion-right').boundingBox();
 check(center.x>left.x+left.width&&center.x+center.width<right.x,'Winner card must sit between promotions');
 await page.screenshot({path:'artifacts/promotions-hero-desktop.png',fullPage:true});
 await page.locator('a.promotion-empty').first().click({position:{x:8,y:8}});
 await page.waitForURL('**/promote?slot=1');
 await page.getByLabel('2. Startup or app name').fill('Sponsor preview');
 await page.getByLabel('Website URL',{exact:true}).fill('https://example.com');
 check(await page.getByLabel('2. Startup or app name').inputValue()==='Sponsor preview','Sponsor details must be editable after card click');
 check(await page.locator('.promotion-selector input[type=checkbox]').count()===6,'Six-card selector missing');
 check(await page.getByText('All six cards: $300 USD.',{exact:false}).count()===1,'Combined $300 purchase price missing');
 await page.screenshot({path:'artifacts/promotions-purchase-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await page.goto(base,{waitUntil:'networkidle'});
 await checkSponsorCards();
 check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile hero overflow');
 const winner=await page.locator('.hero-winner').boundingBox(),promotions=await page.locator('.promotion-left').boundingBox();
 check(winner.y<promotions.y,'Mobile winner should come first');
 await page.screenshot({path:'artifacts/promotions-hero-mobile.png',fullPage:true});
 const lastCard=page.locator('a.promotion-empty').last();
 await lastCard.focus();
 await page.keyboard.press('Enter');
 await page.waitForURL('**/promote?slot=6');
 check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile purchase page overflow');
 await page.screenshot({path:'artifacts/promotions-purchase-mobile.png',fullPage:true});
 check(errors.length===0,errors.join('; '));
 const result={passed:true,scope:'Public unconfigured layout and disabled checkout. Card links open the details form; no purchase was submitted. Database and Stripe behavior tested separately.',checks:['center winner','three cards each side','exact prices','price and centered Sponsor only','all six cards are booking links','whole-card click opens details form','editable startup details','keyboard card activation','competition second','six-card selector','combined pricing','mobile order and overflow','no page errors']};
 fs.writeFileSync('artifacts/promotions-browser.json',JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result,null,2));
}finally{await browser.close()}
