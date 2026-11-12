import {speechChunks,joinSpeech} from './long-speech';
export type LocalVoice={id:string;name:string;description:string};
// The desktop server owns the engine process and its authentication. No pairing secret enters browser storage.
export function localVoiceOrigin(value:string){const url=new URL(value);if(url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new Error('Dùng địa chỉ bộ chạy trên máy này.');return url.origin;}
export async function localVoiceRequest(_base:string,_token:string,path:'/health'|'/v1/voices'|'/v1/audio/speech'|'/v1/audio/transcribe',init:RequestInit={},signal?:AbortSignal){
 const headers=new Headers(init.headers);const method=(init.method||'GET').toUpperCase();const timeout=signal||AbortSignal.timeout(300000);
 if(method!=='GET'){
  const status=await fetch('/_desktop/voice/status',{signal:timeout});const state=await status.json() as {csrf?:string;ready?:boolean;message?:string;error?:string};
  if(!status.ok||!state.ready||!state.csrf)throw new Error(state.error||state.message||'VieNeu đang chuẩn bị. Chờ trạng thái sẵn sàng rồi thử lại.');
  headers.set('X-Studio-CSRF',state.csrf);
 }
 let response:Response;try{response=await fetch('/_desktop/voice/proxy'+path,{...init,headers,signal:timeout});}catch(e){if(signal?.aborted)throw new Error('Đã dừng chờ.');throw new Error('VieNeu trên máy chưa trả lời. Mở lại tool hoặc xem trạng thái chuẩn bị.');}
 if(!response.ok){let detail='';try{const body=await response.json() as {detail?:unknown;error?:unknown;message?:unknown};detail=typeof body.detail==='string'?body.detail:typeof body.message==='string'?body.message:typeof body.error==='string'?body.error:'';}catch{}throw new Error(detail||'VieNeu chưa xử lý được yêu cầu. Kiểm tra trạng thái chuẩn bị.');}return response;
}

// The checked-in Turbo SDK ignores a speed keyword; the bridge changes the waveform instead.
export async function speechRequest(base:string,token:string,input:string,voice:string,speed:number,signal:AbortSignal,onProgress?:(index:number,total:number)=>void){
 if(!Number.isFinite(speed)||speed<.75||speed>1.5)throw new Error('Tốc độ đọc từ 0.75 đến 1.50.');
 if(speed!==1){const state=await(await localVoiceRequest(base,token,'/health',{},signal)).json() as {capabilities?:string[]};if(!state.capabilities?.includes('speech-speed'))throw new Error('Cập nhật bộ chạy trong gói tool mới để dùng tốc độ đọc. Đóng tool cũ rồi mở lại.');}
 const chunks=speechChunks(input);if(!chunks.length)throw Error('Nhập nội dung kịch bản trước khi tạo lời đọc.');
 if(chunks.length===1){onProgress?.(1,1);return localVoiceRequest(base,token,'/v1/audio/speech',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({input:chunks[0],voice,speed})},signal);}
 const parts:Blob[]=[];for(let i=0;i<chunks.length;i++){signal.throwIfAborted();onProgress?.(i+1,chunks.length);const response=await localVoiceRequest(base,token,'/v1/audio/speech',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({input:chunks[i],voice,speed})},signal);parts.push(await response.blob());}
 return new Response(await joinSpeech(parts,signal),{headers:{'Content-Type':'audio/wav'}});
}
