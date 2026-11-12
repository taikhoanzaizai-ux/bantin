export type ImageEffectId=`motion-${string}`;
const effectFamilies=['Phóng vào','Thu ra','Lia trái','Lia phải','Lia lên','Lia xuống','Trượt chéo xuống','Trượt chéo lên','Quỹ đạo thuận','Quỹ đạo ngược'];
export const imageEffects=Array.from({length:100},(_,i)=>({id:('motion-'+String(i+1).padStart(3,'0')) as ImageEffectId,label:effectFamilies[Math.floor(i/10)]+' · '+String(i%10+1).padStart(2,'0'),family:Math.floor(i/10),variant:i%10}));
export function imageEffectTransform(id:string,progress:number,strength=.12){const n=Number(id.slice(7))-1;if(!id.startsWith('motion-')||!Number.isInteger(n)||n<0||n>=100)return null;const f=Math.floor(n/10),v=n%10,t=Math.max(0,Math.min(1,progress)),curves=[t,t*t*(3-2*t),t*t,1-(1-t)*(1-t),.5-.5*Math.cos(Math.PI*t)],p=curves[v%5],a=(.05+v*.017)*Math.max(.3,strength/.12),u=.08+.84*p;let scale=1+a,x=.5,y=.5;if(f===0)scale=1+a*p;if(f===1)scale=1+a*(1-p);if(f===2)x=u;if(f===3)x=1-u;if(f===4)y=u;if(f===5)y=1-u;if(f===6){x=u;y=u;}if(f===7){x=1-u;y=1-u;}if(f===8||f===9){const angle=(f===8?1:-1)*p*Math.PI*(.5+v*.09)+v*.13;x=.5+.4*Math.cos(angle);y=.5+.4*Math.sin(angle);}return {scale,x,y};}
export const motions = [
 {id:'auto',label:'Tự phối theo cảnh'}, {id:'zoom-in',label:'Phóng to chậm'}, {id:'zoom-out',label:'Thu nhỏ chậm'},
 {id:'pan-left',label:'Lia sang trái'}, {id:'pan-right',label:'Lia sang phải'}, {id:'pan-up',label:'Lia lên trên'}, {id:'pan-down',label:'Lia xuống dưới'}, {id:'drift',label:'Trượt chéo điện ảnh'}, {id:'none',label:'Ảnh tĩnh'},...imageEffects
] as const;
export type Motion = typeof motions[number]['id'];
export type Transition = 'fade'|'dip'|'wipe'|'slide'|'cut';
export const transitions: {id:Transition;label:string}[]=[{id:'fade',label:'Hòa tan mềm'},{id:'dip',label:'Mờ qua nền tối'},{id:'wipe',label:'Gạt ngang'},{id:'slide',label:'Trượt nối cảnh'},{id:'cut',label:'Cắt thẳng'}];
export function validMotion(value:unknown):value is Motion{return motions.some(m=>m.id===value);}
export function ease(value:number){const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t);}
export function motionTransform(effect:Motion,index:number,progress:number,strength:number){
 const preset=imageEffectTransform(effect,progress,strength);if(preset)return preset;
 const choices:Motion[]=['zoom-in','pan-right','zoom-out','pan-left','pan-up','drift','pan-down'];
 const actual=effect==='auto'?choices[index%choices.length]:effect;const p=ease(progress),a=Math.max(0,Math.min(.2,strength));
 let scale=1,x=.5,y=.5;
 if(actual==='zoom-in')scale=1+a*p;if(actual==='zoom-out')scale=1+a*(1-p);
 if(actual.startsWith('pan-')||actual==='drift'){scale=1+a;const u=.1+.8*p;if(actual==='pan-left')x=u;if(actual==='pan-right')x=1-u;if(actual==='pan-up')y=u;if(actual==='pan-down')y=1-u;if(actual==='drift'){x=u;y=1-u;}}
 return {scale,x,y};
}
export function introAlpha(time:number,seconds:number){if(seconds<=0||time<0||time>=seconds)return 0;return Math.min(1,(seconds-time)/.4);}

// Travel follows a visible, bounded speed. Long stills gently reverse after ten
// seconds rather than stretching one almost imperceptible move over the whole shot.
export function safeMotionTransform(effect:Motion,index:number,progress:number,strength:number,duration:number,kind?:string){
 if(kind==='video'||effect==='none'||strength<=0)return {scale:1,x:.5,y:.5};
 const seconds=Number.isFinite(duration)?Math.max(0,duration):0;
 if(!seconds)return {scale:1,x:.5,y:.5};
 const t=Math.max(0,Math.min(1,progress)),cycle=(t*seconds/10)%2,phase=seconds<=10?t:cycle<=1?cycle:2-cycle;
 const p=.85*phase+.15*ease(phase),gain=Math.max(.35,Math.min(1.4,strength/.12));
 const m=motionTransform(effect,index,p,.12),start=motionTransform(effect,index,0,.12),end=motionTransform(effect,index,1,.12);
 const zooming=Math.abs(start.scale-end.scale)>.00001;
 const variant=effect.startsWith('motion-')?(Number(effect.slice(7))-1)%10:4;
 const amount=Math.min(.12,Math.min(10,seconds)*.012*gain*(.85+variant*.035));
 const peak=Math.max(start.scale,end.scale)-1,linearZoom=start.scale>end.scale?1-p:p;
 const x=.7*(start.x+(end.x-start.x)*p)+.3*m.x,y=.7*(start.y+(end.y-start.y)*p)+.3*m.y;
 return {scale:zooming?1+amount*(.7*linearZoom+.3*Math.max(0,m.scale-1)/peak):1+Math.min(.12,(.075+variant*.0035)*gain),x:.5+(x-.5)*.10*Math.min(1,seconds/3)*gain,y:.5+(y-.5)*.09*Math.min(1,seconds/3)*gain};
}
