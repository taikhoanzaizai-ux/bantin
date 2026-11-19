(() => {
 const buffers=new WeakMap();
 function region(value){
  if(!value||typeof value!=='object')return null;
  const number=(v,min,max,fallback)=>Number.isFinite(v)?Math.max(min,Math.min(max,v)):fallback;
  const x=number(value.x,0,99,25),y=number(value.y,0,99,25);
  const start=number(value.start,0,86400,0),end=number(value.end,start+.01,86401,1800);
  return {x,y,width:number(value.width,1,100-x,40),height:number(value.height,1,100-y,30),start,end,amount:number(value.amount,2,80,24)};
 }
 window.qbtBlurFrame=(picture,input,time)=>{
  const box=region(picture.blurRegion);
  if(!box||time<box.start||time>=box.end)return input;
  const w=input.videoWidth||input.naturalWidth||input.width,h=input.videoHeight||input.naturalHeight||input.height;
  if(!w||!h)return input;
  let canvas=buffers.get(picture);if(!canvas){canvas=document.createElement('canvas');buffers.set(picture,canvas);}
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  const c=canvas.getContext('2d');
  c.clearRect(0,0,w,h);c.drawImage(input,0,0,w,h);
  c.save();c.beginPath();c.rect(w*box.x/100,h*box.y/100,w*box.width/100,h*box.height/100);c.clip();
  c.filter='blur('+box.amount*w/1080+'px)';c.drawImage(input,0,0,w,h);c.restore();
  return canvas;
 };

 let active=false;
 window.addEventListener('qbt-edit-blur',event=>{
  if(active)return;active=true;
  const {picture,onApply}=event.detail;
  const isVideo=picture.kind==='video';
  let duration=Math.max(.1,Number(event.detail.duration)|| (isVideo?Math.max(.1,(picture.trimEnd||picture.videoDuration||10)-(picture.trimStart||0)):10));
  let box=region(picture.blurRegion)||{x:25,y:25,width:40,height:30,start:0,end:duration,amount:24};
  box.start=Math.min(box.start,duration-.05);box.end=Math.max(box.start+.05,Math.min(box.end,duration));
  let time=0,playing=false,last=0,frame,closed=false,seeking=false,anchor;
  const dialog=document.createElement('dialog');
  dialog.style.cssText='width:min(760px,92vw);max-height:90vh;overflow:auto;border:1px solid #aec8c1;border-radius:12px;padding:20px';
  dialog.setAttribute('aria-label','Làm mờ vùng tư liệu');
  const heading=document.createElement('h3');heading.textContent='Làm mờ vùng · '+picture.name;
  const note=document.createElement('p');note.textContent='Kéo khoanh vùng trên hình. Kéo hai mốc Bắt đầu / Kết thúc hoặc dừng hình rồi bấm Đặt mốc. Thời gian tính từ đầu mỗi cảnh.';
  const stage=document.createElement('div');stage.style.cssText='position:relative;line-height:0;touch-action:none;cursor:crosshair;max-width:560px;margin:auto';
  const canvas=document.createElement('canvas');canvas.style.cssText='width:100%;display:block';
  const media=document.createElement(isVideo?'video':'img');
  if(isVideo){media.preload='auto';media.muted=true;media.playsInline=true;}
  const selection=document.createElement('div');selection.style.cssText='position:absolute;border:2px solid #f6b948;pointer-events:none;box-sizing:border-box';
  stage.append(canvas,selection);
  const message=document.createElement('p');message.setAttribute('role','status');
  const clock=value=>value.toFixed(2)+' giây';
  const timeline=document.createElement('div');
  function range(label,max,value){
   const field=document.createElement('label');field.className='field-label';
   const text=document.createElement('span');const input=document.createElement('input');
   input.type='range';input.min=0;input.max=max;input.step=.01;input.value=value;input.setAttribute('aria-label',label);
   field.append(text,input);timeline.append(field);
   return {input,text,label};
  }
  const seek=range('Vị trí xem trước',duration,0),start=range('Bắt đầu làm mờ',duration-.01,box.start),end=range('Kết thúc làm mờ',duration,box.end),amount=range('Độ mờ',80,box.amount);
  end.input.min=.01;amount.input.min=2;amount.input.step=1;
  function button(label,action){const b=document.createElement('button');b.type='button';b.className='button';b.textContent=label;b.onclick=action;return b;}
  const play=button('Phát xem thử',()=>{if(time>=duration)time=0;playing=!playing;last=0;sync();});
  function sync(){
   seek.input.value=time;start.input.value=box.start;end.input.value=box.end;amount.input.value=box.amount;
   seek.text.textContent='Xem tại '+clock(time)+' / '+clock(duration)+(time>=box.start&&time<box.end?' · Đang làm mờ':'');
   start.text.textContent='Bắt đầu · '+clock(box.start);end.text.textContent='Kết thúc · '+clock(box.end);amount.text.textContent='Độ mờ · '+box.amount;
   play.textContent=playing?'Tạm dừng':'Phát xem thử';
   Object.assign(selection.style,{left:box.x+'%',top:box.y+'%',width:box.width+'%',height:box.height+'%'});
  }
  function chooseTime(value){playing=false;time=Math.max(0,Math.min(duration,value));last=0;sync();}
  seek.input.oninput=()=>chooseTime(Number(seek.input.value));
  start.input.oninput=()=>{box.start=Math.min(Number(start.input.value),box.end-.01);chooseTime(box.start);};
  end.input.oninput=()=>{box.end=Math.max(Number(end.input.value),box.start+.01);chooseTime(Math.max(box.start,box.end-.02));};
  amount.input.oninput=()=>{box.amount=Number(amount.input.value);sync();};
  const markStart=button('Đặt bắt đầu tại đây',()=>{box.start=Math.min(time,box.end-.01);sync();});
  const markEnd=button('Đặt kết thúc tại đây',()=>{box.end=Math.max(time,box.start+.01);sync();});
  stage.onpointerdown=e=>{
   e.preventDefault();playing=false;last=0;
   const r=stage.getBoundingClientRect();
   anchor={x:Math.max(0,Math.min(99,(e.clientX-r.left)/r.width*100)),y:Math.max(0,Math.min(99,(e.clientY-r.top)/r.height*100))};
   stage.setPointerCapture(e.pointerId);
  };
  stage.onpointermove=e=>{
   if(!anchor)return;
   const r=stage.getBoundingClientRect(),x=Math.max(0,Math.min(100,(e.clientX-r.left)/r.width*100)),y=Math.max(0,Math.min(100,(e.clientY-r.top)/r.height*100));
   box={...box,x:Math.min(anchor.x,x),y:Math.min(anchor.y,y),width:Math.max(1,Math.abs(x-anchor.x)),height:Math.max(1,Math.abs(y-anchor.y))};sync();
  };
  stage.onpointerup=()=>{anchor=null;box=region(box);sync();};stage.onpointercancel=()=>anchor=null;
  const previewPicture={...picture};
  function paint(){
   if(isVideo&&(media.readyState<2||media.seeking))return;
   const w=media.videoWidth||media.naturalWidth,h=media.videoHeight||media.naturalHeight;if(!w||!h)return;
   if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
   previewPicture.blurRegion=box;
   canvas.getContext('2d').drawImage(window.qbtBlurFrame(previewPicture,media,time),0,0,w,h);
  }
  function tick(now){
   if(closed)return;
   if(playing&&last)time=Math.min(duration,time+(now-last)/1000);
   last=now;if(time>=duration)playing=false;
   if(isVideo&&media.readyState>=1&&!seeking){
    const from=Math.max(0,picture.trimStart||0),to=Math.min(media.duration,picture.trimEnd||media.duration),length=Math.max(.01,to-from);
    const target=Math.min(media.duration-.001,from+(picture.playback==='hold'?Math.min(time,length-.001):time%length));
    if(Math.abs(media.currentTime-target)>.025){seeking=true;media.currentTime=target;}
   }
   paint();sync();frame=requestAnimationFrame(tick);
  }
  media.onseeked=()=>{seeking=false;paint();};media.onerror=()=>{playing=false;message.textContent='Không đọc được tư liệu để xem thử.';};
  media.src=picture.url;
  const apply=button('Áp dụng vùng làm mờ',()=>{onApply(region(box));dialog.close();});
  dialog.append(heading,note,stage,play,markStart,markEnd,timeline,message,apply,button('Xóa vùng làm mờ',()=>{onApply(undefined);dialog.close();}),button('Đóng',()=>dialog.close()));
  dialog.onclose=()=>{closed=true;cancelAnimationFrame(frame);if(isVideo){media.pause();media.removeAttribute('src');media.load();}dialog.remove();active=false;};
  document.body.append(dialog);sync();dialog.showModal();frame=requestAnimationFrame(tick);
 });
})();
