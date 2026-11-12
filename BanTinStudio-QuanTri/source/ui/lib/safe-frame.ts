import type {RenderData} from './render-news';
import type {FrameBox} from './template-design';
import {frameSize} from './text-style';
type FooterData=Pick<RenderData,'aspect'|'footer'|'footerGradient'|'footerMode'|'footerPlacement'|'footerScale'|'footerBottom'|'mediaBox'|'introDuration'|'protectFooter'|'footerSafeHeight'>;
export function protectsFooter(data:FooterData){return data.protectFooter!==false&&data.footerMode==='full'&&!!(data.footer||data.footerGradient);}
export function mediaFrameFor(data:FooterData,time:number):FrameBox|undefined{
 const hasFooter=!!(data.footer||data.footerGradient);
 if(hasFooter&&(data.footerMode==='off'||data.footerMode==='intro'&&time>=data.introDuration))return undefined;
 if(!protectsFooter(data))return data.mediaBox;
 const {width:W,height:H}=frameSize(data.aspect),gap=Math.min(W,H)*.015;
 let top=H;
 if(data.footerSafeHeight&&data.footerSafeHeight>0)top=H*(1-Math.min(80,data.footerSafeHeight)/100)-data.footerBottom;
 else{
  if(data.footerGradient)top=Math.min(top,data.footerPlacement==='full'?H*(1-data.footerGradient.height/100)/2:H*(1-data.footerGradient.height/100)-data.footerBottom);
  if(data.footer){const im=data.footer,factor=Math.min(W*data.footerScale/im.width,H/im.height),height=im.height*factor;
   // Full-frame templates can contain transparent or opaque artwork. Keep the
   // template behind the video, with a default bottom band users can adjust.
   const y=height>=H*.65?H*.75-data.footerBottom:data.footerPlacement==='full'?(H-height)/2:H-height-data.footerBottom;
   top=Math.min(top,y);
  }
 }
 const bottom=Math.max(5,Math.min(100,(top-gap)/H*100));
 const b=data.mediaBox||{x:0,y:0,width:100,height:100};
 if(b.y>=bottom-5)return {x:b.x,y:0,width:b.width,height:bottom};
 return {x:b.x,y:b.y,width:b.width,height:Math.min(b.height,bottom-b.y)};
}
