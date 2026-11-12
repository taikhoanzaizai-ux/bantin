import type {FooterTemplate} from './template-store';
import type {RenderData} from './render-news';
export type TemplateFooter={mode:'intro'|'full'|'off';placement:'bottom'|'full';scale:number;bottom:number;protect:boolean;safeHeight:number;introDuration:number};
const num=(v:unknown,lo:number,hi:number,fallback:number)=>typeof v==='number'&&Number.isFinite(v)?Math.max(lo,Math.min(hi,v)):fallback;
export function normalizeTemplateFooter(raw:unknown):TemplateFooter|undefined{
 if(raw==null)return undefined;if(typeof raw!=='object'||Array.isArray(raw))throw Error('Thiết lập chân trang riêng không hợp lệ.');const s=raw as Partial<TemplateFooter>;
 return {mode:['intro','full','off'].includes(s.mode||'')?s.mode!:'intro',placement:s.placement==='full'?'full':'bottom',scale:num(s.scale,.1,1,1),bottom:num(s.bottom,0,500,0),protect:s.protect!==false,safeHeight:num(s.safeHeight,0,80,0),introDuration:num(s.introDuration,1,30,4)};
}
export function footerFromTemplate(t:FooterTemplate):TemplateFooter{return {mode:t.mode,placement:t.placement,scale:t.scale,bottom:t.bottom,protect:true,safeHeight:0,introDuration:t.design?.introDuration||4};}
export function footerOverrides(f?:TemplateFooter):Partial<RenderData>{return f?{footerMode:f.mode,footerPlacement:f.placement,footerScale:f.scale,footerBottom:f.bottom,protectFooter:f.protect,footerSafeHeight:f.safeHeight,introDuration:f.introDuration}:{};}
