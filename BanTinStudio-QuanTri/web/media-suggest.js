(() => {
  const make = (tag, label) => {
    const el = document.createElement(tag);
    if (label) el.textContent = label;
    return el;
  };
  const trigger = make('button', 'Tìm tư liệu theo cảnh');
  trigger.type = 'button';
  trigger.className = 'button';
  trigger.style.margin = '8px 0';
  const dialog = make('dialog');
  dialog.style.cssText = 'width:min(940px,92vw);max-height:86vh;overflow:auto;padding:22px;border:1px solid #cedbd6;border-radius:14px;background:white;color:#172622';
  dialog.setAttribute('aria-label','Tìm tư liệu theo cảnh');
  const title = make('h2','Tìm tư liệu theo cảnh');
  const close = make('button','Đóng');
  close.className = 'button';
  close.onclick = () => dialog.close();
  const scene = make('select');
  scene.setAttribute('aria-label','Chọn cảnh');
  const excerpt = make('p');
  const keyword = make('input');
  keyword.type = 'search';
  keyword.maxLength = 180;
  keyword.placeholder = 'Tên người, đội, địa điểm hoặc sự kiện';
  keyword.setAttribute('aria-label','Từ khóa tư liệu');
  keyword.style.cssText = 'flex:1;min-width:160px';
  const kind = make('select');
  kind.setAttribute('aria-label','Loại tư liệu');
  for (const [value,label] of [['image','Ảnh'],['video','Video']]) {
    const option = make('option',label);
    option.value = value;
    kind.append(option);
  }
  const search = make('button','Tìm trên Wikimedia Commons');
  search.className = 'button primary';
  const tools = make('div');
  tools.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin:12px 0';
  tools.append(keyword,kind,search);
  const status = make('p');
  status.setAttribute('role','status');
  const results = make('div');
  results.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px';
  dialog.append(title,close,scene,excerpt,tools,status,results);
  document.body.append(dialog);
  let parts = [], headline = '';
  function selectScene() {
    const text = parts[Number(scene.value)] || '';
    excerpt.textContent = text || 'Bạn có thể nhập từ khóa để tìm trực tiếp.';
    keyword.value = (text || headline).replace(/[^\p{L}\p{N}\s-]/gu,' ').trim().split(/\s+/).slice(0,7).join(' ');
  }
  scene.onchange = selectScene;
  trigger.onclick = () => {
    let draft = {};
    try { draft = JSON.parse(localStorage.getItem('news-draft') || '{}') || {}; } catch {}
    headline = typeof draft.title === 'string' ? draft.title : '';
    const script = typeof draft.script === 'string' ? draft.script : '';
    parts = script.trim().split(/\n+|(?<=[.!?])\s+/).map(text=>text.trim()).filter(Boolean);
    scene.replaceChildren(...(parts.length ? parts : ['']).map((text,i)=>{
      const option = make('option', text ? 'Đoạn '+(i+1)+' · '+text.slice(0,55) : 'Tìm theo từ khóa');
      option.value = String(i);
      return option;
    }));
    selectScene();
    results.replaceChildren();
    status.textContent = 'Kiểm tra chú thích và giấy phép trước khi chèn. Kết quả là tư liệu gợi ý.';
    dialog.showModal();
  };
  async function insert(item, button) {
    const input = document.querySelector('input[type="file"][multiple][accept^="image/jpeg"]');
    if (!input || document.querySelector('.editor-content')?.disabled) {
      status.textContent = 'Hãy mở Ảnh & video và chờ tác vụ hiện tại hoàn tất.';
      return;
    }
    button.disabled = true;
    try {
      const response = await fetch('/_desktop/media-suggest/file?' + new URLSearchParams({url:item.url}));
      if (!response.ok) throw new Error((await response.json()).message);
      const blob = await response.blob();
      if (!dialog.open || document.querySelector('.editor-content')?.disabled) throw new Error('Hãy thử chèn lại khi phần mềm sẵn sàng.');
      const transfer = new DataTransfer();
      transfer.items.add(new File([blob],item.title,{type:blob.type}));
      input.files = transfer.files;
      input.dispatchEvent(new Event('change',{bubbles:true}));
      dialog.close();
    } catch (error) {
      status.textContent = error.message;
    } finally { button.disabled = false; }
  }
  async function find() {
    if (!keyword.value.trim() || search.disabled) return;
    search.disabled = true;
    results.replaceChildren();
    status.textContent = 'Đang tìm tư liệu…';
    try {
      const response = await fetch('/_desktop/media-suggest?' + new URLSearchParams({q:keyword.value.trim(),kind:kind.value}));
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message);
      status.textContent = payload.length ? payload.length+' tư liệu gợi ý. Đối chiếu trang nguồn trước khi dùng.' : 'Chưa thấy kết quả phù hợp. Thử tên riêng hoặc từ khóa ngắn hơn.';
      for (const item of payload) {
        const card = make('section');
        card.style.cssText = 'border:1px solid #dce6e2;border-radius:9px;padding:10px;overflow-wrap:anywhere';
        const preview = make(item.mime.startsWith('video/') ? 'video' : 'img');
        preview.style.cssText = 'width:100%;height:125px;object-fit:contain;background:#f0f5f3';
        if (preview.tagName === 'VIDEO') { preview.controls = true; preview.preload = 'none'; preview.src = item.url; if(item.thumb)preview.poster = item.thumb; }
        else { preview.loading = 'lazy'; preview.alt = item.title; preview.src = item.thumb || item.url; }
        const source = make('a','Xem nguồn và giấy phép');
        source.href = item.page; source.target = '_blank'; source.rel = 'noopener noreferrer';
        const add = make('button','Chèn vào Ảnh & video');
        add.className = 'button';
        add.disabled = !item.license || item.size > (item.mime.startsWith('image/') ? 15000000 : 30000000);
        add.onclick = () => insert(item,add);
        card.append(preview,make('strong',item.title),make('p',item.license || 'Chưa rõ giấy phép'),source,make('br'),add);
        results.append(card);
      }
    } catch (error) { status.textContent = error.message; }
    finally { search.disabled = false; }
  }
  search.onclick = find;
  keyword.onkeydown = event => { if (event.key === 'Enter') {event.preventDefault();find();} };
  function mount() {
    const drop = document.querySelector('.editor-content .dropzone');
    if (drop && drop.nextElementSibling !== trigger) drop.after(trigger);
  }
  new MutationObserver(mount).observe(document.getElementById('root'),{childList:true,subtree:true});
  mount();
})();
