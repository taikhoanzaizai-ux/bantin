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
  const update = document.createElement('button');
  update.type = 'button';
  update.textContent = 'Kiểm tra cập nhật';
  update.style.cssText = 'position:fixed;right:20px;bottom:66px;z-index:1000;padding:9px 13px;border:1px solid #17654f;border-radius:8px;background:white;color:#17654f;cursor:pointer';
  document.body.append(update);
  update.onclick = async () => {
    update.disabled = true;
    update.textContent = 'Đang kiểm tra…';
    try {
      const response = await fetch('/_desktop/github-update', {cache:'no-store'});
      const info = await response.json();
      if (!response.ok) throw new Error(info.message || 'Không kiểm tra được phiên bản.');
      if (!info.available) {
        alert('Bạn đang dùng bản mới nhất: ' + info.current);
      } else if (confirm('Có bản mới: ' + info.latest + '. Tải ZIP từ GitHub?')) {
        window.open('https://github.com/taikhoanzaizai-ux/bantin/archive/refs/heads/main.zip', '_blank', 'noopener');
      }
    } catch (error) {
      alert(error.message);
    } finally {
      update.disabled = false;
      update.textContent = 'Kiểm tra cập nhật';
    }
  };
  check();
})();
