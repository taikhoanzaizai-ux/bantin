export const musicTracks=[{id:'none',name:'Không dùng nhạc',description:'Giữ nguyên lời đọc'},{id:'news',name:'Nhịp bản tin',description:'Tiết tấu gọn, nền trầm nhẹ'},{id:'pulse',name:'Chuyển động',description:'Nhịp điện tử đều, năng động'},{id:'ambient',name:'Góc nhìn',description:'Âm nền mềm, chậm và thoáng'},{id:'upload',name:'Nhạc của bạn',description:'Tải MP3, WAV, M4A từ thiết bị'}];
export function musicEnvelope(time:number,duration:number){return Math.max(0,Math.min(1,time/1.2,(duration-time)/1.8));}
export function mixChannels(voice:Float32Array[]|null,voiceRate:number,music:Float32Array[]|null,musicRate:number,duration:number,volume:number,duck:boolean,loop:boolean,rate=44100){
 const count=Math.max(1,Math.ceil(duration*rate));const channels=Math.max(1,Math.min(2,Math.max(voice?.length||0,music?.length||0)));const out=Array.from({length:channels},()=>new Float32Array(count));const musicLength=music?.[0]?.length||0;let peak=0,envelope=0;
 for(let i=0;i<count;i++){
  const t=i/rate;const vp=t*voiceRate,vi=Math.floor(vp),vf=vp-vi;let energy=0;for(const ch of voice||[])energy+=Math.abs(ch[vi]||0);energy/=voice?.length||1;envelope+=((energy>.018?1:0)-envelope)*(energy>.018?.002:.00012);
  const musicGain=Math.max(0,Math.min(.6,volume))*musicEnvelope(t,duration)*(duck&&voice?1-.72*envelope:1);
  const raw=t*musicRate;const mp=loop&&musicLength?raw%musicLength:raw,mi=Math.floor(mp),mf=mp-mi;const edge=loop&&musicLength?Math.min(1,mp/(musicRate*.012),(musicLength-mp)/(musicRate*.012)):1;
  for(let c=0;c<channels;c++){const v=voice?.[Math.min(c,(voice?.length||1)-1)];const b=music?.[Math.min(c,(music?.length||1)-1)];const narration=v?(v[vi]||0)*(1-vf)+(v[vi+1]||0)*vf:0;const backing=b&&mi<musicLength?((b[mi]||0)*(1-mf)+(b[mi+1]||0)*mf)*Math.max(0,edge):0;const sample=narration+backing*musicGain;out[c][i]=sample;peak=Math.max(peak,Math.abs(sample));}
 }
 if(peak>.98){const gain=.98/peak;for(const channel of out)for(let i=0;i<count;i++)channel[i]*=gain;}
 return out;
}
export function mixAudio(voice:AudioBuffer|null,music:AudioBuffer|null,duration:number,volume:number,duck:boolean,loop:boolean){
 if(!music&&!voice)return null;
 if(!music&&voice&&Math.abs(voice.duration-duration)<.01)return voice;
 const channels=mixChannels(voice?Array.from({length:voice.numberOfChannels},(_,i)=>voice.getChannelData(i)):null,voice?.sampleRate||44100,music?Array.from({length:music.numberOfChannels},(_,i)=>music.getChannelData(i)):null,music?.sampleRate||44100,duration,volume,duck,loop);
 const buffer=new AudioBuffer({length:channels[0].length,numberOfChannels:channels.length,sampleRate:44100});channels.forEach((ch,i)=>buffer.copyToChannel(ch as Float32Array<ArrayBuffer>,i));return buffer;
}
export function audioWav(buffer:AudioBuffer){const ch=buffer.numberOfChannels,n=buffer.length;const out=new ArrayBuffer(44+n*ch*2),v=new DataView(out);const word=(o:number,s:string)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));};word(0,'RIFF');v.setUint32(4,out.byteLength-8,true);word(8,'WAVE');word(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,ch,true);v.setUint32(24,buffer.sampleRate,true);v.setUint32(28,buffer.sampleRate*ch*2,true);v.setUint16(32,ch*2,true);v.setUint16(34,16,true);word(36,'data');v.setUint32(40,n*ch*2,true);const channels=Array.from({length:ch},(_,i)=>buffer.getChannelData(i));for(let i=0;i<n;i++)for(let c=0;c<ch;c++){const value=Math.max(-1,Math.min(1,channels[c][i]));v.setInt16(44+(i*ch+c)*2,value*(value<0?32768:32767),true);}return new Blob([out],{type:'audio/wav'});}
export function composeMusic(id:string):AudioBuffer{
 const rate=44100,length=16*rate,buffer=new AudioBuffer({length,numberOfChannels:2,sampleRate:rate});const beat=id==='pulse'?.4:id==='news'?.5:.8;const notes=id==='ambient'?[130.81,164.81,196,246.94]:id==='pulse'?[110,130.81,164.81,196]:[98,123.47,146.83,196];
 for(let c=0;c<2;c++){const out=buffer.getChannelData(c);for(let i=0;i<length;i++){const t=i/rate,phase=t%beat,b=Math.floor(t/beat);const bass=notes[Math.floor(t/4)%4]/2;let sample=.16*Math.sin(2*Math.PI*bass*t);sample+=.045*Math.sin(2*Math.PI*notes[0]*2*t+c*.3)+.035*Math.sin(2*Math.PI*notes[2]*2*t-c*.2);if(id!=='ambient'){sample+=.2*Math.sin(2*Math.PI*(48*phase+35*(1-Math.exp(-phase*35))/35))*Math.exp(-phase*22);const note=notes[b%4]*2;sample+=.08*Math.sin(2*Math.PI*note*phase)*Math.exp(-phase*13);const hat=t%(beat/2);sample+=.018*Math.sin(2*Math.PI*7600*t)*Math.sin(2*Math.PI*9137*t)*Math.exp(-hat*90);}else sample+=.05*Math.sin(2*Math.PI*notes[b%4]*2*t)*(.5+.5*Math.sin(t*.7));out[i]=sample*Math.min(1,t/.1,(16-t)/.1);}}
 return buffer;
}
