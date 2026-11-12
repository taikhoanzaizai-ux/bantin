'use client';
import {useEffect,useRef,useState,useId} from 'react';
import {LoaderCircle,Play,Square} from 'lucide-react';
import {speechRequest} from '@/lib/local-voice';

const sample='Xin chào quý vị. Đây là giọng đọc bản tin hôm nay. Mời quý vị cùng theo dõi những thông tin mới nhất.';
type Props={voice:string;mode:string;speed:number;ready:boolean;base:string;token:string;busy:boolean;onBusy:(value:boolean)=>void;onStart:()=>void};

export default function VoicePreview(props:Props){
  const previewTextId=useId();
  const [text,setText]=useState(sample),[src,setSrc]=useState(''),[loading,setLoading]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const player=useRef<HTMLAudioElement>(null),url=useRef(''),request=useRef<AbortController|null>(null);
  const callbacks=useRef(props);callbacks.current=props;
  function discard(){if(url.current)URL.revokeObjectURL(url.current);url.current='';setSrc('');player.current?.pause();}
  function cancel(){player.current?.pause();const active=request.current;request.current=null;active?.abort();setLoading(false);if(active)callbacks.current.onBusy(false);setMessage('Đã dừng chờ nghe thử.');}
  useEffect(()=>{
    setSrc('');setLoading(false);setError('');setMessage('');
    const audio=player.current;
    const expired=()=>{cancel();discard();setError('Bản quyền chưa hoạt động. Gia hạn rồi nghe thử lại.');};
    window.addEventListener('studio-license-expired',expired);
    return()=>{const active=request.current;request.current=null;active?.abort();if(active)callbacks.current.onBusy(false);audio?.pause();if(url.current)URL.revokeObjectURL(url.current);url.current='';window.removeEventListener('studio-license-expired',expired);};
  },[props.voice,props.mode,props.speed,props.ready,props.base,props.token]);
  async function play(control?:AbortController){
    try{await player.current?.play();if(control&&(control.signal.aborted||request.current!==control))return;setMessage('Đang nghe thử giọng đã chọn.');}
    catch{if(control&&(control.signal.aborted||request.current!==control))return;setMessage('Mẫu đã sẵn sàng. Bấm nút phát ở thanh âm thanh để nghe.');}
  }
  async function preview(){
    if(loading){cancel();return;}
    if(props.busy||!props.ready||!props.voice||text.trim().length<3)return;
    props.onStart();setError('');
    if(src){player.current!.currentTime=0;await play();return;}
    const control=new AbortController();request.current=control;setLoading(true);props.onBusy(true);setMessage('Đang tạo đoạn nghe thử ngắn bằng giọng đã chọn…');
    try{
      const response=await speechRequest(props.base,props.token,text.trim(),props.voice,props.speed,control.signal);
      const blob=await response.blob();if(control.signal.aborted||request.current!==control)return;
      if(!blob.size||!blob.type.startsWith('audio/'))throw new Error('Chưa nhận được âm thanh nghe thử hợp lệ. Hãy thử lại.');
      url.current=URL.createObjectURL(blob);setSrc(url.current);if(player.current)player.current.src=url.current;
      await play(control);
    }catch(e){if(!control.signal.aborted&&request.current===control){setError((e as Error).message||'Chưa nghe thử được giọng.');setMessage('');}}
    finally{if(request.current===control){request.current=null;setLoading(false);callbacks.current.onBusy(false);}}
  }
  return <div className="voice-preview-panel">
    <label className="field-label" htmlFor={previewTextId}>Nội dung nghe thử</label>
    <textarea id={previewTextId} rows={3} maxLength={240} disabled={loading||props.busy} value={text} onChange={e=>{discard();setError('');setMessage('');setText(e.target.value.slice(0,240));}}/>
    <small className="micro">{text.length}/240 ký tự · Tốc độ {props.speed.toFixed(2)}× · Nghe một đoạn ngắn trước khi tạo lời đọc đầy đủ.</small>
    <button className="button full" disabled={!loading&&(props.busy||!props.ready||!props.voice||text.trim().length<3)} onClick={preview}>{loading?<LoaderCircle className="spin" size={16}/>:<Play size={16}/>} {loading?'Hủy nghe thử':src?'Nghe lại giọng':'Nghe thử giọng'}</button>
    {!props.ready&&<p className="micro">Chuẩn bị VieNeu và chờ báo Sẵn sàng để nghe thử.</p>}
    {props.ready&&!props.voice&&<p className="micro">Nạp hoặc chọn giọng đã lưu trước khi nghe thử.</p>}
    {loading&&<span className="micro"><Square size={12}/> Bạn có thể hủy chờ; bộ chạy có thể cần xử lý nốt yêu cầu.</span>}
    <audio ref={player} data-voice-preview controls hidden={!src} src={src||undefined} preload="metadata" aria-label="Âm thanh nghe thử giọng" onPlay={()=>{if(typeof document!=='undefined')document.querySelectorAll<HTMLAudioElement>('audio[data-voice-preview]').forEach(a=>{if(a!==player.current)a.pause();});callbacks.current.onStart();}} onEnded={()=>setMessage('Đã nghe xong. Bạn có thể đổi giọng hoặc tạo lời đọc đầy đủ.')} onError={()=>{if(url.current)setError('Không phát được mẫu âm thanh. Hãy đổi nội dung hoặc chọn lại giọng để thử lại.');}}/>
    {message&&<p className="micro" role="status">{message}</p>}{error&&<p className="micro" role="alert">{error}</p>}
  </div>;
}
