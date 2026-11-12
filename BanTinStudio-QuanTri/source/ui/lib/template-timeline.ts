import type {FrameBox} from './template-design';
export type TemplateSlot={id:string;templateId:string;start:number;end:number;enabled:boolean;layer:'background'|'overlay';box:FrameBox;fit:'contain'|'cover';opacity:number};
export type PreparedTemplateSlot=TemplateSlot&{image:HTMLImageElement|null;gradient?:{from:string;to:string}};
export function normalizeTemplateSlots(raw:unknown):TemplateSlot[]{
 if(raw==null)return [];
 if(!Array.isArray(raw)||raw.length>30)throw new Error('Tối đa 30 đoạn mẫu trong một video.');
 const ids=new Set<string>(),num=(v:unknown,lo:number,hi:number,fallback:number)=>typeof v==='number'&&Number.isFinite(v)?Math.max(lo,Math.min(hi,v)):fallback;
 return raw.map(s=>{if(!s||typeof s.id!=='string'||!s.id||ids.has(s.id)||typeof s.templateId!=='string'||!s.templateId||!Number.isFinite(s.start)||!Number.isFinite(s.end)||s.start<0||s.end-s.start<.1-1e-6)throw new Error('Đoạn mẫu cần có mã riêng và thời gian hợp lệ không âm và có điểm kết thúc sau điểm bắt đầu.');ids.add(s.id);const x=num(s.box?.x,0,99,0),y=num(s.box?.y,0,99,0);return {id:s.id,templateId:s.templateId,start:s.start,end:s.end,enabled:s.enabled!==false,layer:s.layer==='overlay'?'overlay':'background',fit:s.fit==='cover'?'cover':'contain',opacity:num(s.opacity,0,1,1),box:{x,y,width:num(s.box?.width,1,100-x,100-x),height:num(s.box?.height,1,100-y,100-y)}};});
}
export function activeTemplateSlots(slots:PreparedTemplateSlot[]|undefined,time:number,layer:TemplateSlot['layer']){return (slots||[]).filter(s=>s.enabled&&s.layer===layer&&time>=s.start&&time<s.end);}
