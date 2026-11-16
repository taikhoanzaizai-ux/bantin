(() => {
  const pending = [];
  const discarded = new Set();
  let current;
  const panel = document.createElement('details');
  panel.style.cssText = 'position:fixed;right:20px;top:44px;z-index:1000;width:min(360px,90vw);max-height:65vh;overflow:auto;padding:12px;background:white;color:#173b33;border:1px solid #aac3bc;border-radius:10px;box-shadow:0 4px 18px #0002';
  const summary = document.createElement('summary');
  const list = document.createElement('div');
  const status = document.createElement('p');
  status.setAttribute('role','status');
  panel.append(summary,status,list);
  document.body.append(panel);
  let completed = 0;
  function refresh() {
    panel.hidden = !current && !pending.length && !list.childElementCount;
    summary.textContent = 'Video đã dựng ('+completed+')'+(current?' · Đang dựng':'')+(pending.length?' · Chờ '+pending.length:'');
    panel.dataset.renderPending = current || pending.length ? 'true' : 'false';
  }
  function note(text) { status.textContent = text; summary.title = text; }
  async function drain() {
    if(current)return;
    while(pending.length) {
      current = pending.shift();
      refresh();
      try {
        await current.run(note, (name,save,url)=>{
          const row = document.createElement('p');
          const button = document.createElement('button');
          const remove = document.createElement('button');
          button.textContent = 'Lưu video';
          button.className = 'button';
          button.onclick = save;
          remove.textContent = 'Bỏ';
          remove.className = 'button';
          remove.onclick = ()=>{ URL.revokeObjectURL(url); row.remove(); completed--; refresh(); };
          row.append(name,document.createElement('br'),button,remove);
          list.append(row);
          completed++;
          note('Đã dựng xong '+name);
          refresh();
        },current.controller.signal);
      } catch(error) {
        const failure=document.createElement('p');
        failure.textContent=error.message;
        failure.title='Bấm để đóng thông báo';
        failure.onclick=()=>{failure.remove();refresh();};
        list.append(failure);
        note(error.message);
        panel.open=true;
      }
      current = null;
    }
    for(const url of discarded) URL.revokeObjectURL(url);
    discarded.clear();
    refresh();
  }
  window.qbtVideoQueue = {
    active:()=>Boolean(current||pending.length),
    hasResults:()=>completed>0,
    discard(url) { if(this.active())discarded.add(url); else URL.revokeObjectURL(url); },
    add(run) { pending.push({run,controller:new AbortController()}); panel.open=true; void drain(); }
  };
  window.addEventListener('beforeunload', event=>{
    if(window.qbtVideoQueue.active()){event.preventDefault();event.returnValue='';}
  });
  window.addEventListener('studio-license-expired',()=>{pending.length=0;current?.controller.abort();});
  refresh();
})();
