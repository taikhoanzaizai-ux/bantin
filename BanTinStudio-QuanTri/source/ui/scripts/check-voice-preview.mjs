import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import React from 'react';
import {testModules} from './test-modules.mjs';
const {default:Renderer,act}=await import(process.env.STUDIO_TEST_RENDERER?pathToFileURL(process.env.STUDIO_TEST_RENDERER).href:'react-test-renderer');
const {default:VoicePreview}=await import(testModules()('app/voice-preview.tsx'));
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const listeners=new Map();globalThis.window={addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name)=>listeners.delete(name)};
let calls=[],plays=0,pauses=0,busy=[],starts=0,blocked=false,responseError=false,deferred=null,signal,supportsSpeed=true;
const revoked=[];const nativeRevoke=URL.revokeObjectURL;URL.revokeObjectURL=url=>{revoked.push(url);nativeRevoke(url);};
globalThis.fetch=async(url,options={})=>{
  calls.push({url,options});
  if(url==='/_desktop/voice/status')return new Response(JSON.stringify({ready:true,csrf:'test-csrf'}));
  if(url==='/_desktop/voice/proxy/health')return new Response(JSON.stringify({capabilities:supportsSpeed?['tts','speech-speed']:['tts']}));
  assert.equal(url,'/_desktop/voice/proxy/v1/audio/speech');
  assert.equal(options.headers.get('X-Studio-CSRF'),'test-csrf');signal=options.signal;
  if(deferred)return await new Promise(resolve=>{deferred.resolve=resolve;});
  return responseError?new Response(JSON.stringify({detail:'Máy đang bận, thử lại.'}),{status:503}):new Response(new Blob(['short audio'],{type:'audio/wav'}));
};
const player={src:'',currentTime:0,async play(){plays++;if(blocked)throw Error('Autoplay blocked');},pause(){pauses++;}};
let props={voice:'north-a',mode:'vieneu',speed:1,ready:false,base:'http://127.0.0.1:8000',token:'desktop-auto',busy:false,onBusy:value=>busy.push(value),onStart:()=>starts++},ui;
const options={createNodeMock:n=>n.type==='audio'?player:{}};
const content=n=>typeof n==='string'?n:Array.isArray(n)?n.map(content).join(''):n?.props?.children?content(n.props.children):'';
const button=()=>ui.root.findByType('button'),audio=()=>ui.root.findByType('audio');
const status=()=>ui.root.findAllByProps({role:'status'}).map(content).join(' ');
async function update(changes){props={...props,...changes};await act(async()=>ui.update(React.createElement(VoicePreview,props)));}
await act(async()=>{ui=Renderer.create(React.createElement(VoicePreview,props),options);});
assert.equal(button().props.disabled,true);assert.equal(calls.length,0);
await update({ready:true});assert.equal(button().props.disabled,false);
await act(async()=>button().props.onClick());assert.equal(calls.length,2);assert.equal(JSON.parse(calls[1].options.body).voice,'north-a');assert.ok(JSON.parse(calls[1].options.body).input.length<=240);assert.equal(plays,1);assert.equal(starts,1);assert.deepEqual(busy,[true,false]);assert.equal(audio().props.hidden,false);const firstUrl=audio().props.src;assert.ok(firstUrl.startsWith('blob:'));
await act(async()=>button().props.onClick());assert.equal(calls.length,2);assert.equal(plays,2); // Cached replay.
await act(async()=>ui.root.findByType('textarea').props.onChange({target:{value:'Tin mới hôm nay.'}}));assert.ok(revoked.includes(firstUrl));assert.equal(audio().props.src,undefined);
await act(async()=>button().props.onClick());assert.equal(JSON.parse(calls.at(-1).options.body).input,'Tin mới hôm nay.');
await update({voice:'saved-clone',mode:'clone'});assert.equal(audio().props.src,undefined);
await act(async()=>button().props.onClick());assert.equal(JSON.parse(calls.at(-1).options.body).voice,'saved-clone');
await update({voice:''});assert.equal(button().props.disabled,true);
await update({voice:'north-b',mode:'vieneu'});responseError=true;await act(async()=>button().props.onClick());assert.ok(content(ui.root.findByProps({role:'alert'})).includes('Máy đang bận'));assert.equal(button().props.disabled,false);responseError=false;
blocked=true;await act(async()=>button().props.onClick());assert.ok(status().includes('Bấm nút phát'));assert.equal(audio().props.hidden,false);blocked=false;
await update({voice:'north-c'});deferred={};let pending;await act(async()=>{pending=button().props.onClick();await new Promise(setImmediate);});assert.ok(content(button()).includes('Hủy nghe thử'));assert.equal(busy.at(-1),true);
await act(async()=>button().props.onClick());assert.equal(signal.aborted,true);assert.equal(busy.at(-1),false);assert.ok(status().includes('Đã dừng'));await act(async()=>{deferred.resolve(new Response(new Blob(['late'],{type:'audio/wav'})));await pending;});deferred=null;assert.equal(audio().props.src,undefined);assert.equal(ui.root.findAllByProps({role:'alert'}).length,0);
// A delayed old response cannot replace the new voice's sample.
deferred={};await act(async()=>{pending=button().props.onClick();await new Promise(setImmediate);});const late=deferred;await update({voice:'north-d'});assert.equal(signal.aborted,true);deferred=null;await act(async()=>button().props.onClick());const newUrl=audio().props.src;await act(async()=>{late.resolve(new Response(new Blob(['old'],{type:'audio/wav'})));await pending;});assert.equal(audio().props.src,newUrl);
await act(async()=>listeners.get('studio-license-expired')());assert.ok(revoked.includes(newUrl));assert.equal(audio().props.hidden,true);assert.ok(content(ui.root.findByProps({role:'alert'})).includes('Bản quyền'));
await update({voice:'north-e',speed:1.25});await act(async()=>button().props.onClick());assert.equal(JSON.parse(calls.at(-1).options.body).speed,1.25);const speedUrl=audio().props.src;await update({speed:.8});assert.ok(revoked.includes(speedUrl));assert.equal(audio().props.src,undefined);supportsSpeed=false;await act(async()=>button().props.onClick());assert.ok(content(ui.root.findByProps({role:'alert'})).includes('Cập nhật bộ chạy'));supportsSpeed=true;await act(async()=>button().props.onClick());assert.equal(JSON.parse(calls.at(-1).options.body).speed,.8);const lastUrl=audio().props.src;await act(async()=>ui.unmount());assert.ok(revoked.includes(lastUrl));assert.equal(listeners.size,0);assert.ok(pauses>0);
URL.revokeObjectURL=nativeRevoke;
console.log('Passed voice preview UI with real request/proxy helper and simulated audio: ready gating, short text/selected preset or clone, CSRF, replay cache, edit/voice invalidation, backend error/retry, blocked autoplay fallback, cancellation/late response, license expiry, unmount cleanup. No real model, speaker, or Windows audio playback was tested.');
