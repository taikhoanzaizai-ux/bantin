(() => {
  const make = (tag, label) => {
    const el = document.createElement(tag);
    if (label) el.textContent = label;
    return el;
  };
  const trigger = make('button', 'Tìm ảnh cho bài viết');
  trigger.type = 'button';
  trigger.className = 'button';
  trigger.style.margin = '8px 0';
  const dialog = make('dialog');
  dialog.style.cssText = 'width:min(940px,92vw);max-height:86vh;overflow:auto;padding:22px;border:1px solid #cedbd6;border-radius:14px;background:white;color:#172622';
  dialog.setAttribute('aria-label','Tìm ảnh cho bài viết');
  const title = make('h2','Tìm ảnh cho bài viết');
  const close = make('button','Đóng');
  close.className = 'button';
  close.onclick = () => dialog.close();
  const keyword = make('input');
  keyword.type = 'search';
  keyword.maxLength = 180;
  keyword.placeholder = 'Tên người, đội, địa điểm hoặc sự kiện';
  keyword.setAttribute('aria-label','Từ khóa tư liệu');
  keyword.style.cssText = 'flex:1;min-width:160px';
  const search = make('button','Tìm trên Wikimedia Commons');
  search.className = 'button primary';
  const tools = make('div');
  tools.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin:12px 0';
  const google = make('button','Google Hình ảnh');
  google.type = 'button';
  google.className = 'button';
  const key = make('input');
  key.type = 'password';
  key.maxLength = 256;
  key.placeholder = 'Khóa API Serper';
  key.setAttribute('aria-label',key.placeholder);
  key.autocomplete = 'off';
  const addSelected = make('button','Chèn ảnh đã chọn (0)');
  addSelected.type = 'button';
  addSelected.className = 'button primary';
  const selected = new Set();
  function updateSelection() {
    addSelected.disabled = !selected.size;
    addSelected.textContent = 'Chèn ảnh đã chọn (' + selected.size + ')';
  }
  updateSelection();
  google.onclick = () => find('google');
  addSelected.onclick = insert;
  tools.append(keyword,search,google,key,addSelected);
  const status = make('p');
  status.setAttribute('role','status');
  const results = make('div');
  results.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px';
  dialog.append(title,close,tools,status,results);
  document.body.append(dialog);
  trigger.onclick = () => {
    let draft = {};
    try { draft = JSON.parse(localStorage.getItem('news-draft') || '{}') || {}; } catch {}
    const headline = typeof draft.title === 'string' ? draft.title.trim() : '';
    const script = typeof draft.script === 'string' ? draft.script.trim() : '';
    const firstLine = script.split(/\n|(?<=[.!?])\s+/)[0] || '';
    keyword.value = (headline || firstLine).slice(0,180);
    results.replaceChildren();
    selected.clear();
    updateSelection();
    status.textContent = 'Tìm ảnh theo từ khóa chung cho cả bài. Google Hình ảnh cần khóa API Serper.';
    dialog.showModal();
  };
  async function insert() {
    const input = document.querySelector('input[type="file"][multiple][accept^="image/jpeg"]');
    if (!input || document.querySelector('.editor-content')?.disabled || !selected.size) return;
    const items = [...selected];
    const transfer = new DataTransfer();
    const failed = [];
    addSelected.disabled = true;
    search.disabled = google.disabled = true;
    try {
      for (const item of items) {
        if (!dialog.open) return;
        status.textContent = 'Đang tải ảnh ' + (transfer.items.length + failed.length + 1) + '/' + items.length + '…';
        try {
          const query = new URLSearchParams({url:item.url,provider:item.provider});
          const response = await fetch('/_desktop/media-suggest/file?' + query);
          if (!response.ok) throw new Error((await response.json()).message);
          const blob = await response.blob();
          const suffix = {'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp'}[blob.type] || '';
          transfer.items.add(new File([blob],item.title.slice(0,150)+suffix,{type:blob.type}));
        } catch (error) { failed.push(item.title + ': ' + error.message); }
      }
      if (!dialog.open || !input.isConnected || document.querySelector('.editor-content')?.disabled) return;
      if (transfer.items.length) {
        input.files = transfer.files;
        input.dispatchEvent(new Event('change',{bubbles:true}));
      }
      if (failed.length) status.textContent = 'Đã chuyển ' + transfer.items.length + ' ảnh. Lỗi: ' + failed.join(' · ');
      else dialog.close();
    } finally {
      selected.clear();
      results.querySelectorAll('input[type=checkbox]').forEach(box => {box.checked = false;});
      search.disabled = google.disabled = false;
      updateSelection();
    }
  }
  async function find(provider = 'commons') {
    if (!keyword.value.trim() || search.disabled) return;
    if (provider === 'google' && !key.value.trim()) {
      status.textContent = 'Nhập khóa API Serper để tìm Google Hình ảnh.';
      key.focus();
      return;
    }
    search.disabled = google.disabled = true;
    results.replaceChildren();
    selected.clear();
    updateSelection();
    status.textContent = 'Đang tìm ảnh…';
    try {
      let response;
      if (provider === 'google') {
        const session = await fetch('/_desktop/status', {cache:'no-store'});
        const info = await session.json();
        if (!session.ok || !info.csrf) throw new Error('Hãy mở lại Quân Bản Tin.');
        response = await fetch('/_desktop/media-suggest/google',{
          method:'POST',headers:{'Content-Type':'application/json','X-Studio-CSRF':info.csrf},
          body:JSON.stringify({q:keyword.value.trim(),key:key.value.trim()})
        });
      } else {
        response = await fetch('/_desktop/media-suggest?' + new URLSearchParams({q:keyword.value.trim(),kind:'image'}));
      }
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message);
      status.textContent = payload.length ? payload.length+' ảnh. Tích chọn ảnh rồi bấm Chèn ảnh đã chọn.' : 'Chưa thấy ảnh phù hợp. Thử tên riêng hoặc từ khóa ngắn hơn.';
      for (const item of payload) {
        item.provider = provider;
        const card = make('section');
        card.style.cssText = 'border:1px solid #dce6e2;border-radius:9px;padding:10px;overflow-wrap:anywhere';
        const preview = make('img');
        preview.style.cssText = 'width:100%;height:125px;object-fit:contain;background:#f0f5f3';
        preview.loading = 'lazy';
        preview.alt = item.title;
        preview.referrerPolicy = 'no-referrer';
        if (provider === 'commons') preview.src = item.thumb || item.url;
        else if (item.thumb && /^https:\/\/[^/]+\.gstatic\.com\//i.test(item.thumb)) preview.src = item.thumb;
        const source = make('a','Xem trang nguồn');
        source.href = item.page; source.target = '_blank'; source.rel = 'noopener noreferrer';
        const label = make('label');
        const box = make('input');
        box.type = 'checkbox';
        box.disabled = item.size > 15000000 || (provider === 'commons' && !item.license);
        box.onchange = () => {
          if (box.checked) selected.add(item);
          else selected.delete(item);
          updateSelection();
        };
        label.append(box,' Chọn ảnh');
        card.append(preview,make('strong',item.title),make('p',item.license || 'Kiểm tra quyền sử dụng tại nguồn'),source,make('br'),label);
        results.append(card);
      }
    } catch (error) { status.textContent = error.message; }
    finally { search.disabled = google.disabled = false; }
  }
  search.onclick = () => find('commons');
  keyword.onkeydown = event => { if (event.key === 'Enter') {event.preventDefault();find();} };
  function mount() {
    const drop = document.querySelector('.editor-content .dropzone');
    if (drop && drop.nextElementSibling !== trigger) drop.after(trigger);
  }
  new MutationObserver(mount).observe(document.getElementById('root'),{childList:true,subtree:true});
  mount();
})();
