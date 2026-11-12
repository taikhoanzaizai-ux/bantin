'use client';
import {useRef,useState} from 'react';
import {normalizeColorRanges,paintRange,editColorRanges,type ColorRange} from '@/lib/text-colors';
type Props={value:string;ranges?:ColorRange[];color?:string;onChange:(text:string,ranges:ColorRange[])=>void;label:string;maxLength?:number;disabled?:boolean;id?:string;className?:string};
export default function ColorTextInput({value,ranges,color='#ffffff',onChange,label,...props}:Props){
 const selection=useRef({start:0,end:0,text:value}),[count,setCount]=useState(0),[chosen,setChosen]=useState('#ffe135');
 const selected=()=>selection.current.text===value&&selection.current.end>selection.current.start;
 const apply=(next?:string)=>{if(!selected())return;onChange(value,paintRange(value,ranges,selection.current.start,selection.current.end,next));};
 const colors=normalizeColorRanges(ranges).filter(r=>r.text===value),breaks=[...new Set([0,value.length,...colors.flatMap(r=>[r.start,r.end])])].sort((a,b)=>a-b);
 return <div className="color-text-input"><textarea {...props} aria-label={label} value={value} onSelect={e=>{selection.current={start:e.currentTarget.selectionStart,end:e.currentTarget.selectionEnd,text:value};setCount(e.currentTarget.selectionEnd-e.currentTarget.selectionStart);}} onChange={e=>{const next=e.target.value;onChange(next,editColorRanges(value,next,ranges));selection.current={start:e.target.selectionStart,end:e.target.selectionEnd,text:next};setCount(0);}}/>
 <div className="selection-colors"><label>Màu phần bôi chọn<input type="color" aria-label={`Màu đoạn chọn · ${label}`} value={chosen} disabled={props.disabled||!selected()} onChange={e=>{setChosen(e.target.value);apply(e.target.value);}}/></label><button type="button" className="text-link" disabled={props.disabled||!selected()} onClick={()=>apply()}>Bỏ màu đoạn chọn</button><button type="button" className="text-link" disabled={props.disabled||!colors.length} onClick={()=>onChange(value,[])}>Xóa màu riêng</button><small>{count&&selected()?`Đã chọn ${count} ký tự`:'Bôi chọn chữ trong ô trên rồi chọn màu'}</small></div>
 {!!colors.length&&<div aria-label={`Xem màu chữ · ${label}`} className="colored-text-sample" style={{color}}>{breaks.slice(0,-1).map((start,i)=><span key={start} style={{color:colors.findLast(r=>start>=r.start&&start<r.end)?.color}}>{value.slice(start,breaks[i+1])}</span>)}</div>}
 </div>;
}
