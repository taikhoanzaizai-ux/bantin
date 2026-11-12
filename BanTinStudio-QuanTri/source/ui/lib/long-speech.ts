import {audioWav} from './audio-mix';
// Keep requests small enough for the local model without imposing a script cap.
export function speechChunks(text:string,size=800){
 const chunks:string[]=[];let rest=text.trim();
 while(rest.length>size){let end=size;const head=rest.slice(0,size);let boundary=-1;
  for(const match of head.matchAll(/[.!?。！？\n]+(?=\s|$)/g))boundary=match.index!+match[0].length;
  if(boundary>size*.35)end=boundary;else{const space=head.search(/\s+\S*$/);if(space>size*.35)end=space;}
  if(/[\uD800-\uDBFF]/.test(rest[end-1]||''))end--;
  chunks.push(rest.slice(0,end).trim());rest=rest.slice(end).trimStart();
 }
 if(rest){if(rest.length<3&&chunks.length)chunks[chunks.length-1]+=' '+rest;else chunks.push(rest);}return chunks;
}
export function audioPart(source:AudioBuffer,start:number,end:number){
 const first=Math.round(start*source.sampleRate),last=Math.min(source.length,Math.round(end*source.sampleRate)),buffer=new AudioBuffer({length:Math.max(1,last-first),sampleRate:source.sampleRate,numberOfChannels:source.numberOfChannels});
 for(let c=0;c<source.numberOfChannels;c++)buffer.copyToChannel(source.getChannelData(c).subarray(first,last),c);return buffer;
}
export async function joinSpeech(parts:Blob[],signal:AbortSignal){
 const context=new AudioContext(),decoded:AudioBuffer[]=[];
 try{
  for(const part of parts){signal.throwIfAborted();decoded.push(await context.decodeAudioData(await part.arrayBuffer()));}
  if(!decoded.length)throw Error('Chưa có đoạn lời đọc để ghép.');
  const rate=decoded[0].sampleRate,channels=Math.max(...decoded.map(p=>p.numberOfChannels)),total=decoded.reduce((n,p)=>n+Math.round(p.duration*rate),0),out=new AudioBuffer({length:total,sampleRate:rate,numberOfChannels:channels});
  let offset=0;for(const part of decoded){const length=Math.round(part.duration*rate);for(let c=0;c<channels;c++){const source=part.getChannelData(Math.min(c,part.numberOfChannels-1)),target=out.getChannelData(c);for(let i=0;i<length;i++){const x=i*part.sampleRate/rate,j=Math.floor(x),f=x-j;target[offset+i]=(source[j]||0)*(1-f)+(source[j+1]??source[j]??0)*f;}}offset+=length;}
  signal.throwIfAborted();return audioWav(out);
 }finally{await context.close();}
}
