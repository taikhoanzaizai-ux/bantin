(() => {
  const presets = {
    OpenAI: ['https://api.openai.com/v1','gpt-4.1-mini'],
    Gemini: ['https://generativelanguage.googleapis.com/v1beta/openai','gemini-3.8-flash'],
    DeepSeek: ['https://api.deepseek.com','deepseek-v4.1-flash'],
    OpenRouter: ['https://openrouter.ai/api/v1','openai/gpt-4.1-mini'],
    'Tùy chỉnh': ['', ''],
  };
  const make = (tag,text) => {const el=document.createElement(tag); if(text)el.textContent=text; return el;};
  const button=make('button','Thiết lập API / model');
  button.type='button';
  button.className='button';
  button.style.margin='8px 0';
  const dialog=make('dialog');
  dialog.style.cssText='width:min(550px,92vw);padding:22px;border:1px solid #cedeea;border-radius:14px;background:#eff8ff';
  dialog.setAttribute('aria-label','Thiết lập API viết kịch bản');
  const provider=make('select');
  for(const name of Object.keys(presets))provider.append(make('option',name));
  const base=make('input');
  base.type='url';
  const model=make('input');
  model.maxLength=160;
  const key=make('input');
  key.type='password';key.autocomplete='off';key.maxLength=1024;
  function field(label,input){const el=make('label',label);el.className='field-label';el.append(input);return el;}
  const message=make('p');message.setAttribute('role','status');
  const save=make('button','Lưu cấu hình');save.type='button';save.className='button primary';
  const close=make('button','Đóng');close.type='button';close.className='button';close.onclick=()=>dialog.close();
  dialog.append(make('h2','AI viết kịch bản'),field('Nhà cung cấp',provider),field('Địa chỉ API',base),field('Tên model',model),field('Khóa API',key),message,save,close);
  const keyLink=make('a','Lấy khóa OpenAI');
  keyLink.href='https://platform.openai.com/login?next=%2Fapi-keys';
  keyLink.target='_blank';keyLink.rel='noopener noreferrer';keyLink.className='button';
  const models=make('select');
  models.setAttribute('aria-label','Model OpenAI tiết kiệm');
  for(const [id,label] of [['','Chọn model OpenAI'],['gpt-6.1-sol','GPT-6.1 Sol · cân bằng'],['gpt-6-luna','GPT-6 Luna · tiết kiệm'],['gpt-6-astra','GPT-6 Astra · tác vụ phức tạp']]){
    const option=make('option',label);option.value=id;models.append(option);
  }
  models.onchange=()=>{if(models.value && provider.value==='OpenAI')model.value=models.value;};
  const chat=make('a','Mở ChatGPT');
  chat.href='https://chatgpt.com/';chat.target='_blank';chat.rel='noopener noreferrer';chat.className='button';
  const copy=make('button','Sao chép yêu cầu viết');
  copy.type='button';copy.className='button';
  copy.onclick=async()=>{
    const link=document.getElementById('article-url')?.value.trim() || '';
    const source=[...document.querySelectorAll('.article-importer textarea')].find(el=>el.getAttribute('aria-label')==='Nội dung nguồn dán bổ sung')?.value.trim() || '';
    if(!link&&!source){message.textContent='Hãy nhập link hoặc dán nội dung bài trong mục Kịch bản trước.';return;}
    const prompt=['Viết kịch bản bản tin tiếng Việt khoảng 1 phút từ nguồn dưới đây. Cho tôi tiêu đề, câu mở đầu thu hút và lời đọc. Chỉ dùng dữ kiện kiểm chứng được. Nếu không đọc được bài, hãy yêu cầu tôi dán nội dung.',link,source].filter(Boolean).join('\n\n');
    try{await navigator.clipboard.writeText(prompt);message.textContent='Đã sao chép. Mở ChatGPT, dán yêu cầu rồi đưa lời đọc về ô Kịch bản.';}
    catch{message.textContent='Không sao chép được. Bạn có thể mở ChatGPT và dán link bài trực tiếp.';}
  };
  dialog.append(keyLink,field('Model OpenAI',models),make('p','ChatGPT dùng gói chat của bạn. Chế độ API tính phí riêng.'),copy,chat);
  for(const [action,label] of [['writer-models','Tải danh sách model'],['writer-test','Thử gọi model · có dùng token']]){
    const control=make('button',label);control.type='button';control.className='button';
    control.onclick=async()=>{
      if(provider.value!=='OpenAI' || key.value.trim() || base.value.trim()!==original?.base_url){message.textContent='Lưu cấu hình OpenAI trước khi thử.';return;}
      if(action==='writer-test'&&!confirm('Gửi yêu cầu thử đến OpenAI? Lượt gọi có thể tính phí API.'))return;
      control.disabled=true;message.textContent='Đang kết nối OpenAI…';
      try{
        const session=await fetch('/_desktop/status');const {csrf}=await session.json();
        const response=await fetch('/_desktop/article/'+action,{method:'POST',headers:{'Content-Type':'application/json','X-Studio-CSRF':csrf},body:JSON.stringify({model:model.value})});
        const result=await response.json();
        if(!response.ok)throw new Error(result.message||'Không kết nối được OpenAI.');
        if(action==='writer-models'){
          for(const id of result.models)if(![...models.options].some(option=>option.value===id)){const option=make('option',id);option.value=id;models.append(option);}
          message.textContent='Đã tải '+result.models.length+' model GPT.';
        }else message.textContent='Model phản hồi thành công.';
      }catch(error){message.textContent=error.message;}
      finally{control.disabled=false;}
    };
    dialog.append(control);
  }
  document.body.append(dialog);
  let original;
  provider.onchange=()=>{
    [base.value,model.value]=presets[provider.value];
    models.value='';models.disabled=provider.value!=='OpenAI';
    key.value='';
    message.textContent='Nhập khóa tương ứng với nhà cung cấp đã chọn.';
  };
  button.onclick=async()=>{
    if(dialog.open)return;
    original=null;key.value='';save.disabled=true;
    message.textContent='Đang đọc cấu hình…';
    dialog.showModal();
    try{
      const response=await fetch('/_desktop/article/settings',{cache:'no-store'});
      original=await response.json();
      if(!response.ok)throw new Error(original.message);
      base.value=original.base_url;model.value=original.model;
      provider.value=Object.keys(presets).find(name=>presets[name][0]===base.value)||'Tùy chỉnh';
      models.disabled=provider.value!=='OpenAI';models.value=original.model;
      message.textContent=original.has_key?'Đã có khóa lưu trên máy. Để trống để giữ khóa của địa chỉ hiện tại.':'Chưa có khóa API.';
      save.disabled=false;
    }catch(error){message.textContent=error.message||'Không đọc được cấu hình.';}
  };
  save.onclick=async()=>{
    if(!base.value.trim()||!model.value.trim()){message.textContent='Nhập địa chỉ API và model.';return;}
    if(!key.value.trim()&&((!original?.has_key && provider.value!=='OpenAI')||original.base_url!==base.value.trim().replace(/\/+$/,''))){message.textContent='Nhập khóa API cho địa chỉ đã chọn.';return;}
    save.disabled=true;
    try{
      const status=await fetch('/_desktop/status',{cache:'no-store'});const info=await status.json();
      if(!status.ok||!info.csrf)throw new Error('Hãy mở lại Quân Bản Tin.');
      const response=await fetch('/_desktop/article/settings',{method:'POST',headers:{'Content-Type':'application/json','X-Studio-CSRF':info.csrf},body:JSON.stringify({base_url:base.value,model:model.value,api_key:key.value})});
      const result=await response.json();
      if(!response.ok)throw new Error(result.message);
      original=result;key.value='';
      message.textContent='Đã lưu '+result.model+'. Chọn Viết lại bằng AI để sử dụng.';
    }catch(error){message.textContent=error.message||'Chưa lưu được cấu hình.';}
    finally{save.disabled=false;}
  };
  dialog.addEventListener('close',()=>{key.value='';});
  function mount(){
    const importer=document.querySelector('.article-importer');
    if(importer&&button.parentElement!==importer) importer.prepend(button);
  }
  new MutationObserver(mount).observe(document.getElementById('root'),{childList:true,subtree:true});
  mount();
})();
