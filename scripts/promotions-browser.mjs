import {chromium} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
const base=process.env.TEST_BASE_URL||'http://localhost:3000';
const outputDirectory=process.env.PROMOTION_ARTIFACT_DIR||'artifacts';
fs.mkdirSync(outputDirectory,{recursive:true});
const artifact=name=>path.join(outputDirectory,name);
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,timeout:30000,args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];
page.on('pageerror',error=>errors.push(error.stack||error.message));
const check=(ok,message)=>{if(!ok)throw Error(message)};
const prices=[100,100,100,100,100,100],names=['Top left','Middle left','Bottom left','Top right','Middle right','Bottom right'];
async function checkCards(){
 const cards=page.locator('button.promotion-empty');
 await cards.first().waitFor({state:'visible'});
 check(await cards.count()===6,'All six empty cards must open an in-page dialog');
 for(let index=0;index<6;index++){
  const card=cards.nth(index);
  check((await card.innerText()).trim().replace(/\s+/g,' ')===`$${prices[index]} Sponsor by`,'Card must show only price and Sponsor by');
  const style=await card.evaluate(element=>{const css=getComputedStyle(element);return {background:css.backgroundColor,border:css.borderTopStyle,width:css.borderTopWidth}});
  check(style.background==='rgba(0, 0, 0, 0)'&&style.border==='dashed'&&style.width==='1px','Sponsor card must be transparent with a thin dashed outline');
  check(await card.evaluate(element=>{const bounds=element.getBoundingClientRect(),text=element.querySelector('.promotion-placeholder').getBoundingClientRect();return Math.abs(bounds.x+bounds.width/2-text.x-text.width/2)<2&&Math.abs(bounds.y+bounds.height/2-text.y-text.height/2)<2}),'Sponsor by must be centered');
 }
}
async function checkDialog(index,{keyboard=false,screenshot}={}){
 const before=page.url(),card=page.locator('button.promotion-empty').nth(index);
 if(keyboard){await card.focus();await page.keyboard.press('Enter')}else await card.click({position:{x:8,y:8}});
 const dialog=page.getByRole('dialog',{name:`${names[index]} card`,exact:true});
 await dialog.waitFor({state:'visible'});
 check(page.url()===before,'Opening a sponsor card must not navigate');
 check((await dialog.locator('.promotion-total b').innerText())===`$${prices[index]} USD`,'Dialog must use only the selected card price');
 check(await dialog.locator('.promotion-selector').count()===0,'Single-card dialog must not include other placements');
 check(await page.evaluate(()=>document.activeElement?.id==='promotion-name'),'Startup field should receive focus');
 await dialog.getByLabel('Startup or app name',{exact:true}).fill(`Startup ${index+1}`);
 await dialog.getByLabel('Website URL',{exact:true}).fill('https://example.com');
 check(await dialog.getByLabel('Startup or app name',{exact:true}).inputValue()===`Startup ${index+1}`,'Startup details must be editable');
 check(await page.evaluate(()=>document.body.style.overflow==='hidden'),'Background scrolling should be locked');
 check(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth),'Sponsor dialog has horizontal overflow');
 const close=dialog.getByRole('button',{name:'Close sponsor details'});
 await close.focus();await page.keyboard.press('Shift+Tab');
 check(await dialog.evaluate(element=>element.contains(document.activeElement)),'Focus must stay inside the dialog');
 await page.keyboard.press('Tab');
 check(await close.evaluate(element=>element===document.activeElement),'Tab should wrap back to the close button');
 if(screenshot)await page.screenshot({path:screenshot,fullPage:false});
 await page.keyboard.press('Escape');
 await dialog.waitFor({state:'detached'});
 check(page.url()===before,'Closing sponsor details must not navigate');
 check(await card.evaluate(element=>element===document.activeElement),'Focus must return to the sponsor card');
 check(await page.evaluate(()=>document.body.style.overflow!=='hidden'),'Closing should restore scrolling');
}
try{
 await page.goto(base,{waitUntil:'load',timeout:60000});
 await page.getByRole('heading',{name:'The winner’s circle.'}).waitFor();
 await checkCards();
 check(await page.locator('.promotion-left .promotion-tile').count()===3&&await page.locator('.promotion-right .promotion-tile').count()===3,'Three cards per side required');
 const sections=await page.locator('main > section').evaluateAll(nodes=>nodes.slice(0,2).map(node=>node.className));
 check(sections[0].includes('summit-hero')&&sections[1].includes('tournament-first'),'Competition must remain second');
 await page.screenshot({path:artifact('promotions-hero-desktop.png'),fullPage:true});
 for(let index=0;index<6;index++)await checkDialog(index,{screenshot:index===0?artifact('promotions-dialog-desktop.png'):undefined});
 await page.locator('button.promotion-empty').first().click();
 await page.getByRole('button',{name:'Close sponsor details'}).click();
 await page.getByRole('dialog',{name:'Top left card',exact:true}).waitFor({state:'detached'});
 await page.locator('button.promotion-empty').first().click();
 await page.mouse.click(5,5);
 await page.getByRole('dialog',{name:'Top left card',exact:true}).waitFor({state:'detached'});
 await page.goto(base+'/promote',{waitUntil:'load',timeout:60000});
 await page.locator('.promotion-selector input[type=checkbox]').first().waitFor({state:'visible'});
 check(await page.locator('.promotion-selector input[type=checkbox]').count()===6,'Multi-card purchase page must remain available');
 check(await page.getByText('All six cards: $600 USD.',{exact:false}).count()===1,'Combined $600 price missing');
 await page.screenshot({path:artifact('promotions-purchase-desktop.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await page.goto(base,{waitUntil:'load',timeout:60000});
 await checkCards();
 check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile hero overflow');
 const winner=await page.locator('.hero-winner').boundingBox(),promotions=await page.locator('.promotion-left').boundingBox();
 check(winner.y<promotions.y,'Mobile winner should come first');
 await page.screenshot({path:artifact('promotions-hero-mobile.png'),fullPage:true});
 await checkDialog(5,{keyboard:true,screenshot:artifact('promotions-dialog-mobile.png')});
 check(errors.length===0,errors.join('\n'));
 const result={passed:true,scope:'Public unconfigured UI. All six dialogs, single-card prices and editable fields verified; no purchase submitted. Database and payment checks are separate.',checks:['Sponsor by label','transparent cards with thin dashed borders','three cards each side','all six placement dialogs','exact single-card prices','no card navigation','whole-card and keyboard activation','editable startup fields','initial focus and focus trap','Escape, close button and backdrop dismissal','focus and scroll restoration','mobile dialog without overflow','multi-card page preserved','no page errors']};
 fs.writeFileSync(artifact('promotions-browser.json'),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result,null,2));
}finally{await browser.close()}
