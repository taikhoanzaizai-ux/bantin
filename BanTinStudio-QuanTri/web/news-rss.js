(() => {
  const make = (tag, text) => {
    const element = document.createElement(tag);
    if (text) element.textContent = text;
    return element;
  };
  const nav = make('button', 'Tin Nóng');
  nav.className = 'nav-item';
  const step = make('button');
  step.append(make('span', '1'), 'Tin Nóng');
  const panel = make('section');
  panel.className = 'editor-card';
  panel.hidden = true;
  const body = make('div');
  body.style.padding = '20px';
  const heading = make('h2', 'Tin Nóng');
  const filter = make('input');
  filter.type = 'search';
  filter.placeholder = 'Lọc theo tiêu đề hoặc nguồn';
  filter.setAttribute('aria-label', filter.placeholder);
  const refresh = make('button', 'Làm mới');
  refresh.className = 'side-action';
  const tools = make('div');
  tools.style.cssText = 'display:flex;gap:12px;align-items:center;margin:12px 0';
  tools.append(filter, refresh);
  const status = make('p');
  status.setAttribute('role', 'status');
  const list = make('div');
  body.append(heading, tools, status, list);
  panel.append(body);
  let active = false;
  let articles = [];
  let loaded = false;
  let opening = 0;
  const scriptTab = () => document.querySelectorAll('.sidebar nav button.nav-item')[1];
  function openScript(url) {
    const request = ++opening;
    const tab = scriptTab();
    if (!tab || tab.disabled) {
      status.textContent = 'Hãy chờ tác vụ hiện tại hoàn tất rồi thử lại.';
      return;
    }
    tab.click();
    function fill(attempt) {
      if (request !== opening) return;
      const input = document.getElementById('article-url');
      if (input && !input.disabled) {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, url);
        input.dispatchEvent(new Event('input', {bubbles:true}));
        input.focus();
        input.scrollIntoView({block:'nearest'});
      } else if (attempt < 25) {
        setTimeout(() => fill(attempt + 1), 80);
      }
    }
    fill(0);
  }
  function render() {
    const query = filter.value.trim().toLocaleLowerCase('vi');
    const items = articles.filter(row => (row.title + ' ' + row.source).toLocaleLowerCase('vi').includes(query));
    list.replaceChildren();
    if (!items.length) list.append(make('p', 'Chưa có bài phù hợp.'));
    for (const row of items) {
      const item = make('button');
      item.type = 'button';
      item.style.cssText = 'display:block;width:100%;text-align:left;padding:12px 0;border-bottom:1px solid #dce6e2';
      item.append(make('strong', row.title), make('br'), make('small', row.source + ' · Mở trong Kịch bản'));
      item.onclick = () => openScript(row.url);
      list.append(item);
    }
  }
  async function load(force = false) {
    if (refresh.disabled) return;
    refresh.disabled = true;
    status.textContent = 'Đang tải tin…';
    try {
      const response = await fetch('/_desktop/news-rss' + (force ? '?refresh=1' : ''), {cache:'no-store'});
      if (!response.ok) throw new Error('Không tải được bảng tin.');
      const result = await response.json();
      if (result.articles.length || !articles.length) articles = result.articles;
      loaded = true;
      status.textContent = articles.length + ' bài' + (result.failed.length ? ' · Nguồn chưa tải được: ' + result.failed.join(', ') : '');
      render();
    } catch (error) {
      status.textContent = error.message;
    } finally {
      refresh.disabled = false;
    }
  }
  function show(value) {
    active = value;
    panel.hidden = !value;
    const grid = document.querySelector('.work-grid');
    document.querySelector('.steps-bar')?.classList.toggle('news-active', value);
    document.querySelector('.sidebar nav')?.classList.toggle('news-active', value);
    if (grid) grid.style.display = value ? 'none' : '';
    nav.classList.toggle('active', value);
    step.classList.toggle('current', value);
    if (value && !loaded) load();
  }
  nav.onclick = step.onclick = () => show(true);
  refresh.onclick = () => load(true);
  filter.oninput = render;
  document.addEventListener('click', event => {
    const control = event.target.closest('.sidebar nav button, .steps-bar button');
    if (active && control && control !== nav && control !== step) show(false);
  });
  let mounted = false;
  function mount() {
    const sidebar = document.querySelector('.sidebar nav');
    const steps = document.querySelector('.steps-bar');
    const grid = document.querySelector('.work-grid');
    if (!sidebar || !steps || !grid) return;
    if (sidebar.firstElementChild !== nav) sidebar.prepend(nav);
    if (steps.firstElementChild !== step) steps.prepend(step);
    if (panel.nextElementSibling !== grid) grid.before(panel);
    Array.from(steps.children).slice(1).forEach((button, index) => {
      const label = button.firstElementChild;
      if (label && !label.querySelector('svg') && label.textContent !== String(index + 2))
        label.textContent = String(index + 2);
    });
    if (!mounted) { mounted = true; show(true); }
    const section = grid.querySelector('.section-number');
    const buttons = Array.from(sidebar.children).slice(1);
    const index = buttons.findIndex(button => button.classList.contains('active'));
    if (section && index >= 0 && section.textContent !== '0' + (index + 2))
      section.textContent = '0' + (index + 2);
  }
  new MutationObserver(mount).observe(document.getElementById('root'), {subtree:true,childList:true});
  mount();
})();
