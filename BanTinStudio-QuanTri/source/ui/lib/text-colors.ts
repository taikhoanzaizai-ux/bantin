export type ColorRange={text:string;start:number;end:number;color:string};
export function normalizeColorRanges(raw:unknown):ColorRange[]{
 if(!Array.isArray(raw))return [];
 return raw.filter(r=>r&&typeof r.text==='string'&&Number.isInteger(r.start)&&Number.isInteger(r.end)&&r.start>=0&&r.end>r.start&&r.end<=r.text.length&&/^#[0-9a-f]{6}$/i.test(r.color)).map(r=>({text:r.text,start:r.start,end:r.end,color:r.color}));
}
export function paintRange(text:string,raw:unknown,start:number,end:number,color?:string):ColorRange[]{
 const ranges=normalizeColorRanges(raw).filter(r=>r.text===text),out:ColorRange[]=[];
 // Selection boundaries use UTF-16 (the textarea API); snap to full graphemes.
 const segments=[...new Intl.Segmenter('vi',{granularity:'grapheme'}).segment(text)];
 start=Math.max(0,Math.min(text.length,start));end=Math.max(start,Math.min(text.length,end));
 if(start===end)return ranges;
 const first=segments.find(s=>s.index+s.segment.length>start),last=segments.find(s=>s.index+s.segment.length>=end);
 start=first?.index??start;end=last?last.index+last.segment.length:end;
 for(const r of ranges){if(r.end<=start||r.start>=end)out.push(r);else{if(r.start<start)out.push({...r,end:start});if(r.end>end)out.push({...r,start:end});}}
 if(color&&/^#[0-9a-f]{6}$/i.test(color))out.push({text,start,end,color});
 return out.sort((a,b)=>a.start-b.start).reduce<ColorRange[]>((a,r)=>{const last=a.at(-1);if(last&&last.end===r.start&&last.color===r.color)last.end=r.end;else a.push({...r});return a;},[]);
}
export function editColorRanges(before:string,after:string,raw:unknown):ColorRange[]{
 let prefix=0;while(prefix<before.length&&prefix<after.length&&before[prefix]===after[prefix])prefix++;
 let suffix=0;while(suffix<before.length-prefix&&suffix<after.length-prefix&&before[before.length-1-suffix]===after[after.length-1-suffix])suffix++;
 const oldEnd=before.length-suffix,newEnd=after.length-suffix,delta=after.length-before.length;
 return normalizeColorRanges(raw).filter(r=>r.text===before).flatMap(r=>{
  if(r.end<=prefix)return [{...r,text:after}];if(r.start>=oldEnd)return [{...r,text:after,start:r.start+delta,end:r.end+delta}];
  const out:ColorRange[]=[];if(r.start<prefix)out.push({...r,text:after,end:prefix});if(r.end>oldEnd)out.push({...r,text:after,start:newEnd,end:r.end+delta});return out;
 });
}
// Map a caption's manual colours into word/reveal display, including repeated words.
export function displayColorRanges(source:string,display:string,raw:unknown,offset=0):ColorRange[]{
 return normalizeColorRanges(raw).filter(r=>r.text===source).flatMap(r=>{const start=Math.max(0,r.start-offset),end=Math.min(display.length,r.end-offset);return end>start?[{...r,text:display,start,end}]:[];});
}
