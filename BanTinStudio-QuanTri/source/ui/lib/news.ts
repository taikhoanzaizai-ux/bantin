export type Scene = {id: string; text: string; imageId: string; duration: number; effect?: import('./video-options').Motion};
export type Picture = {id: string; name: string; url: string; image: HTMLImageElement; kind?:'image'|'video'; videoDuration?:number; trimStart?:number; trimEnd?:number; volume?:number; muted?:boolean; playback?:'hold'|'loop'; fit?:'contain'|'cover'|'manual'; backgroundMode?:'blur'|'solid'|'template';blurBackground?:boolean; blurAmount?:number; scale?:number; offsetX?:number; offsetY?:number; cropLeft?:number; cropRight?:number; cropTop?:number; cropBottom?:number;rotation?:number};
export type Style = 'news' | 'minimal' | 'bulletin';
export function splitScript(text: string, pictures: string[] = []): Scene[] {
  const sentences = text.trim().match(/[^.!?\n]+(?:[.!?]+|$)/g) || [text.trim()];
  const chunks: string[] = [];
  for (const sentence of sentences) {
    const words = sentence.trim().split(/\s+/);
    for(let i=0;i<words.length;i+=40) chunks.push(words.slice(i,i+40).join(' '));
  }
  return chunks.filter(Boolean).map((text,i)=>({id: `scene-${i}`, text, imageId: pictures.length ? pictures[i%pictures.length] : '', duration: Math.max(2, text.split(/\s+/).length/3.2)}));
}
export function fitTiming(scenes: Scene[], duration: number): Scene[] {
  const sum = scenes.reduce((a,s)=>a+s.text.split(/\s+/).length,0);
  return scenes.map(s=>({...s, duration: duration*s.text.split(/\s+/).length/Math.max(1,sum)}));
}
export function positionAt(scenes: Scene[], time: number) {
  let start=0;
  for(let i=0;i<scenes.length;i++) {
    if(time < start+scenes[i].duration || i===scenes.length-1) return {scene:scenes[i], index:i, progress: Math.max(0,Math.min(1,(time-start)/scenes[i].duration))};
    start+=scenes[i].duration;
  }
  return null;
}
export const clock = (n: number) => `${Math.floor(n/60).toString().padStart(2,'0')}:${Math.floor(n%60).toString().padStart(2,'0')}`;
export function srt(scenes:Scene[]) {
 let t=0, i=0;
 const stamp=(v:number)=>{const ms=Math.max(0,Math.round(v*1000)),h=Math.floor(ms/3600000),m=Math.floor(ms/60000)%60,s=Math.floor(ms/1000)%60;return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(ms%1000).padStart(3,'0')}`;};
 return scenes.flatMap(s=>{
   const words=s.text.split(/\s+/);const count=Math.ceil(words.length/9);const start=t;t+=s.duration;
   return Array.from({length:count},(_,j)=>`${++i}\n${stamp(start+s.duration*j/count)} --> ${stamp(start+s.duration*(j+1)/count)}\n${words.slice(j*9,j*9+9).join(' ')}\n`);
 }).join('\n');
}
