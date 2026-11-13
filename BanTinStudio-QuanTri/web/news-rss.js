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
      if(makeVideoAuto.checked)void autoVideo();
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
  const makeVideoAuto = make('input');
  makeVideoAuto.type = 'checkbox';
  const videoLabel = make('label');
  videoLabel.append(makeVideoAuto, ' Tự làm video');
  const autoStatus = make('p','Tự động đang tắt');
  autoStatus.setAttribute('role','status');
  tools.append(videoLabel);
  tools.after(autoStatus);
  const live = make('p');
  live.setAttribute('role','status');
  live.style.cssText='position:fixed;right:18px;bottom:112px;z-index:900;background:#eff8f4;padding:8px;max-width:360px';
  live.hidden=true;
  document.body.append(live);
  function report(text) {
    autoStatus.textContent=text;
    live.textContent=text;
    live.hidden=false;
  }
  const articleKey = url => new URL(url).origin + new URL(url).pathname.replace(/\/$/,'');
  let running=false, epoch=0;
  const readLog = () => {
    try {
      const value=JSON.parse(localStorage.getItem('qbt-auto-video')||'{}');
      return {urls:Array.isArray(value.urls)?value.urls:[]};
    } catch {return {urls:[]};}
  };
  const nextFrame=()=>new Promise(resolve=>setTimeout(resolve,200));
  const action=(root,label)=>[...(root?.querySelectorAll('button')||[])].find(el=>el.textContent.trim()===label);
  function setField(el,value) {
    Object.getOwnPropertyDescriptor(el.tagName==='SELECT'?HTMLSelectElement.prototype:el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,value);
    el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));
  }
  async function autoVideo(manual = null, queued = null) {
    if(running||(!manual&&(!makeVideoAuto.checked||(!queued&&(!active||trendMode)))))return;
    const log=readLog();
    const seen=new Set(log.urls);
    const candidates=articles.filter(group=>group.score>=75).flatMap(group=>{
      const keys=group.items.map(item=>articleKey(item.url));
      if(keys.some(key=>seen.has(key)))return [];
      return group.items.map(item=>({...item,keys}));
    });
    const candidate=manual||queued||candidates.find(item=>topic.value==='Tất cả'||item.topic===topic.value);
    if(candidate&&(candidate.keys||[articleKey(candidate.url)]).some(key=>seen.has(key))){
      report('Bài này đã được dựng video.');return;
    }
    if(!candidate){report('Chưa có bài mới từ 75 điểm.');return;}
    if(document.querySelector('.modal-backdrop,dialog[open]')||scriptTab()?.disabled)return;
    running=true;
    const ticket=epoch;
    const check=()=>{if((!manual&&!makeVideoAuto.checked)||epoch!==ticket)throw Error('Đã tắt tự động.');};
    async function until(get,ms,error,alertRoot){
      const end=Date.now()+ms;
      while(Date.now()<end){
        check();
        const alert=alertRoot?.querySelector('.notice.error,[role="alert"]');
        if(alert?.textContent.trim())throw Error(alert.textContent.trim());
        const value=get();if(value)return value;
        await nextFrame();
      }
      throw Error(error);
    }
    try {
      const csrfResponse=await fetch('/_desktop/status',{cache:'no-store'});
      const session=await csrfResponse.json();
      check();
      if(!csrfResponse.ok||!session.csrf)throw Error('Hãy mở lại Quân Bản Tin.');
      const configResponse=await fetch('/_desktop/article/settings',{cache:'no-store'});
      const config=await configResponse.json();
      check();
      if(!configResponse.ok||!config.has_key)throw Error('Hãy lưu khóa API trong Thiết lập API / model.');
      if(!queued){
        sessionStorage.setItem('qbt-auto-next',JSON.stringify({candidate,manual:!!manual,enabled:makeVideoAuto.checked,country:country.value,topic:topic.value}));
        localStorage.removeItem('news-draft');
        location.reload();
        return;
      }
      openScript(candidate.url);
      const importer=await until(()=>document.querySelector('.article-importer'),5000,'Không mở được Kịch bản.');
      const field=await until(()=>{const node=document.getElementById('article-url');return node?.value===candidate.url&&node;},5000,'Không điền được link.');
      const mode=importer.querySelector('select[aria-label="Cách viết kịch bản từ link"]');
      if(!mode||mode.disabled)throw Error('Không chọn được chế độ viết AI.');
      const pasted=importer.querySelector('textarea[aria-label="Nội dung nguồn dán bổ sung"]');
      if(pasted?.value.trim())throw Error('Ô nội dung nguồn đang có văn bản. Hãy mở dự án trống.');
      setField(mode,'ai');
      await nextFrame();check();
      const loadButton=action(importer,'Lấy bài, lưu ảnh & tạo kịch bản');
      if(!loadButton||loadButton.disabled||field.value!==candidate.url)throw Error('Không thể bắt đầu lấy bài.');
      report('Đang viết kịch bản: '+candidate.title);
      loadButton.click();
      const apply=await until(()=>{
        const button=action(importer,'Áp dụng vào dự án');
        const draft=importer.querySelector('textarea[aria-label="Kịch bản đề xuất từ link"]');
        return draft?.value.trim() && button && !button.disabled && button;
      },240000,'Chưa tạo được kịch bản AI.',importer);
      const target=importer.querySelector('select[aria-label="Video nhận kịch bản từ link"]');
      if(target)setField(target,'shared');
      const checks=[...importer.querySelectorAll('.consent-row input[type=checkbox]')];
      for(const box of checks)if(!box.checked)box.click();
      const images=[...importer.querySelectorAll('input[aria-label^="Chọn ảnh "]')];
      images.forEach(box=>{if(!box.checked)box.click();});
      await nextFrame();check();
      apply.click();
      await until(()=>document.getElementById('script')?.value.trim()&&!apply.disabled,45000,'Không áp dụng được kịch bản.',importer);
      const transfer=new DataTransfer();
      report('Đang tìm ảnh Google: '+candidate.title);
      try{
        const response=await fetch('/_desktop/media-suggest/google',{method:'POST',headers:{'Content-Type':'application/json','X-Studio-CSRF':session.csrf},body:JSON.stringify({q:(document.getElementById('title')?.value.trim()||candidate.title).slice(0,180)})});
        const results=await response.json();
        if(!response.ok)throw Error(results.message);
        for(const item of results.slice(0,8)){
          check();
          if(transfer.items.length>=3)break;
          try{
            const query=new URLSearchParams({url:item.url,provider:'google'});
            const file=await fetch('/_desktop/media-suggest/file?'+query);
            if(!file.ok)continue;
            const blob=await file.blob();
            const ext={'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp'}[blob.type];
            if(ext)transfer.items.add(new File([blob],item.title.slice(0,120)+ext,{type:blob.type}));
          }catch{}
        }
      }catch(error){check();if(!images.length)throw error;report('Không tìm thêm được ảnh Google. Dùng ảnh từ bài báo: '+error.message);}
      check();
      if(transfer.items.length){
        const input=document.querySelector('input[type="file"][multiple][accept^="image/jpeg"]');
        if(!input)throw Error('Không tìm thấy ô thêm ảnh.');
        input.files=transfer.files;
        input.dispatchEvent(new Event('change',{bubbles:true}));
        await nextFrame();
      }else if(!images.length)throw Error('Chưa có ảnh để dựng video.');
      const tabs=document.querySelectorAll('.sidebar nav button.nav-item');
      const voiceTab=[...tabs].find(tab=>tab.textContent.trim().startsWith('Cảnh & giọng đọc'));
      await until(()=>voiceTab&&!voiceTab.disabled,45000,'Không mở được mục giọng đọc.');
      voiceTab.click();
      const voice=await until(()=>document.getElementById('voice-mode'),5000,'Không tìm thấy thiết lập giọng đọc.');
      if(['upload','presets'].includes(voice.value))setField(voice,'vieneu');
      await nextFrame();check();
      const studio=document.querySelector('.work-grid')?.closest('main');
      if(!studio)throw Error('Không tìm thấy khu vực dựng video.');
      const renderButton=await until(()=>{
        const button=action(studio.querySelector('.export-card'),'Tạo video');
        return button&&!button.disabled&&button;
      },8000,'Không tìm thấy nút Tạo video.',studio);
      const result=()=>document.querySelector('[aria-label="Video đã hoàn thành"]');
      renderButton.click();
      await until(()=>renderButton.disabled||result(),15000,'Quân Bản Tin chưa bắt đầu dựng. Bấm Tạo video để thử lại.',studio);
      if(!result()){
        report('Đang dựng video: '+candidate.title);
        await until(()=>{
          if(result())return true;
          if(!renderButton.disabled)throw Error('Quá trình dựng đã dừng. Bấm Tạo video để thử lại.');
          return false;
        },900000,'Chưa thấy kết quả video.',studio);
      }
      const updated=new Set(readLog().urls);
      for(const key of candidate.keys||[articleKey(candidate.url)])updated.add(key);
      localStorage.setItem('qbt-auto-video',JSON.stringify({urls:[...updated]}));
      report('Video đã sẵn sàng: '+candidate.title+'. Bấm Lưu video để lưu.');
    } catch(error){report(error.message);}
    finally{running=false;}
  }
  makeVideoAuto.onchange=()=>{
    epoch++;
    if(!makeVideoAuto.checked){report('Đã tắt tự động. Tác vụ đã bắt đầu có thể vẫn hoàn tất.');return;}
    if(!confirm('Bật tự làm video? App sẽ chọn bài từ 75 điểm, dùng API có thể tính phí, thêm ảnh Google và dựng video cho bài chưa làm. Mỗi lần bắt đầu sẽ bỏ nội dung dự án đang mở. Hãy lưu dự án trước khi bật.')){
      makeVideoAuto.checked=false;return;
    }
    report('Đã bật tự động. Đang quét tin…');
    load(true);
  };
  const startLink=make('button','Bắt đầu làm tự động');
  startLink.type='button';startLink.className='button primary';
  startLink.onclick=()=>{
    if(running){report('Đang có tác vụ tự động.');return;}
    const value=document.getElementById('article-url')?.value.trim();
    let url;
    try{url=new URL(value);if(!['http:','https:'].includes(url.protocol))throw Error();}
    catch{report('Nhập link bài viết HTTP hoặc HTTPS trước.');return;}
    if(confirm('Bắt đầu từ link đã nhập? Nội dung đang mở sẽ bị bỏ. Hãy lưu dự án trước nếu cần. Lượt gọi AI có thể tính phí.'))
      void autoVideo({url:url.href,title:url.hostname});
  };
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
    const linkField=grid.querySelector('label[for="article-url"]');
    if(linkField&&startLink.parentElement!==linkField.parentElement)linkField.after(startLink);
    if (!mounted) {
      mounted=true;
      const queued=sessionStorage.getItem('qbt-auto-next');
      if(queued){
        sessionStorage.removeItem('qbt-auto-next');
        try{
          const job=JSON.parse(queued);
          makeVideoAuto.checked=job.enabled;
          country.value=job.country;topic.value=job.topic;
          show(false);
          void autoVideo(job.manual ? job.candidate : null,job.candidate);
        }catch{show(true);}
      }else show(true);
    }
    const section = grid.querySelector('.section-number');
    const buttons = Array.from(sidebar.children).slice(1);
    const index = buttons.findIndex(button => button.classList.contains('active'));
    if (section && index >= 0 && section.textContent !== '0' + (index + 2))
      section.textContent = '0' + (index + 2);
  }
  new MutationObserver(mount).observe(document.getElementById('root'), {subtree:true,childList:true});
  mount();
})();
