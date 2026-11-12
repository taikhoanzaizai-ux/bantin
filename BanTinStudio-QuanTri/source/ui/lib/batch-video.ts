import {normalizeTemplateFooter,type TemplateFooter} from './template-footer';
import {normalizeTemplateText,type TemplateText} from './template-text';
import type {Picture,Scene} from './news';
import type {IntroConfig,IntroEffect} from './intro';
import {shuffledMedia,scenesForOrder} from './media-order';
import {fitTiming} from './news';
import {imageEffects,type Motion,type Transition} from './video-options';
export type BatchVoice={mode:'shared'|'vieneu'|'upload';voice:string;speed:number;audio?:string;name?:string;generatedKey?:string;scriptMode?:'shared'|'custom';script?:string;title?:string;text?:TemplateText;footer?:TemplateFooter};
export type BatchVoices=Record<string,BatchVoice>;
export function templateContent(v:BatchVoice|undefined,script:string,title:string){const displayTitle=v?.text?.title;return v?.scriptMode==='custom'?{custom:true,script:v.script||'',title:displayTitle??(v.title===undefined?title:v.title)}:{custom:false,script,title:displayTitle??title};}
export function seededRandom(seed:number){let n=seed>>>0;return ()=>{n+=0x6d2b79f5;let t=n;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}
function assetHash(id:string){let n=2166136261;for(let i=0;i<id.length;i++)n=Math.imul(n^id.charCodeAt(i),16777619);return n>>>0;}
export const voiceKey=(script:string,voice:string,speed:number)=>JSON.stringify([script,voice,speed]);
export function normalizeBatchVoices(raw:unknown):BatchVoices{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return {};
 const result:BatchVoices={};let bytes=0,textBytes=0;
 for(const [id,item] of Object.entries(raw).slice(0,30)){
  const v=item as BatchVoice;if(!v||!['shared','vieneu','upload'].includes(v.mode))continue;
  if(v.audio&&(!/^data:audio\/[\w.+-]+;base64,[A-Za-z0-9+/=]+$/.test(v.audio)))throw Error('Lời đọc riêng không hợp lệ.');
  
  if(v.script!==undefined&&typeof v.script!=='string')throw Error('Kịch bản riêng phải là văn bản.');if(v.title!==undefined&&(typeof v.title!=='string'||v.title.length>120))throw Error('Tiêu đề riêng tối đa 120 ký tự.');
  const text=normalizeTemplateText(v.text);textBytes+=JSON.stringify(text||{}).length;if(textBytes>80e6)throw Error('Tổng font và chữ riêng vượt giới hạn dự án.');
  result[id]={text,footer:normalizeTemplateFooter(v.footer),scriptMode:v.scriptMode==='custom'?'custom':'shared',script:v.script,title:v.title,mode:v.scriptMode==='custom'&&v.mode==='shared'?'vieneu':v.mode,voice:String(v.voice||'').slice(0,200),speed:Number.isFinite(v.speed)?Math.max(.75,Math.min(1.5,v.speed)):1,audio:v.audio,name:typeof v.name==='string'?v.name.slice(0,200):undefined,generatedKey:typeof v.generatedKey==='string'?v.generatedKey:undefined};
 }return result;
}
// Narration occupies the whole output, including intro; body media fills only the remaining time.
export function narrationScenes(scenes:Scene[],seconds:number,intro:number){
 if(seconds<=intro+.1)throw Error(`Lời đọc (${seconds.toFixed(1)} giây) cần dài hơn intro (${intro.toFixed(1)} giây). Hãy rút ngắn hoặc tắt intro.`);
 const result=fitTiming(scenes,seconds-intro);if(result.length)result[result.length-1].duration=seconds-intro-result.slice(0,-1).reduce((n,s)=>n+s.duration,0);return result;
}
function unusedPrefix(size:number,length:number,used:Set<string>):number[]|null{
 const prefix:number[]=[];function visit():number[]|null{if(prefix.length===length)return used.has(prefix.join(','))?null:[...prefix];for(let i=0;i<size;i++)if(!prefix.includes(i)){prefix.push(i);const found=visit();if(found)return found;prefix.pop();}return null;}return visit();
}
export function batchVisuals(pictures:Picture[],scenes:Scene[],intro:IntroConfig,count:number,random:()=>number=Math.random,perVideoScenes?:Scene[][],autoFit=false){
 const used=new Set<string>(),pool=shuffledMedia(imageEffects.map(e=>e.id),random),transitions:Transition[]=['fade','fade','wipe','fade'];
 return Array.from({length:count},(_,index)=>{
  const activeScenes=perVideoScenes?.[index]||scenes,visible=Math.min(activeScenes.length,pictures.length);let order=shuffledMedia(pictures.map((_,i)=>i),random),key=order.slice(0,visible).join(',');
  if(used.has(key)){const prefix=unusedPrefix(pictures.length,visible,used);if(prefix)order=[...prefix,...pictures.map((_,i)=>i).filter(i=>!prefix.includes(i))];key=order.slice(0,visible).join(',');}used.add(key);
  const effect=(id:string)=>pool[(assetHash(id)+index)%pool.length],media=order.map(i=>autoFit?{...pictures[i],fit:((assetHash(pictures[i].id)+index)%2?'contain':'cover') as Picture['fit']}:pictures[i]),mapped=scenesForOrder(activeScenes,media).map(s=>({...s,effect:media.find(p=>p.id===s.imageId)?.kind==='video'?'none' as const:effect(s.imageId)}));
  const clips=intro.clips.map((c,i)=>{const id=c.picture?.id|| (c.sourcePictureId&&c.sourcePictureId!=='graphic'?c.sourcePictureId:media[i%media.length]?.id)||c.id;return {...c,picture:c.picture&&autoFit?{...c.picture,fit:((assetHash(id)+index)%2?'contain':'cover') as Picture['fit']}:c.picture,effect:(c.picture||media.find(p=>p.id===id))?.kind==='video'?'none' as const:effect(id)};});
  return {pictures:media,scenes:mapped,intro:{...intro,sound:false,clips},zoom:true,motionStrength:.12,transitionDuration:.3+(index%5)*.1,transition:transitions[index%transitions.length]};
 });
}
// UI edits only revalidate changed payloads. Re-scanning every embedded WAV/font on each
// pointer event made text dragging stall after several voices had been generated.
export function normalizeBatchUpdate(previous:BatchVoice|undefined,value:BatchVoice):BatchVoice{
 const sameAudio=value.audio===previous?.audio,sameText=value.text===previous?.text,sameFonts=!!value.text&&!!previous?.text&&value.text.fonts===previous.text.fonts;
 const next=normalizeBatchVoices({entry:{...value,audio:sameAudio?undefined:value.audio,text:sameText?undefined:sameFonts?{...value.text,fonts:[]}:value.text}}).entry;
 return {...next,audio:sameAudio?value.audio:next.audio,text:sameText?previous?.text:next.text?{...next.text,fonts:sameFonts?previous!.text!.fonts:next.text.fonts}:undefined};
}
