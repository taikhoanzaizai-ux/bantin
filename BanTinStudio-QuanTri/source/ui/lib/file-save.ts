// Keep Vietnamese titles while avoiding Windows filename restrictions.
export function fileStem(value:string,fallback='Bản tin',limit=150){
  let name=value.normalize('NFC').replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g,'-').replace(/\s+/g,' ').trim().replace(/[ .]+$/,'');
  if(!name||/^\.+$/.test(name))name=fallback;
  if(/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(name))name='_'+name;
  let short='';for(const character of name){if(short.length+character.length>limit)break;short+=character;}
  return short.replace(/[ .]+$/,'')||fallback;
}

export function videoFileName(title:string,extension:string,template?:{name:string;index:number}){
  const stem=fileStem(title);
  return `${stem}${template?` - ${String(template.index+1).padStart(2,'0')} - ${fileStem(template.name,'Mẫu',60)}`:''}.${extension==='mp4'?'mp4':'webm'}`;
}

export type SaveHandle={readonly name:string;createWritable():Promise<{write(data:Blob):Promise<void>;close():Promise<void>;abort():Promise<void>}>};
type SaveKind='video'|'project'|'zip';
type SaveOptions={id:string;startIn:'videos'|'documents';suggestedName:string;types:{description:string;accept:Record<string,string[]>}[]};

// Call directly from a click, BEFORE building a project or ZIP, to retain user activation.
export async function chooseSaveFile(name:string,kind:SaveKind):Promise<SaveHandle|null>{
  const picker=(window as typeof window&{showSaveFilePicker?:(options:SaveOptions)=>Promise<SaveHandle>}).showSaveFilePicker;
  if(!picker)throw new Error('Hãy mở tool bằng Chrome hoặc Microsoft Edge mới để chọn thư mục lưu file.');
  const extension=kind==='project'?'.json':kind==='zip'?'.zip':name.endsWith('.mp4')?'.mp4':'.webm';
  const mime=kind==='project'?'application/json':kind==='zip'?'application/zip':extension==='.mp4'?'video/mp4':'video/webm';
  try{return await picker.call(window,{id:`bantin-${kind}`,startIn:kind==='project'?'documents':'videos',suggestedName:name,types:[{description:kind==='project'?'Dự án Bản Tin Studio':kind==='zip'?'Các video trong ZIP':'Video bản tin',accept:{[mime]:[extension]}}]});}
  catch(error){if((error as Error).name==='AbortError')return null;throw error;}
}

// The destination is only opened after data is ready. Failed writes are aborted.
export async function writeSaveFile(handle:SaveHandle,blob:Blob){
  const writer=await handle.createWritable();
  try{await writer.write(blob);await writer.close();}
  catch(error){try{await writer.abort();}catch{/* Preserve the original failure. */}throw error;}
}
