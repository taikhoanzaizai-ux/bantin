import type {CaptionCue} from './captions';
import {defaultTextStyles,type TextStyle} from './text-style';
export type CaptionMode='line'|'highlight'|'word'|'reveal';
export const captionModes=[{id:'line',name:'Hiện cả dòng',description:'Đúng mốc voice, chữ đứng yên.'},{id:'highlight',name:'Tô từ đang đọc',description:'Giữ cả dòng, đổi màu từ đang nói.'},{id:'word',name:'Từng từ',description:'Chỉ hiện từ đang được đọc.'},{id:'reveal',name:'Hiện dần theo voice',description:'Các từ xuất hiện dần theo mốc nói.'}] as const;
export const captionPresets:{id:string;name:string;description:string;mode:CaptionMode;style:Partial<TextStyle>}[]=[
 {id:'clean',name:'Trắng tối giản',description:'Cả dòng · viền đen',mode:'line',style:{color:'#ffffff',backgroundOpacity:0,strokeWidth:2,strokeColor:'#000000',shadowBlur:2}},
 {id:'boxed',name:'Nền tối dễ đọc',description:'Cả dòng · nền đen',mode:'line',style:{color:'#ffffff',background:'#07101c',backgroundOpacity:.82,strokeWidth:0,shadowBlur:0}},
 {id:'yellow',name:'Vàng nổi bật',description:'Cả dòng · chữ vàng',mode:'line',style:{color:'#ffe135',backgroundOpacity:0,strokeWidth:2,strokeColor:'#000000',shadowBlur:0}},
 {id:'karaoke',name:'Theo từng từ',description:'Tô vàng từ đang đọc',mode:'highlight',style:{color:'#ffffff',highlightColor:'#ffe135',background:'#07101c',backgroundOpacity:.82,strokeWidth:0,shadowBlur:0}},
 {id:'one-word',name:'Một từ mỗi nhịp',description:'Từ đang nói · không chia đều',mode:'word',style:{color:'#ffffff',backgroundOpacity:0,strokeWidth:2,strokeColor:'#000000',size:46,shadowBlur:0}},
 {id:'reveal',name:'Hiện dần',description:'Thêm từ theo voice',mode:'reveal',style:{color:'#ffffff',background:'#07101c',backgroundOpacity:.82,strokeWidth:0,shadowBlur:0}},
];
export function validCaptionMode(mode:unknown):mode is CaptionMode{return captionModes.some(m=>m.id===mode);}
export function applyCaptionPreset(id:string,current?:TextStyle){const p=captionPresets.find(p=>p.id===id);if(!p)throw new Error('Mẫu phụ đề không hợp lệ.');return {mode:p.mode,style:{...(current||defaultTextStyles().caption),...p.style,highlight:p.mode==='highlight'}};}
export function captionDisplay(cue:CaptionCue,time:number,mode:CaptionMode){
 const words=cue.words||[],active=words.findIndex(w=>time>=w.start&&time<w.end);
 const matches=[...cue.text.matchAll(/\S+/gu)],offset=(index:number)=>{let cursor=0;for(let i=0;i<=index;i++){const at=cue.text.indexOf(words[i].text.trim(),cursor);if(at<0)return matches[index]?.index||0;cursor=at+words[i].text.trim().length;if(i===index)return at;}return 0;};
 if(mode==='line'||!words.length)return {text:cue.text,highlightWord:-1,offset:0};
 if(mode==='word')return {text:active>=0?cue.text.slice(offset(active),offset(active)+words[active].text.trim().length):'',highlightWord:-1,offset:active>=0?offset(active):0};
 if(mode==='reveal'){const last=words.findLastIndex(w=>w.start<=time);return {text:last<0?'':cue.text.slice(0,offset(last)+words[last].text.trim().length),highlightWord:-1,offset:0};}
 return {text:cue.text,highlightWord:active,offset:0};
}
