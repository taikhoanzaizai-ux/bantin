import {displayColorRanges} from './text-colors';
import type {IntroAppearance} from './intro-template';
import {introAt,introSeconds,frameRequest,resolvedIntro,type IntroConfig} from './intro';
import {drawIntro} from './intro-render';
import {mediaFrameFor,protectsFooter} from './safe-frame';
import {activeTemplateSlots,type PreparedTemplateSlot} from './template-timeline';
import {positionAt, type Scene, type Picture, type Style} from './news';
import {mediaLayout,VideoFrames} from './media';
import {defaultTextStyles,drawStyledText,frameSize,type TextStyles} from './text-style';
import {captionDisplay,type CaptionMode} from './caption-presets';
import type {FrameBox,TemplateLabel} from './template-design';
import {cueAt,type CaptionCue} from './captions';
import {safeMotionTransform,introAlpha,type Motion,type Transition} from './video-options';
export type RenderData={intro?:IntroConfig;introTemplate?:IntroAppearance;scenes:Scene[];pictures:Picture[];title:string;brand:string;style:Style;captions:boolean;zoom:boolean;logo:HTMLImageElement|null;motion:Motion;motionStrength:number;transition:Transition;transitionDuration:number;introDuration:number;titleEnabled:boolean;footer:HTMLImageElement|null;footerMode:'intro'|'full'|'off';footerPlacement:'bottom'|'full';footerScale:number;footerBottom:number;templateSlots?:PreparedTemplateSlot[];videoFrames?:Map<number,CanvasImageSource>;aspect?:'portrait'|'landscape';accent?:string;tagline?:string;brandEnabled?:boolean;textStyles?:TextStyles;cues?:CaptionCue[];captionMode?:CaptionMode;mediaBox?:FrameBox;logoBox?:FrameBox;footerGradient?:{from:string;to:string;height:number};footerOpacity?:number;templateSource?:TemplateLabel;templateDate?:TemplateLabel;protectFooter?:boolean;footerSafeHeight?:number};
function wrap(c:CanvasRenderingContext2D,text:string,max:number){const lines:string[]=[];let line='';for(const word of text.split(/\s+/)){const trial=line?line+' '+word:word;if(c.measureText(trial).width>max&&line){lines.push(line);line=word;}else line=trial;}if(line)lines.push(line);return lines;}
function drawFooter(c:CanvasRenderingContext2D,data:RenderData,time:number,W:number,H:number,asBackground=false){
 const intro=introAlpha(time,data.introDuration),visible=!!(data.footer||data.footerGradient)&&data.footerMode!=='off'&&(data.footerMode==='full'||intro>0);if(!visible)return;
 c.save();c.globalAlpha*=(data.footerMode==='intro'?intro:1)*(data.footerOpacity??1);
 if(data.footerGradient){const h=asBackground?H:H*data.footerGradient.height/100,fw=asBackground?W:W*data.footerScale,x=(W-fw)/2,y=asBackground?0:data.footerPlacement==='full'?(H-h)/2:H-h-data.footerBottom,g=c.createLinearGradient(x,y,x+fw,y);g.addColorStop(0,data.footerGradient.from);g.addColorStop(1,data.footerGradient.to);c.fillStyle=g;c.fillRect(x,y,fw,h);}
 if(data.footer){const im=data.footer,factor=Math.min(W*data.footerScale/im.width,H/im.height),iw=im.width*factor,ih=im.height*factor,x=(W-iw)/2,y=data.footerPlacement==='full'?(H-ih)/2:H-ih-data.footerBottom;c.drawImage(im,x,y,iw,ih);}c.restore();
}
function drawSlots(c:CanvasRenderingContext2D,data:RenderData,time:number,layer:'background'|'overlay',W:number,H:number){
 for(const s of activeTemplateSlots(data.templateSlots,time,layer)){const b=s.box,x=W*b.x/100,y=H*b.y/100,w=W*b.width/100,h=H*b.height/100;c.save();c.globalAlpha*=s.opacity;c.beginPath();c.rect(x,y,w,h);c.clip();if(s.gradient){const g=c.createLinearGradient(x,y,x+w,y);g.addColorStop(0,s.gradient.from);g.addColorStop(1,s.gradient.to);c.fillStyle=g;c.fillRect(x,y,w,h);}if(s.image){const im=s.image,scale=(s.fit==='cover'?Math.max:Math.min)(w/im.width,h/im.height);c.drawImage(im,x+(w-im.width*scale)/2,y+(h-im.height*scale)/2,im.width*scale,im.height*scale);}c.restore();}
}
function pictureFrame(c:CanvasRenderingContext2D,data:RenderData,index:number,progress:number,time:number){
 let {width:W,height:H}=frameSize(data.aspect);const scene=data.scenes[index],pic=data.pictures.find(p=>p.id===scene?.imageId),transparent=pic?.backgroundMode==='template';c.save();c.beginPath();c.rect(0,0,W,H);c.clip();if(!protectsFooter(data)){c.fillStyle='#0c1928';c.fillRect(0,0,W,H);if(transparent)drawFooter(c,data,time,W,H,true);drawSlots(c,data,time,'background',W,H);}if(data.mediaBox){const b=data.mediaBox;c.translate(W*b.x/100,H*b.y/100);W=W*b.width/100;H=H*b.height/100;c.beginPath();c.rect(0,0,W,H);c.clip();}c.fillStyle='#0c1928';if(!pic)c.fillRect(0,0,W,H);
 if(pic){const im=data.videoFrames?.get(index)||pic.image;const w='videoWidth' in im?Number(im.videoWidth):'naturalWidth' in im?Number(im.naturalWidth):Number((im as HTMLCanvasElement).width),h='videoHeight' in im?Number(im.videoHeight):'naturalHeight' in im?Number(im.naturalHeight):Number((im as HTMLCanvasElement).height);if(!transparent)c.fillRect(0,0,W,H);
 if(pic.backgroundMode==='blur'||!pic.backgroundMode&&pic.blurBackground!==false){const scale=Math.max(W/w,H/h)*1.12;c.save();c.filter=`blur(${pic.blurAmount??24}px)`;c.drawImage(im,(W-w*scale)/2,(H-h*scale)/2,w*scale,h*scale);c.restore();c.fillStyle='#07101c44';c.fillRect(0,0,W,H);}
 const m=safeMotionTransform(data.zoom?(scene?.effect||data.motion):'none',index,progress,data.motionStrength,scene?.duration||0,pic.kind),r=mediaLayout(pic,w,h,m,W,H,protectsFooter(data));c.save();c.translate(r.x+r.dw/2,r.y+r.dh/2);c.rotate((pic.rotation||0)*Math.PI/180);c.drawImage(im,r.sx,r.sy,r.sw,r.sh,-r.dw/2,-r.dh/2,r.dw,r.dh);c.restore();}

 else{c.scale(W/720,H/1280);const grad=c.createLinearGradient(0,0,720,1280);grad.addColorStop(0,'#173a47');grad.addColorStop(1,'#080e1a');c.fillStyle=grad;c.fillRect(0,0,720,1280);c.strokeStyle='#38606b';c.lineWidth=1;for(let x=-600;x<1000;x+=70){c.beginPath();c.moveTo(x,0);c.lineTo(x+600,1280);c.stroke();}c.strokeStyle='#3c9a95';c.lineWidth=2;c.beginPath();c.arc(360,510,215,0,Math.PI*2);c.stroke();for(const r of [100,170]){c.beginPath();c.ellipse(360,510,r,215,0,0,Math.PI*2);c.stroke();}for(const y of [420,510,600]){c.beginPath();c.moveTo(160,y);c.lineTo(560,y);c.stroke();}}
 c.restore();
}
function drawCaptions(c:CanvasRenderingContext2D,data:RenderData,time:number,W:number,H:number){
 if(!data.captions)return;const cue=cueAt(data.cues||[],time);if(!cue)return;
 const style=(data.textStyles||defaultTextStyles()).caption,mode=data.captionMode||(style.highlight?'highlight':'line'),display=captionDisplay(cue,time,mode);drawStyledText(c,display.text,{...style,colorRanges:displayColorRanges(cue.text,display.text,cue.colorRanges,display.offset),highlight:mode==='highlight'},W,H,display.highlightWord);
}
export function drawFrame(canvas:HTMLCanvasElement,time:number,data:RenderData){
 if(introAt(data.intro,time)){
  const config=resolvedIntro(data.intro!,data.pictures),specific=!!config.footerId&&!['inherit','off'].includes(config.footerId),showFooter=config.footerId!=='off';
  const appearance:RenderData={...data,...(specific?data.introTemplate:{}),aspect:data.aspect,footerMode:'full'};
  const box=showFooter?mediaFrameFor(appearance,time):undefined,c=canvas.getContext('2d')!,{width:W,height:H}=frameSize(data.aspect);
  c.save();c.scale(canvas.width/W,canvas.height/H);c.fillStyle='#0c1928';c.fillRect(0,0,W,H);if(showFooter&&protectsFooter(appearance))drawFooter(c,appearance,time,W,H);c.restore();
  drawIntro(canvas,time,config,data.aspect,showFooter?'':data.brandEnabled===false?'':data.brand,data.videoFrames,box);
  if(showFooter&&(appearance.footer||appearance.footerGradient||specific)){
   const styles=appearance.textStyles||defaultTextStyles(),alpha=introAlpha(time,appearance.introDuration);c.save();c.scale(canvas.width/W,canvas.height/H);if(!protectsFooter(appearance))drawFooter(c,appearance,time,W,H);
   if(appearance.brandEnabled!==false&&appearance.brand.trim())drawStyledText(c,appearance.brand,styles.brand,W,H);
   if(appearance.logo){const b=appearance.logoBox||{x:83,y:6.6,width:12.5,height:8.5},factor=Math.min(W*b.width/100/appearance.logo.width,H*b.height/100/appearance.logo.height);c.drawImage(appearance.logo,W*b.x/100,H*b.y/100,appearance.logo.width*factor,appearance.logo.height*factor);}
   if(appearance.titleEnabled&&alpha>0){c.save();c.globalAlpha=alpha;if(appearance.tagline!=='')drawStyledText(c,appearance.tagline??'ĐIỂM TIN',styles.tag,W,H);drawStyledText(c,appearance.title,styles.title,W,H);c.restore();}
   if(appearance.templateSource?.enabled&&appearance.templateSource.text)drawStyledText(c,appearance.templateSource.text,appearance.templateSource.style,W,H);
   if(appearance.templateDate?.enabled)drawStyledText(c,appearance.templateDate.text||new Date().toLocaleDateString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}),appearance.templateDate.style,W,H);
   c.restore();
  }
  if(!(showFooter&&(appearance.footer||appearance.footerGradient||specific)&&appearance.titleEnabled&&appearance.title.trim()&&introAlpha(time,appearance.introDuration)>0)){c.save();c.scale(canvas.width/W,canvas.height/H);drawCaptions(c,appearance,time,W,H);c.restore();}
  return;
 }
 const narrationTime=time;
 time=Math.max(0,time-introSeconds(data.intro));
 const mediaData={...data,mediaBox:mediaFrameFor(data,time)};
 const c=canvas.getContext('2d')!,{width:W,height:H}=frameSize(data.aspect);c.save();c.scale(canvas.width/W,canvas.height/H);const pos=positionAt(data.scenes,time),index=pos?.index||0,progress=pos?.progress||0,transitionLength=Math.min(data.transitionDuration,(pos?.scene.duration||1)*.45),elapsed=progress*(pos?.scene.duration||0),p=transitionLength>0?Math.min(1,elapsed/transitionLength):1;
 if(protectsFooter(data)){c.fillStyle='#0c1928';c.fillRect(0,0,W,H);drawSlots(c,data,time,'background',W,H);const backdrop=data.pictures.find(pic=>pic.id===pos?.scene.imageId);drawFooter(c,data,time,W,H,backdrop?.backgroundMode==='template');}
 if(index>0&&p<1&&data.transition!=='cut'){
  if(data.transition==='slide'){c.save();c.translate(-W*p,0);pictureFrame(c,mediaData,index-1,1,time);c.restore();c.save();c.translate(W*(1-p),0);pictureFrame(c,mediaData,index,progress,time);c.restore();}
  else if(data.transition==='dip'){pictureFrame(c,mediaData,p<.5?index-1:index,p<.5?1:progress,time);c.save();c.globalAlpha=Math.sin(Math.PI*p);c.fillStyle='#07101c';c.fillRect(0,0,W,H);c.restore();}
  else{pictureFrame(c,mediaData,index-1,1,time);c.save();if(data.transition==='wipe'){c.beginPath();c.rect(0,0,W*p,H);c.clip();}else c.globalAlpha=p;pictureFrame(c,mediaData,index,progress,time);c.restore();}
 }else pictureFrame(c,mediaData,index,progress,time);
 const accent=data.accent||(data.style==='news'?'#ed3e52':data.style==='minimal'?'#4ce4bd':'#5c8dff'),styles=data.textStyles||defaultTextStyles(),intro=introAlpha(time,data.introDuration);
 const grad=c.createLinearGradient(0,H*.4,0,H);grad.addColorStop(0,'#07101c00');grad.addColorStop(1,'#07101c55');c.fillStyle=grad;c.fillRect(0,H*.4,W,H*.6);
 const currentPicture=data.pictures.find(pic=>pic.id===pos?.scene.imageId);if(currentPicture?.backgroundMode!=='template'&&!protectsFooter(data))drawFooter(c,data,time,W,H);drawSlots(c,data,time,'overlay',W,H);
 if(data.brandEnabled!==false&&data.brand.trim()){c.fillStyle=accent;c.fillRect(Math.max(0,W*styles.brand.x/100-18),H*styles.brand.y/100+7,6,styles.brand.size);drawStyledText(c,data.brand,styles.brand,W,H);}
 if(data.logo){const b=data.logoBox||{x:83,y:6.6,width:12.5,height:8.5},factor=Math.min(W*b.width/100/data.logo.width,H*b.height/100/data.logo.height);c.drawImage(data.logo,W*b.x/100,H*b.y/100,data.logo.width*factor,data.logo.height*factor);}
 if(data.titleEnabled&&intro>0){c.save();c.globalAlpha=intro;const s=styles.title,x=W*s.x/100,y=H*s.y/100;
 if(data.tagline!=='')drawStyledText(c,data.tagline??'ĐIỂM TIN',styles.tag,W,H);
 drawStyledText(c,data.title||'Mỗi câu chuyện. Một góc nhìn mới.',s,W,H);c.restore();}
 if(data.templateSource?.enabled&&data.templateSource.text)drawStyledText(c,data.templateSource.text,data.templateSource.style,W,H);
 if(data.templateDate?.enabled)drawStyledText(c,data.templateDate.text||new Date().toLocaleDateString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}),data.templateDate.style,W,H);
 if(data.titleEnabled&&intro>0){c.restore();return;}
 if(data.captions&&!data.cues&&pos){const words=pos.scene.text.split(/\s+/),chunks=Math.ceil(words.length/9),chunk=Math.min(Math.floor(pos.progress*chunks),chunks-1);drawStyledText(c,words.slice(chunk*9,chunk*9+9).join(' '),styles.caption,W,H);}else drawCaptions(c,data,narrationTime,W,H);
 c.restore();
}

export async function exportVideo(data:RenderData,audio:AudioBuffer|null,width:number,onProgress:(n:number)=>void,signal:AbortSignal){
 const m=await import('mediabunny');const height=data.aspect==='landscape'?width*9/16:width*16/9;await document.fonts.ready;
 const avc=await m.canEncodeVideo('avc',{width,height});const aac=!audio||await m.canEncodeAudio('aac',{numberOfChannels:audio.numberOfChannels,sampleRate:audio.sampleRate});
 const mp4=avc&&aac;
 if(!mp4&&(!(await m.canEncodeVideo('vp9',{width,height}))||(audio&&!(await m.canEncodeAudio('opus',{numberOfChannels:audio.numberOfChannels,sampleRate:audio.sampleRate})))))throw new Error('Trình duyệt chưa hỗ trợ xuất video. Hãy dùng Chrome hoặc Edge trên máy tính.');
 const target=new m.BufferTarget();const output=new m.Output({format:mp4?new m.Mp4OutputFormat():new m.WebMOutputFormat(),target});
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 const video=new m.CanvasSource(canvas,{codec:mp4?'avc':'vp9',quality:new m.Quality({bitrate:Math.max(width,height)>=1920?6e6:3e6})});output.addVideoTrack(video,{frameRate:25});
 const sound=audio?new m.AudioBufferSource({codec:mp4?'aac':'opus',quality:new m.Quality({bitrate:128e3})}):null;if(sound)output.addAudioTrack(sound);
 const duration=data.scenes.reduce((a,s)=>a+s.duration,0)+introSeconds(data.intro);const frames=Math.ceil(duration*25);
 const decoder=new VideoFrames(25,1920);
 try{await output.start();if(sound&&audio){await sound.add(audio);sound.close();}
 for(let f=0;f<frames;f++){if((globalThis as typeof globalThis & {__BTS_DESKTOP_ACTIVE__?:boolean}).__BTS_DESKTOP_ACTIVE__===false||performance.now()>=((globalThis as typeof globalThis & {__BTS_DESKTOP_DEADLINE__?:number}).__BTS_DESKTOP_DEADLINE__??Infinity))throw new Error('Bản quyền chưa hoạt động hoặc bộ chạy đã đóng.');if(signal.aborted)throw new Error('Đã dừng xuất video.');const request=frameRequest(data,f/25),videoFrames=await decoder.frames(request.pictures,request.scenes,request.time);drawFrame(canvas,f/25,{...data,videoFrames});await video.add(f/25,Math.min(1/25,duration-f/25));if(f%10===0){onProgress(f/frames);await new Promise(r=>setTimeout(r,0));}}
 video.close();await output.finalize();onProgress(1);return {blob:new Blob([target.buffer!],{type:mp4?'video/mp4':'video/webm'}),ext:mp4?'mp4':'webm'};
 }catch(e){await output.cancel().catch(()=>{});throw e;}finally{decoder.dispose();}
}
