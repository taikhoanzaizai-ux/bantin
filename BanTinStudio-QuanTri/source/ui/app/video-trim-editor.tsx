'use client';
import {useId,useRef,useState} from 'react';
import type {Picture} from '@/lib/news';
import {trimRange} from '@/lib/media';
type Props={p:Picture;onChange:(p:Picture)=>void;onSourcePlay:()=>void;disabled?:boolean};
export default function VideoTrimEditor({p,onChange,onSourcePlay,disabled=false}:Props){
 const id=useId(),player=useRef<HTMLVideoElement>(null),track=useRef<HTMLDivElement>(null),drag=useRef<'start'|'end'|null>(null),segment=useRef(false),[cursor,setCursor]=useState(0),[error,setError]=useState('');
 const range=trimRange(p),duration=p.videoDuration||1;
 function seek(value:number){const time=Math.max(0,Math.min(duration,Number.isFinite(value)?value:0));if(player.current)player.current.currentTime=time;setCursor(time);}
 function update(edge:'start'|'end',value:number){if(disabled||!Number.isFinite(value))return;player.current?.pause();segment.current=false;const time=Math.round(value*100)/100;
  if(edge==='start'){const start=Math.max(0,Math.min(time,range.end-.1));onChange({...p,trimStart:start});seek(start);}
  else{const end=Math.min(duration,Math.max(range.start+.1,time));onChange({...p,trimEnd:end});seek(Math.max(range.start,end-.05));}
 }
 function position(clientX:number){const rect=track.current?.getBoundingClientRect();return rect?Math.max(0,Math.min(duration,(clientX-rect.left)/Math.max(1,rect.width)*duration)):0;}
 async function playSegment(){if(!player.current||disabled)return;seek(range.start);segment.current=true;setError('');try{await player.current.play();}catch{segment.current=false;setError('Bấm phát trên video để nghe/xem.');}}
 return <section className="video-trim-editor" aria-label={`Chọn đoạn ${p.name}`}>
  <div className="source-preview-wrap"><video ref={player} data-source-video src={p.url} controls playsInline preload="metadata" className="source-video" onLoadedMetadata={()=>seek(range.start)} onPlay={()=>{document.querySelectorAll<HTMLVideoElement>('video[data-source-video]').forEach(v=>{if(v!==player.current)v.pause();});onSourcePlay();}} onTimeUpdate={()=>{const time=player.current?.currentTime||0;setCursor(time);if(segment.current&&time>=range.end){player.current?.pause();segment.current=false;seek(range.end);}}} onSeeked={()=>setCursor(player.current?.currentTime||0)}/>
   <div className="trim-on-video"><span>{cursor.toFixed(2)} s</span><button disabled={disabled} onClick={()=>update('start',player.current?.currentTime||0)}>Đặt mốc đầu tại đây</button><button disabled={disabled} onClick={()=>update('end',player.current?.currentTime??range.end)}>Đặt mốc cuối tại đây</button></div>
  </div>
  <div ref={track} className="trim-track" aria-label="Vùng chọn đoạn video" onPointerDown={e=>{if(disabled||drag.current)return;e.currentTarget.setPointerCapture(e.pointerId);seek(position(e.clientX));}} onPointerMove={e=>{if(drag.current)update(drag.current,position(e.clientX));}} onPointerUp={()=>drag.current=null} onPointerCancel={()=>drag.current=null}>
   <div className="trim-selected" style={{left:range.start/duration*100+'%',width:(range.end-range.start)/duration*100+'%'}}/>
   <span className="trim-playhead" style={{left:cursor/duration*100+'%'}}/>
   {(['start','end'] as const).map(edge=><button key={edge} type="button" className={`trim-handle ${edge}`} style={{left:range[edge]/duration*100+'%'}} aria-label={edge==='start'?'Kéo điểm bắt đầu':'Kéo điểm kết thúc'} disabled={disabled} onPointerDown={e=>{e.preventDefault();e.stopPropagation();drag.current=edge;track.current?.setPointerCapture(e.pointerId);}}/>)}
  </div>
  <div className="trim-inputs"><label htmlFor={id+'-start'}>Điểm đầu · {range.start.toFixed(2)} s<input id={id+'-start'} aria-label="Điểm bắt đầu video" type="range" min={0} max={Math.max(0,range.end-.1)} step={.05} value={range.start} disabled={disabled} onChange={e=>update('start',Number(e.target.value))}/></label><label htmlFor={id+'-end'}>Điểm cuối · {range.end.toFixed(2)} s<input id={id+'-end'} aria-label="Điểm kết thúc video" type="range" min={range.start+.1} max={duration} step={.05} value={range.end} disabled={disabled} onChange={e=>update('end',Number(e.target.value))}/></label></div>
  <div className="trim-actions"><button className="button ghost" disabled={disabled} onClick={playSegment}>Phát đoạn đã chọn</button><span>{(range.end-range.start).toFixed(2)} s đã chọn / {duration.toFixed(2)} s gốc</span></div>
  <p className="micro">Kéo hai tay nắm để chọn đoạn. Bấm lên thanh để tìm mốc; có thể đặt điểm đầu/cuối ngay trên video.</p>{error&&<p role="alert">{error}</p>}
 </section>;
}
