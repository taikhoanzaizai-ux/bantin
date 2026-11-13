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
  const country = make('select');
  const topic = make('select');
  for (const [select, label, values] of [
    [country, 'Quốc gia', ['Việt Nam','Mỹ','Hàn Quốc','Nhật Bản']],
    [topic, 'Chuyên mục', ['Tất cả','Thời sự','Đời sống','Pháp luật','Thể thao','Giải trí','Tin chung']]
  ]) {
    select.setAttribute('aria-label', label);
    for (const value of values) select.append(make('option', value));
  }
  const auto = make('input');
  auto.type = 'checkbox';
  auto.checked = true;
  const autoLabel = make('label');
  autoLabel.append(auto, ' Tự quét mỗi 15 phút');
  tools.style.flexWrap = 'wrap';
  tools.replaceChildren(refresh, autoLabel, country, topic, filter);
  refresh.textContent = 'Quét ngay';
  const social = make('div');
  social.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin:8px 0';
  const regions = {
    'Việt Nam': ['VN','vi','tin nóng','Việt Nam'],
    'Mỹ': ['US','en','breaking news','United States'],
    'Hàn Quốc': ['KR','ko','최신 뉴스','한국'],
    'Nhật Bản': ['JP','ja','最新ニュース','日本'],
  };
  for (const [label, url, prefix] of [
    ['Facebook công khai','https://www.google.com/search?tbs=qdr:w&q=','site:facebook.com '],
    ['YouTube','https://www.youtube.com/results?search_query=',''],
    ['TikTok','https://www.tiktok.com/search?q=',''],
    ['TikTok thịnh hành','https://ads.tiktok.com/creative/creativeCenter/trends?region=VN',null],
    ['Theanh28 · Mạng xã hội','https://linktr.ee/theanh28multichannels',null],
  ]) {
    const action = make('button', label);
    action.className = 'side-action';
    action.onclick = () => {
      const [region, language, defaultQuery, location] = regions[country.value] || regions['Việt Nam'];
      const query = filter.value.trim() || defaultQuery;
      const target = new URL(url);
      if (label === 'Facebook công khai') {
        target.searchParams.set('q', prefix + query + ' ' + location);
        target.searchParams.set('gl', region);
        target.searchParams.set('hl', language);
      } else if (label === 'YouTube') {
        target.searchParams.set('search_query', query + ' ' + location);
        target.searchParams.set('gl', region);
        target.searchParams.set('hl', language);
      } else if (label === 'TikTok') {
        target.searchParams.set('q', query + ' ' + location);
        target.searchParams.set('lang', language);
      } else if (label === 'TikTok thịnh hành') {
        target.searchParams.set('region', region);
      }
      window.open(target.href, '_blank', 'noopener');
    };
    social.append(action);
  }
  const trend = make('button', 'Tìm kiếm thịnh hành');
  trend.className = 'side-action';
  social.append(trend);
  let trendMode = false;
  trend.onclick = () => { trendMode = !trendMode; trend.textContent = trendMode ? 'Về bảng tin' : 'Tìm kiếm thịnh hành'; load(); };
  const sources = make('select');
  sources.setAttribute('aria-label','Chọn bài theo nguồn');
  const original = make('button', 'Mở bài gốc');
  original.className = 'side-action';
  original.onclick = () => { if (selected) window.open(selected.url,'_blank','noopener'); };
  const footer = make('div');
  footer.style.cssText = 'display:flex;gap:8px;margin-top:10px';
  sources.style.flex = '1';
  footer.append(sources, original);
  let selected;
  let chosen = [];
  sources.onchange = () => { selected = chosen[sources.selectedIndex]; };
  function choose(items) {
    chosen = items;
    sources.replaceChildren(...items.map(item => make('option', item.source + ' | ' + item.title)));
    selected = items[0];
    original.disabled = !selected;
  }

  const status = make('p');
  status.setAttribute('role', 'status');
  const list = make('div');
  body.append(heading, tools, social, list, footer, status);
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
    const table = make('table');
    table.style.cssText = 'width:100%;border-collapse:collapse;text-align:left';
    const head = make('thead');
    const labels = make('tr');
    for (const label of (trendMode ? ['Lượt tìm', 'Từ khóa', 'Bài liên quan'] : ['Điểm','Giờ đăng','Số báo','Tiêu đề'])) {
      const cell = make('th',label);
      cell.style.padding = '8px';
      labels.append(cell);
    }
    head.append(labels);
    table.append(head);
    const rows = make('tbody');
    const format = new Intl.DateTimeFormat('vi-VN',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Ho_Chi_Minh'});
    const entries = trendMode ? articles.map(([,traffic,keyword,related]) => ({
      values:[traffic || '—',keyword], title:related[0]?.[0] || keyword,
      items:related.map(([title,url]) => ({title,url,source:'Google Trends'}))
    })) : articles.flatMap(group => {
      const match = group.items.find(item => (topic.value === 'Tất cả' || item.topic === topic.value) &&
        (item.title+' '+item.source).toLocaleLowerCase('vi').includes(query));
      return match ? [{values:[group.score,format.format(match.stamp*1000),group.sources],title:match.title,
        items:[match,...group.items.filter(item=>item!==match)]}] : [];
    });
    choose(entries[0]?.items || []);
    for (const entry of entries) {
      const row = make('tr');
      row.style.background = rows.children.length % 2 ? '#eaf1fb' : '#f8fafc';
      for (const value of entry.values) {
        const cell = make('td', String(value));
        cell.style.cssText = 'padding:8px;white-space:nowrap';
        row.append(cell);
      }
      const cell = make('td');
      const button = make('button', entry.title);
      button.style.cssText = 'text-align:left;width:100%;padding:8px';
      button.disabled = !entry.items.length;
      row.onpointerenter = () => { if (chosen !== entry.items) choose(entry.items); };
      button.onfocus = () => choose(entry.items);
      button.onclick = () => openScript(entry.items[0].url);
      cell.append(button);
      row.append(cell);
      rows.append(row);
    }
    table.append(rows);
    list.replaceChildren(entries.length ? table : make('p','Chưa có bài phù hợp.'));
  }
  let generation = 0;
  async function load(force = false) {
    const ticket = ++generation;
    refresh.disabled = true;
    status.textContent = 'Đang tải…';
    try {
      const params = new URLSearchParams({country:country.value,refresh:force?'1':'0',trends:trendMode?'1':'0'});
      const response = await fetch('/_desktop/news-rss?' + params, {cache:'no-store'});
      if (!response.ok) throw new Error('Không tải được bảng tin.');
      const result = await response.json();
      if (ticket !== generation) return;
      articles = trendMode ? result.trends : result.groups;
      loaded = true;
      status.textContent = trendMode ? articles.length+' từ khóa · Google Trends' :
        articles.length+' nhóm tin · '+(result.total-result.failed.length)+'/'+result.total+' luồng RSS'+
        (result.failed.length ? ' · Lỗi: '+result.failed.join(', ') : '');
      render();
    } catch (error) {
      if (ticket === generation) status.textContent = error.message;
    } finally {
      if (ticket === generation) refresh.disabled = false;
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
  topic.onchange = render;
  country.onchange = () => load();
  setInterval(() => { if (auto.checked && active && !refresh.disabled) load(true); }, 900000);
  list.style.cssText = 'max-height:62vh;overflow:auto;border:1px solid #dce6e2;border-radius:8px';
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
