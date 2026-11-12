import type {Picture} from './news';
import type {BatchVoices} from './batch-video';
import type {FooterTemplate} from './template-store';
import {defaultTextStyles} from './text-style';
export function resetMediaLayout(p:Picture):Picture{return {...p,fit:'contain',scale:1,offsetX:0,offsetY:0,rotation:0,cropLeft:0,cropRight:0,cropTop:0,cropBottom:0,backgroundMode:'blur',blurBackground:true,blurAmount:24};}
export function resetBatchLayouts(values:BatchVoices,templates:FooterTemplate[]):BatchVoices{return Object.fromEntries(Object.entries(values).map(([id,v])=>{const d=templates.find(t=>t.id===id)?.design;return [id,{...v,footer:undefined,text:v.text?{...v.text,styles:d?.textStyles||defaultTextStyles(),captionMode:d?.captionMode||'line',titleEnabled:d?.titleEnabled!==false,brandEnabled:d?.brandEnabled!==false}:undefined}];}));}
