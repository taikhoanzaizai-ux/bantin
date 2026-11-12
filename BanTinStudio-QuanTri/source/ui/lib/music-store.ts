export type SavedMusic={id:string;name:string;blob:Blob;duration:number;createdAt:number;digest:string};
const MAX_TRACKS=50,MAX_BYTES=250e6;
function database(){return new Promise<IDBDatabase>((resolve,reject)=>{const req=indexedDB.open('ban-tin-music',1);req.onupgradeneeded=()=>req.result.createObjectStore('tracks',{keyPath:'id'});req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(new Error('Không mở được kho nhạc trên máy.'));});}
function valid(record:SavedMusic){return record&&typeof record.id==='string'&&typeof record.name==='string'&&record.blob instanceof Blob&&record.blob.size<=25e6&&Number.isFinite(record.duration)&&record.duration>=1&&record.duration<=600;}
export async function readMusic(){const db=await database();try{return await new Promise<SavedMusic[]>((resolve,reject)=>{const tx=db.transaction('tracks','readonly'),req=tx.objectStore('tracks').getAll();req.onsuccess=()=>resolve((req.result as SavedMusic[]).filter(valid).sort((a,b)=>b.createdAt-a.createdAt));req.onerror=()=>reject(req.error);});}finally{db.close();}}
export async function saveMusic(blob:Blob,name:string,duration:number){
 if(!blob.size||blob.size>25e6||!Number.isFinite(duration)||duration<1||duration>600)throw new Error('Nhạc lưu tối đa 25 MB và dài từ 1 giây đến 10 phút.');
 const bytes=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()),digest=Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('');
 const record:SavedMusic={id:digest,name:name.slice(0,200)||'Nhạc của tôi',blob,duration,createdAt:Date.now(),digest};
 const db=await database();try{return await new Promise<SavedMusic>((resolve,reject)=>{const tx=db.transaction('tracks','readwrite'),store=tx.objectStore('tracks'),req=store.getAll();let saved=record,failure='Không lưu được nhạc. Kiểm tra dung lượng trống của trình duyệt.';
  req.onsuccess=()=>{const all=req.result as SavedMusic[],previous=all.find(x=>x.digest===digest);if(previous){saved=previous;return;}if(all.length>=MAX_TRACKS||all.reduce((sum,x)=>sum+(x.blob?.size||0),0)+blob.size>MAX_BYTES){failure='Kho nhạc tối đa 50 bài / 250 MB. Xóa bớt bài cũ rồi lưu lại.';tx.abort();return;}store.put(record);};
  tx.oncomplete=()=>resolve(saved);tx.onerror=()=>reject(new Error(failure));tx.onabort=()=>reject(new Error(failure));
 });}finally{db.close();}
}
export async function deleteMusic(id:string){const db=await database();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('tracks','readwrite');tx.objectStore('tracks').delete(id);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(new Error('Chưa xóa được bài nhạc.'));tx.onabort=()=>reject(new Error('Chưa xóa được bài nhạc.'));});}finally{db.close();}}
