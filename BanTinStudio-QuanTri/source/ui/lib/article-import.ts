import {fileStem} from './file-save';
export type ArticleImage={file:string;mime:string;bytes:number;url:string;alt:string;asset_url:string};
export type ArticleDraft={title:string;script:string;engine:'local'|'ai';note:string};
export type ImportedArticle={id:string;url:string;title:string;text:string;source_name:string;images:ArticleImage[];warnings:string[];storage_hint:string;draft?:ArticleDraft};
export type ArticleSource={id:string;url:string;title:string;text:string;source_name:string};
export type WriterConfig={base_url:string;model:string;has_key:boolean};
export type ArticleJob={id:string;status:'queued'|'reading'|'images'|'done'|'error'|'cancelled';message:string;completed:number;total:number;result:ImportedArticle|null;error:string};
export type ArticleHistory={id:string;title:string;url:string;count:number};
export async function articleRequest<T>(path:string,body?:unknown,signal?:AbortSignal):Promise<T>{
 const headers:Record<string,string>={};
 if(body!==undefined){const state=await(await fetch('/_desktop/status',{signal})).json();if(!state.csrf)throw Error('Chưa kết nối bộ chạy. Mở lại Quân Bản Tin.exe.');headers['X-Studio-CSRF']=state.csrf;headers['Content-Type']='application/json';}
 const response=await fetch('/_desktop/article/'+path,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body),signal});
 const data=await response.json();if(!response.ok)throw Error(data.message||'Chưa lấy được dữ liệu bài viết.');return data as T;
}
export function articleSource(article:ImportedArticle):ArticleSource{return {id:article.id,url:article.url,title:article.title,text:article.text,source_name:article.source_name};}
export function normalizeArticleSources(raw:unknown):ArticleSource[]{
 if(!Array.isArray(raw))return [];
 return raw.slice(-30).filter(a=>a&&typeof a==='object'&&typeof a.id==='string'&&typeof a.url==='string'&&/^https?:\/\//i.test(a.url)).map(a=>({id:String(a.id).slice(0,100),url:String(a.url).slice(0,8192),title:String(a.title||'').slice(0,300),text:String(a.text||'').slice(0,120000),source_name:String(a.source_name||'').slice(0,200)}));
}
export async function articleImageFiles(article:ImportedArticle,selection:string[]):Promise<File[]>{
 const chosen=new Set(selection),files:File[]=[];
 for(const image of article.images.filter(i=>chosen.has(i.file))){
  if(!/^\/_desktop\/article\/assets\/[a-f0-9]{24}\/[\w.-]+$/.test(image.asset_url))throw Error('Đường dẫn ảnh đã lưu không hợp lệ.');
  const response=await fetch(image.asset_url);if(!response.ok)throw Error('Không mở được ảnh đã lưu: '+image.file);
  let blob=await response.blob(),ext=image.file.split('.').pop()||'jpg';
  if(!['image/jpeg','image/png','image/webp'].includes(image.mime)){
   const url=URL.createObjectURL(blob),im=new Image();try{im.src=url;await im.decode();const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;c.getContext('2d')!.drawImage(im,0,0);blob=await new Promise<Blob>((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('Không chuyển được ảnh '+image.file)),'image/png'));ext='png';}finally{URL.revokeObjectURL(url);}
  }
  files.push(new File([blob],fileStem(article.title,'Ảnh bài viết',65)+'-'+image.file.replace(/\.[^.]+$/,'')+'.'+ext,{type:blob.type||image.mime}));
 }
 return files;
}
