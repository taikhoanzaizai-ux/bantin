import assert from 'node:assert/strict';
import {testModules} from './test-modules.mjs';
const {fileStem,videoFileName,chooseSaveFile,writeSaveFile}=await import(testModules()('lib/file-save.ts'));
assert.equal(videoFileName('Bản tin Hà Nội','mp4'),'Bản tin Hà Nội.mp4');
assert.equal(videoFileName('Tin mới','webm'),'Tin mới.webm');
assert.equal(videoFileName('','mp4'),'Bản tin.mp4');
assert.equal(fileStem(' Tin: ngày 18/10? '),'Tin- ngày 18-10-');
for(const name of ['CON','aux.txt','COM1','LPT9','NUL.abc','COM¹'])assert.ok(fileStem(name).startsWith('_'));
assert.equal(fileStem(' ... '),'Bản tin');
assert.equal(fileStem('Tin\u0000mới. '),'Tin-mới');
assert.equal(fileStem('a'.repeat(149)+'😀').length,149); // Never split a surrogate pair.
assert.equal(videoFileName('Tin','mp4',{index:0,name:'Mẫu.png'}),'Tin - 01 - Mẫu.png.mp4');
assert.notEqual(videoFileName('Tin','mp4',{index:0,name:'Mẫu'}),videoFileName('Tin','mp4',{index:1,name:'Mẫu'}));
let picked,events=[];
globalThis.window={async showSaveFilePicker(options){picked=options;events.push('picker');return {name:'Ổ D - tên mới.mp4',async createWritable(){events.push('writer');return {async write(blob){events.push(await blob.text());},async close(){events.push('close');},async abort(){events.push('abort');}};}};}};
const handle=await chooseSaveFile('Tin.mp4','video');assert.equal(handle.name,'Ổ D - tên mới.mp4');assert.equal(picked.id,'bantin-video');assert.equal(picked.startIn,'videos');assert.deepEqual(picked.types[0].accept,{'video/mp4':['.mp4']});
assert.deepEqual(events,['picker']);await writeSaveFile(handle,new Blob(['data']));assert.deepEqual(events,['picker','writer','data','close']);
await chooseSaveFile('Dự án.json','project');assert.equal(picked.startIn,'documents');assert.equal(picked.id,'bantin-project');
window.showSaveFilePicker=async()=>{throw new DOMException('Cancel','AbortError');};assert.equal(await chooseSaveFile('Tin.mp4','video'),null);
window.showSaveFilePicker=async()=>{throw new DOMException('Blocked','SecurityError');};await assert.rejects(()=>chooseSaveFile('Tin.mp4','video'),{name:'SecurityError'});
delete window.showSaveFilePicker;await assert.rejects(()=>chooseSaveFile('Tin.mp4','video'),/Chrome/);
for(const failAt of ['write','close']){
  let aborted=false;
  const failed={async createWritable(){return {async write(){if(failAt==='write')throw Error('Disk full');},async close(){if(failAt==='close')throw Error('Disk full');},async abort(){aborted=true;}};}};
  await assert.rejects(()=>writeSaveFile(failed,new Blob()),/Disk full/);assert.equal(aborted,true);
}
console.log('Passed file naming and picker/writer behavior: Vietnamese titles, Windows constraints, multi-template uniqueness, cancellation, unsupported/blocked picker, and write/close failure aborts. Native dialogs and real filesystem writes require Windows QA.');
