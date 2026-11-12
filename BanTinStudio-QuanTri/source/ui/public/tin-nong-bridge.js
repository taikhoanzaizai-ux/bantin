(() => {
  const seen = new Set();
  let pending;
  const button = document.createElement('button');
  button.disabled = true;
  button.type = 'button';
  button.textContent = 'Tin Nóng: Đang chờ kịch bản';
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
    button.disabled = true;
    button.textContent = 'Tin Nóng: Đang chờ kịch bản';
    button.textContent = 'Tin Nóng: Đang chờ kịch bản';
  };
  async function check() {
    try {
      const response = await fetch('/_desktop/tin-nong', {cache:'no-store'});
      if (!response.ok) return;
      const entry = await response.json();
      if (!entry?.id || seen.has(entry.id)) return;
      if (entry.url) {
        if (sessionStorage.getItem('tin-nong-link-v1') === entry.id) return;
        const input = document.getElementById('article-url');
        if (!input) {
          const tab = Array.from(document.querySelectorAll('button.nav-item'))
            .find(item => item.textContent.trim().startsWith('Kịch bản'));
          if (tab && !tab.disabled) tab.click();
          return;
        }
        if (input.disabled) return;
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, entry.url);
        input.dispatchEvent(new Event('input', {bubbles:true}));
        sessionStorage.setItem('tin-nong-link-v1', entry.id);
        seen.add(entry.id);
        button.textContent = 'Đã điền link từ Tin Nóng';
        button.disabled = true;
        return;
      }
      pending = entry;
      button.disabled = false;
      button.textContent = 'Mở kịch bản từ Tin Nóng';
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
      } else if (confirm('Có bản mới: ' + info.latest + '. Hãy lưu công việc trước. Tải, cài và khởi động lại ngay?')) {
        update.textContent = 'Đang tải bản cập nhật…';
        const session = await fetch('/_desktop/status', {cache:'no-store'});
        const status = await session.json();
        if (!session.ok || !status.csrf) throw new Error('Hãy mở lại Quân Bản Tin rồi thử cập nhật.');
        const response = await fetch('/_desktop/github-update/install', {
          method:'POST', headers:{'X-Studio-CSRF':status.csrf},
        });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.message || 'Không cài được bản cập nhật.');
        update.textContent = 'Đang khởi động lại…';
        window.close();
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
