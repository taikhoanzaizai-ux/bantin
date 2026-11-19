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
  let box=region(picture.blurRegion)||{x:25,y:25,width:40,height:30,start:0,end:1800,amount:24};
  const dialog=document.createElement('dialog');
  dialog.style.cssText='width:min(760px,92vw);border:1px solid #aec8c1;border-radius:12px;padding:20px';
  dialog.setAttribute('aria-label','Làm mờ vùng tư liệu');
  const heading=document.createElement('h3');heading.textContent='Làm mờ vùng · '+picture.name;
  const note=document.createElement('p');note.textContent='Kéo trên ảnh để khoanh vùng. Thời gian tính từ đầu mỗi cảnh dùng tư liệu này.';
  const stage=document.createElement('div');stage.style.cssText='position:relative;line-height:0;touch-action:none;cursor:crosshair';
  const media=document.createElement(picture.kind==='video'?'video':'img');
  media.src=picture.url;media.style.cssText='width:100%;max-height:48vh;object-fit:contain';
  // Keep the stage at the source aspect ratio so pointer coordinates match the frame.
  media.style.maxHeight='none';stage.style.maxWidth='560px';stage.style.margin='auto';
  const selection=document.createElement('div');selection.style.cssText='position:absolute;border:2px solid #f6b948;background:#f6b94833;pointer-events:none;box-sizing:border-box';
  function draw(){Object.assign(selection.style,{left:box.x+'%',top:box.y+'%',width:box.width+'%',height:box.height+'%'});}
  stage.append(media,selection);
  let anchor;
  stage.onpointerdown=e=>{e.preventDefault();const r=stage.getBoundingClientRect();anchor={x:Math.max(0,Math.min(99,(e.clientX-r.left)/r.width*100)),y:Math.max(0,Math.min(99,(e.clientY-r.top)/r.height*100))};stage.setPointerCapture(e.pointerId);};
  stage.onpointermove=e=>{if(!anchor)return;const r=stage.getBoundingClientRect(),x=Math.max(0,Math.min(100,(e.clientX-r.left)/r.width*100)),y=Math.max(0,Math.min(100,(e.clientY-r.top)/r.height*100));box={...box,x:Math.min(anchor.x,x),y:Math.min(anchor.y,y),width:Math.max(1,Math.abs(x-anchor.x)),height:Math.max(1,Math.abs(y-anchor.y))};draw();};
  stage.onpointerup=()=>{anchor=null;box=region(box);draw();};
  stage.onpointercancel=()=>anchor=null;
  const fields=document.createElement('div');
  const entries={};
  for(const [key,label,min,max,step] of [['start','Bắt đầu (giây)',0,86400,.1],['end','Kết thúc (giây)',.1,86401,.1],['amount','Độ mờ',2,80,1]]){
   const field=document.createElement('label');field.className='field-label';field.textContent=label;
   const input=document.createElement('input');input.type='number';input.min=min;input.max=max;input.step=step;input.value=box[key];entries[key]=input;field.append(input);fields.append(field);
  }
  const status=document.createElement('p');status.setAttribute('role','status');
  function button(label,action){const b=document.createElement('button');b.type='button';b.className='button';b.textContent=label;b.onclick=action;return b;}
  const apply=button('Áp dụng vùng làm mờ',()=>{
   const start=Number(entries.start.value),end=Number(entries.end.value),amount=Number(entries.amount.value);
   if(![start,end,amount].every(Number.isFinite)||!entries.start.value||!entries.end.value||!entries.amount.value||start<0||start>86400||end>86401||end<=start||amount<2||amount>80){status.textContent='Nhập thời gian kết thúc lớn hơn bắt đầu và độ mờ từ 2 đến 80.';return;}
   onApply(region({...box,start,end,amount}));dialog.close();
  });
  dialog.append(heading,note,stage);
  if(picture.kind==='video'){
   const seek=document.createElement('input');seek.type='range';seek.min=0;seek.max=picture.videoDuration||1;seek.step=.05;seek.value=0;seek.setAttribute('aria-label','Chọn khung hình để khoanh vùng');
   media.onloadedmetadata=()=>seek.max=media.duration;
   seek.oninput=()=>media.currentTime=Number(seek.value);
   dialog.append(seek);
  }
  dialog.append(fields,status,apply,button('Xóa vùng làm mờ',()=>{onApply(undefined);dialog.close();}),button('Đóng',()=>dialog.close()));
  dialog.onclose=()=>{if(picture.kind==='video'){media.pause();media.removeAttribute('src');media.load();}dialog.remove();active=false;};
  document.body.append(dialog);draw();dialog.showModal();
 });
})();
