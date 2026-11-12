import {normalizeColorRanges,type ColorRange} from './text-colors';
const graphemes=new Intl.Segmenter('vi',{granularity:'grapheme'});
const spacingWidth=(v:string,s:TextStyle)=>s.spacing?Math.max(0,[...graphemes.segment(v)].length-1)*s.spacing:0;
export type TextLayer='title'|'brand'|'caption'|'tag';
export type TextStyle={colorRanges?:ColorRange[];font:string;size:number;bold:boolean;italic:boolean;underline:boolean;color:string;background:string;backgroundOpacity:number;strokeColor:string;strokeWidth:number;shadowColor:string;shadowBlur:number;spacing:number;lineHeight:number;align:'left'|'center'|'right';letterCase:'original'|'upper'|'lower'|'title';opacity:number;x:number;y:number;width:number;rotation:number;maxLines:number;highlight:boolean;highlightColor:string};
export type TextStyles=Record<TextLayer,TextStyle>;
export type FontAsset={id:string;name:string;data:string};
export const fontFamilies=['Arial','Tahoma','Verdana','Trebuchet MS','Times New Roman','Georgia','Courier New','system-ui'];
export function frameSize(aspect?:string){return aspect==='landscape'?{width:1280,height:720}:{width:720,height:1280};}
export function defaultTextStyles():TextStyles{const base:TextStyle={font:'Arial',size:30,bold:true,italic:false,underline:false,color:'#ffffff',background:'#07101c',backgroundOpacity:0,strokeColor:'#000000',strokeWidth:0,shadowColor:'#000000',shadowBlur:6,spacing:0,lineHeight:1.25,align:'left',letterCase:'original',opacity:1,x:7,y:55,width:86,rotation:0,maxLines:4,highlight:false,highlightColor:'#ffe135'};return {tag:{...base,size:18,y:48,width:40,maxLines:1,background:'#ed3e52',backgroundOpacity:1,shadowBlur:0},title:{...base,size:47},brand:{...base,size:25,x:10,y:7,width:72,maxLines:2},caption:{...base,size:30,x:7,y:80,align:'center',backgroundOpacity:.8,maxLines:3,highlight:false}};}
export function normalizeTextStyles(value:unknown):TextStyles{const out=defaultTextStyles(),input=value as Partial<TextStyles>|null;if(!input||typeof input!=='object')return out;const ranges:Partial<Record<keyof TextStyle,[number,number]>>={size:[10,160],backgroundOpacity:[0,1],strokeWidth:[0,15],shadowBlur:[0,50],spacing:[-2,20],lineHeight:[.8,2.5],opacity:[0,1],x:[0,95],y:[0,95],width:[5,100],rotation:[-180,180],maxLines:[1,10]};for(const layer of ['title','brand','caption','tag'] as TextLayer[]){const s=input[layer];if(!s||typeof s!=='object')continue;for(const key of Object.keys(out[layer]) as (keyof TextStyle)[]){const val=s[key];if(key in ranges&&typeof val==='number'&&Number.isFinite(val)){const [lo,hi]=ranges[key]!;(out[layer] as unknown as Record<string,unknown>)[key]=Math.max(lo,Math.min(hi,val));}else if(['color','background','strokeColor','shadowColor','highlightColor'].includes(key)&&typeof val==='string'&&/^#[a-f0-9]{6}$/i.test(val))(out[layer] as unknown as Record<string,unknown>)[key]=val;else if(typeof out[layer][key]==='boolean'&&typeof val==='boolean')(out[layer] as unknown as Record<string,unknown>)[key]=val;}if(typeof s.font==='string'&&(fontFamilies.includes(s.font)||/^studio-font-[a-z0-9-]+$/.test(s.font)))out[layer].font=s.font;if(['left','center','right'].includes(s.align))out[layer].align=s.align;if(['original','upper','lower','title'].includes(s.letterCase))out[layer].letterCase=s.letterCase;const colors=normalizeColorRanges(s.colorRanges);if(colors.length)out[layer].colorRanges=colors;out[layer].maxLines=Math.round(out[layer].maxLines);}return out;}
export function textCase(text:string,style:TextStyle){return style.letterCase==='upper'?text.toLocaleUpperCase('vi'):style.letterCase==='lower'?text.toLocaleLowerCase('vi'):style.letterCase==='title'?text.replace(/(^|\s)(\S)/g,(_,space,letter)=>space+letter.toLocaleUpperCase('vi')):text;}
export function textFont(s:TextStyle){return `${s.italic?'italic ':''}${s.bold?'bold ':''}${s.size}px "${s.font}"`;}
// Keep source offsets through wrapping and case changes so selected colours follow Unicode text.
function layoutText(c:CanvasRenderingContext2D,text:string,s:TextStyle,width:number){
 c.font=textFont(s);const lines:{text:string;offsets:number[]}[]=[],measure=(v:string)=>c.measureText(v).width+spacingWidth(v,s);
 let line='',offsets:number[]=[],pendingSpace=-1,wordStart=true;
 const push=()=>{if(line){lines.push({text:line,offsets});line='';offsets=[];}};
 for(const match of text.matchAll(/\n|[^\S\n]+|[^\s]+/gu)){
  const token=match[0],start=match.index!;if(token==='\n'){push();pendingSpace=-1;wordStart=true;continue;}if(/^\s+$/.test(token)){pendingSpace=start;wordStart=true;continue;}
  let shown='',map:number[]=[];let source=start;
  for(const char of token){const v=s.letterCase==='upper'||s.letterCase==='title'&&wordStart?char.toLocaleUpperCase('vi'):s.letterCase==='lower'?char.toLocaleLowerCase('vi'):char;shown+=v;for(let k=0;k<v.length;k++)map.push(source);source+=char.length;wordStart=false;}
  if(line&&measure(line+' '+shown)>width)push();
  if(line){line+=' ';offsets.push(pendingSpace<0?start:pendingSpace);}pendingSpace=-1;
  if(measure(shown)>width){let index=0;const segments=graphemes.segment(shown);for(const segment of segments){const char=segment.segment;if(line&&measure(line+char)>width)push();line+=char;offsets.push(...map.slice(index,index+char.length));index+=char.length;}}
  else{line+=shown;offsets.push(...map);}
 }
 push();return lines.slice(0,s.maxLines);
}
export function textLines(c:CanvasRenderingContext2D,text:string,s:TextStyle,width:number){return layoutText(c,text,s,width).map(l=>l.text);}
export function textGeometry(c:CanvasRenderingContext2D,text:string,s:TextStyle,W:number,H:number){const x=W*s.x/100,width=Math.min(W-x,W*s.width/100),lines=textLines(c,text,s,width-20),height=Math.max(1,lines.length)*s.size*s.lineHeight+20;return {x,y:Math.min(H*s.y/100,H-height),width,height,lines};}
export function drawStyledText(c:CanvasRenderingContext2D,text:string,s:TextStyle,W:number,H:number,highlightWord=-1){
 c.save();const box=textGeometry(c,text,s,W,H),{x,lines,height}=box,max=box.width,top=box.y,pad=10,lh=s.size*s.lineHeight;if(!lines.length){c.restore();return;}c.globalAlpha*=s.opacity;c.translate(x+max/2,top+height/2);c.rotate(s.rotation*Math.PI/180);c.translate(-max/2,-height/2);c.textAlign='left';c.textBaseline='top';
 if(s.backgroundOpacity>0){c.save();c.globalAlpha*=s.backgroundOpacity;c.fillStyle=s.background;c.beginPath();c.roundRect(0,0,max,height,8);c.fill();c.restore();}c.fillStyle=s.color;c.strokeStyle=s.strokeColor;c.lineWidth=s.strokeWidth*2;c.lineJoin='round';c.shadowColor=s.shadowColor;c.shadowBlur=s.shadowBlur;c.font=textFont(s);
 const ranges=normalizeColorRanges(s.colorRanges).filter(r=>r.text===text),rich=ranges.length?layoutText(c,text,s,max-20):[];
 let wordCursor=0;for(let i=0;i<lines.length;i++){
  const line=lines[i],width=c.measureText(line).width+spacingWidth(line,s),left=s.align==='center'?(max-width)/2:s.align==='right'?max-pad-width:pad,baseline=pad+i*lh;
  if(!ranges.length&&!s.spacing&&(!s.highlight||highlightWord<0)){c.fillStyle=s.color;if(s.strokeWidth)c.strokeText(line,left,baseline);c.fillText(line,left,baseline);if(s.underline){c.save();c.shadowBlur=0;c.strokeStyle=s.color;c.lineWidth=Math.max(1,s.size/20);c.beginPath();c.moveTo(left,baseline+s.size*1.08);c.lineTo(left+width,baseline+s.size*1.08);c.stroke();c.restore();}wordCursor+=line.split(/\s+/).length;continue;}
  const units:{char:string;at:number;color:string}[]=[];let inWord=false;
  for(const part of graphemes.segment(line)){
   const char=part.segment,nonspace=!!char.trim();if(!nonspace&&inWord){wordCursor++;inWord=false;}if(nonspace)inWord=true;
   const source=rich[i]?.offsets[part.index],chosen=ranges.findLast(r=>source>=r.start&&source<r.end);
   units.push({char,at:part.index,color:chosen?.color||(s.highlight&&nonspace&&wordCursor===highlightWord?s.highlightColor:s.color)});
  }if(inWord)wordCursor++;
  if(!s.spacing){
   // Draw full shaped lines under colour clips: preserve kerning and Vietnamese accents.
   if(s.strokeWidth)c.strokeText(line,left,baseline);
   let start=0;while(start<units.length){let end=start+1;while(end<units.length&&units[end].color===units[start].color)end++;
    const a=c.measureText(line.slice(0,units[start].at)).width,b=end===units.length?width:c.measureText(line.slice(0,units[end].at)).width;
    c.save();if(start>0||end<units.length){c.beginPath();c.rect(left+a,baseline-s.size*.5,b-a,s.size*2);c.clip();}c.fillStyle=units[start].color;c.fillText(line,left,baseline);c.restore();
    if(s.underline){c.save();c.shadowBlur=0;c.strokeStyle=units[start].color;c.lineWidth=Math.max(1,s.size/20);c.beginPath();c.moveTo(left+a,baseline+s.size*1.08);c.lineTo(left+b,baseline+s.size*1.08);c.stroke();c.restore();}start=end;
   }
  }else{let cursor=left;for(const unit of units){c.fillStyle=unit.color;if(s.strokeWidth)c.strokeText(unit.char,cursor,baseline);c.fillText(unit.char,cursor,baseline);const advance=c.measureText(unit.char).width+s.spacing;if(s.underline){c.save();c.shadowBlur=0;c.strokeStyle=unit.color;c.lineWidth=Math.max(1,s.size/20);c.beginPath();c.moveTo(cursor,baseline+s.size*1.08);c.lineTo(cursor+advance,baseline+s.size*1.08);c.stroke();c.restore();}cursor+=advance;}}
 }

 c.restore();
}
