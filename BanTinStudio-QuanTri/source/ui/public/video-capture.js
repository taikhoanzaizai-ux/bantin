(() => {
 let active;
 window.addEventListener('qbt-capture-video', event => {
  if(active)return;
  const source=event.detail;
  const dialog=document.createElement('dialog');
  active=dialog;
  dialog.style.cssText='width:min(720px,92vw);padding:20px;border:1px solid #b9d4cd;border-radius:14px';
  dialog.setAttribute('aria-label','Chụp ảnh từ video');
  const title=document.createElement('h3');title.textContent='Chụp ảnh từ video · '+source.name;
  const video=document.createElement('video');
  video.src=source.url;video.controls=true;video.preload='auto';video.playsInline=true;
  video.style.cssText='width:100%;max-height:55vh;background:#111';
  const capture=document.createElement('button');capture.textContent='Chụp và thêm vào Ảnh & video';capture.className='button primary';capture.disabled=true;
  const close=document.createElement('button');close.textContent='Đóng';close.className='button';
  const message=document.createElement('p');message.setAttribute('role','status');
  let saving=false;
  function ready(){capture.disabled=saving||video.readyState<2||video.seeking;}
  video.addEventListener('loadeddata',ready);
  video.addEventListener('seeking',()=>capture.disabled=true);
  video.addEventListener('seeked',ready);
  video.addEventListener('error',()=>{message.textContent='Không đọc được video. Hãy thử MP4 hoặc WebM.';capture.disabled=true;});
  capture.onclick=async()=>{
   if(saving)return;
   video.pause();saving=true;ready();
   try{
    const input=document.querySelector('input[type="file"][multiple][accept^="image/jpeg"]');
    if(!input||input.disabled||input.closest('fieldset')?.disabled)throw Error('Hãy chờ thao tác hiện tại hoàn tất rồi chụp lại.');
    const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;
    const context=canvas.getContext('2d');if(!context||!canvas.width)throw Error('Khung hình chưa sẵn sàng.');
    context.drawImage(video,0,0);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.95));
    if(!blob)throw Error('Không tạo được ảnh từ khung hình.');
    const transfer=new DataTransfer();
    const name=source.name.replace(/\.[^.]+$/,'')+' - '+video.currentTime.toFixed(2)+'s.jpg';
    transfer.items.add(new File([blob],name,{type:'image/jpeg'}));
    input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
    message.textContent='Đã gửi ảnh '+name+' vào danh sách tư liệu.';
   }catch(error){message.textContent=error.message;}
   finally{saving=false;ready();}
  };
  close.onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{video.pause();video.removeAttribute('src');video.load();dialog.remove();active=null;},{once:true});
  dialog.append(title,video,message,capture,close);document.body.append(dialog);dialog.showModal();
 });
})();
