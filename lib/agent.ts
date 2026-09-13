import { router } from 'expo-router';
import { normalizeInput } from './url';
import { createAgentTask, getTabContexts, remember } from './db';

export type LocalAgentResult = { handled: boolean; message?: string; aiPrompt?: string };
type AppDestination = { label: string; words: string[]; path: string };
type SiteDestination = { label: string; words: string[]; url: string; search?: (q: string) => string };

const APP_DESTINATIONS: AppDestination[] = [
  { label: 'الرئيسية', words: ['الرئيسية','الصفحة الرئيسية','هوم','home'], path: '/' },
  { label: 'التبويبات', words: ['التبويبات','التابات','التاب','tabs'], path: '/tabs' },
  { label: 'التنزيلات', words: ['التنزيلات','التحميلات','الداونلود','downloads'], path: '/downloads' },
  { label: 'المكتبة والسجل', words: ['المكتبة','السجل','المفضلة','الهيستوري','history'], path: '/library' },
  { label: 'RAID AI', words: ['raid ai','الذكاء','الذكاء الاصطناعي','المساعد'], path: '/ai' },
  { label: 'RAID VPN', words: ['vpn','في بي ان','الفي بي ان'], path: '/vpn' },
  { label: 'الخصوصية', words: ['الخصوصية','الحماية','الأمان','الامان'], path: '/privacy' },
  { label: 'خزنة كلمات المرور', words: ['كلمات المرور','الباسوردات','الخزنة','passwords'], path: '/passwords' },
  { label: 'الحساب', words: ['الحساب','الاكاونت','account'], path: '/account' },
  { label: 'الإعدادات', words: ['الاعدادات','الإعدادات','settings'], path: '/settings' },
];

const SITE_DESTINATIONS: SiteDestination[] = [
  { label:'YouTube', words:['يوتيوب','youtube'], url:'https://www.youtube.com', search:q=>`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}` },
  { label:'Google', words:['كوكل','گوگل','قوقل','جوجل','google'], url:'https://www.google.com', search:q=>`https://www.google.com/search?q=${encodeURIComponent(q)}` },
  { label:'GitHub', words:['جتهاب','جيت هب','github'], url:'https://github.com', search:q=>`https://github.com/search?q=${encodeURIComponent(q)}&type=repositories` },
  { label:'Wikipedia', words:['ويكيبيديا','ويكي','wikipedia'], url:'https://ar.wikipedia.org', search:q=>`https://ar.wikipedia.org/w/index.php?search=${encodeURIComponent(q)}` },
  { label:'Reddit', words:['ريديت','reddit'], url:'https://www.reddit.com', search:q=>`https://www.reddit.com/search/?q=${encodeURIComponent(q)}` },
  { label:'Google Maps', words:['خرائط كوكل','خرائط جوجل','google maps','الخرائط'], url:'https://www.google.com/maps', search:q=>`https://www.google.com/maps/search/${encodeURIComponent(q)}` },
];

function normalizedWords(value:string){return value.toLowerCase().replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/\s+/g,' ').trim();}
function matchAppDestination(value:string){const clean=normalizedWords(value);return APP_DESTINATIONS.find(item=>item.words.some(word=>clean.includes(normalizedWords(word))));}
function matchSiteDestination(value:string){const clean=normalizedWords(value);return SITE_DESTINATIONS.find(item=>item.words.some(word=>clean.includes(normalizedWords(word))));}
function tomorrowMorning(){const d=new Date();d.setDate(d.getDate()+1);d.setHours(9,0,0,0);return d.getTime();}
function openBrowser(url:string){router.push({pathname:'/browser',params:{url}});}

export async function executeLocalAgentCommand(raw:string):Promise<LocalAgentResult>{
  const text=raw.trim(); if(!text)return{handled:false};
  const rememberMatch=text.match(/^(?:تذكّر|تذكر)\s+(?:أن\s+)?(.+)$/i);
  if(rememberMatch?.[1]){await remember('user_preference',rememberMatch[1]);return{handled:true,message:'تم، حفظتها بذاكرة RAID المحلية على هذا الجهاز.'};}
  const remindTomorrow=text.match(/^(?:ذكرني|ذكّرني)\s+(?:غد(?:اً|ا)|باجر)\s+(.+)$/i);
  if(remindTomorrow?.[1]){const dueAt=tomorrowMorning();await createAgentTask(remindTomorrow[1],JSON.stringify({kind:'reminder',text:remindTomorrow[1]}),dueAt);return{handled:true,message:`تم يولد، خليتها لباجر الساعة 9:00 صباحاً: ${remindTomorrow[1]}`};}
  const taskMatch=text.match(/^(?:نفّذ مهمة|نفذ مهمة|أنشئ مهمة|انشئ مهمة)\s*[:：-]?\s*(.+)$/i);
  if(taskMatch?.[1]){await createAgentTask(taskMatch[1],JSON.stringify({kind:'agent_task',instruction:taskMatch[1]}),null);return{handled:true,message:`تمت إضافة المهمة إلى RAID Agent: ${taskMatch[1]}`};}
  if(/^(?:لخّص|لخص)\s+(?:كل\s+)?(?:التبويبات|الصفحات)\s+(?:المفتوحة)?/i.test(text)){const tabs=await getTabContexts(null,12);if(!tabs.length)return{handled:true,message:'ماكو سياق محفوظ للتبويبات المفتوحة هسه.'};const context=tabs.map((tab,i)=>`TAB ${i+1}: ${tab.title}\nURL: ${tab.url}\n${tab.text.slice(0,3500)}`).join('\n\n');return{handled:false,aiPrompt:`لخّص جميع التبويبات التالية مع أهم النقاط والروابط:\n\n${context}`};}
  const compareMatch=text.match(/^(?:قارن بين)\s+(.+)$/i);
  if(compareMatch?.[1]){const tabs=await getTabContexts(null,8);const context=tabs.map((tab,i)=>`TAB ${i+1}: ${tab.title}\nURL: ${tab.url}\n${tab.text.slice(0,3000)}`).join('\n\n');return{handled:false,aiPrompt:`قارن بين ${compareMatch[1]}. استخدم سياق التبويبات المتاح إن كان ذا صلة، واذكر الفروق بوضوح.\n\n${context}`};}

  const siteSearch=text.match(/^(?:ابحث|دور|دوّر)\s+(?:لي\s+)?(?:في|داخل)\s+(.+?)\s+(?:عن|على)\s+(.+)$/i);
  if(siteSearch?.[1]&&siteSearch?.[2]){const site=matchSiteDestination(siteSearch[1]);if(site?.search){openBrowser(site.search(siteSearch[2].trim()));return{handled:true,message:`تمام، أبحثلك داخل ${site.label} عن: ${siteSearch[2].trim()}`};}}

  const navigationMatch=text.match(/^(?:افتح|ادخل|إدخل|شغل|وديني(?:\s+(?:الى|إلى))?|روح(?:\s+(?:الى|إلى|لـ|ل))?|خليني\s+(?:اروح|أروح)(?:\s+(?:الى|إلى))?)\s+(.+)$/i);
  if(navigationMatch?.[1]){const requested=navigationMatch[1].trim();const app=matchAppDestination(requested);if(app){router.push(app.path as never);return{handled:true,message:`تم، فتحتلك ${app.label}.`};}const site=matchSiteDestination(requested);if(site){openBrowser(site.url);return{handled:true,message:`على راسي، فتحتلك ${site.label}.`};}const target=normalizeInput(requested);openBrowser(target);return{handled:true,message:`تمام، فتحت داخل RAID: ${requested}`};}

  const searchMatch=text.match(/^(?:ابحث(?: لي)?(?: عن)?|بحث عن|دور(?: لي)?(?: على| عن)?|دوّر(?: لي)?(?: على| عن)?)\s+(.+)$/i);
  if(searchMatch?.[1]){const target=normalizeInput(searchMatch[1]);openBrowser(target);return{handled:true,message:`أدورلك على: ${searchMatch[1]}`};}
  return{handled:false};
}
