(() => {
  const seen = new Set();
  let pending;
  const button = document.createElement('button');
  button.hidden = true;
  button.type = 'button';
  button.textContent = 'Mở kịch bản từ Tin Nóng';
  button.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:1000;padding:12px 16px;border:0;border-radius:8px;background:#17654f;color:white;cursor:pointer';
  document.body.append(button);
  button.onclick = () => {
    const input = document.querySelector('input[type="file"][accept=".json,application/json"]');
    if (!input || !pending) return;
    if (!confirm('Mở kịch bản Tin Nóng? Hãy lưu dự án đang làm trước khi mở.')) return;
    const {id, project} = pending;
    const transfer = new DataTransfer();
    transfer.items.add(new File([JSON.stringify(project)], 'Tin-Nong.json', {type:'application/json'}));
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', {bubbles:true}));
    seen.add(id);
    pending = undefined;
    button.hidden = true;
  };
  async function check() {
    try {
      const response = await fetch('/_desktop/tin-nong', {cache:'no-store'});
      if (!response.ok) return;
      const entry = await response.json();
      if (!entry?.id || seen.has(entry.id)) return;
      pending = entry;
      button.hidden = false;
    } catch {} finally {
      setTimeout(check, 2500);
    }
  }
  check();
})();
