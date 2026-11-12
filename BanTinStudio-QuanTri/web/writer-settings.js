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
  dialog.style.cssText='width:min(550px,92vw);padding:22px;border:1px solid #cedbd6;border-radius:14px;background:white';
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
  dialog.append(make('h2','API viết lại kịch bản'),field('Nhà cung cấp',provider),field('Địa chỉ API',base),field('Tên model',model),field('Khóa API',key),message,save,close);
  document.body.append(dialog);
  let original;
  provider.onchange=()=>{
    [base.value,model.value]=presets[provider.value];
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
      message.textContent=original.has_key?'Đã có khóa lưu trên máy. Để trống để giữ khóa của địa chỉ hiện tại.':'Chưa có khóa API.';
      save.disabled=false;
    }catch(error){message.textContent=error.message||'Không đọc được cấu hình.';}
  };
  save.onclick=async()=>{
    if(!base.value.trim()||!model.value.trim()){message.textContent='Nhập địa chỉ API và model.';return;}
    if(!key.value.trim()&&(!original?.has_key||original.base_url!==base.value.trim().replace(/\/+$/,''))){message.textContent='Nhập khóa API cho địa chỉ đã chọn.';return;}
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
