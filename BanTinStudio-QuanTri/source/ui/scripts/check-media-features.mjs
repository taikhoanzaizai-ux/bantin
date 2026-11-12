import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import 'fake-indexeddb/auto';
import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {testModules} from './test-modules.mjs';
const load=testModules();
const {shuffledMedia,scenesForOrder,isFileDrag}=await import(load('lib/media-order.ts'));
const {mediaFrameFor}=await import(load('lib/safe-frame.ts'));
const {mediaLayout}=await import(load('lib/media.ts'));
const {drawFrame}=await import(load('lib/render-news.ts'));
const {readMusic,saveMusic,deleteMusic}=await import(load('lib/music-store.ts'));
const {default:VideoTrimEditor}=await import(load('app/video-trim-editor.tsx'));
const {default:MusicLibrary}=await import(load('app/music-library.tsx'));
const media=[{id:'a'},{id:'b'},{id:'c'}],scenes=[{text:'One',duration:3},{text:'Two',duration:4},{text:'Three',duration:5},{text:'Four',duration:6}];
const order=shuffledMedia(media,()=>.999);assert.notDeepEqual(order,media);assert.deepEqual(media.map(p=>p.id),['a','b','c']);
assert.deepEqual(new Set(order),new Set(media));assert.deepEqual(scenesForOrder(scenes,order).map(s=>[s.text,s.duration]),scenes.map(s=>[s.text,s.duration]));assert.deepEqual(scenesForOrder(scenes,order).map(s=>s.imageId),['b','a','c','b']);
assert.equal(isFileDrag({types:['Files'],files:[]}),true);assert.equal(isFileDrag({types:['text/plain'],files:[]}),false);
const base={scenes:[{id:'s',text:'',imageId:'p',duration:10}],pictures:[],title:'',brand:'',brandEnabled:false,style:'news',captions:false,zoom:true,logo:null,motion:'zoom-in',motionStrength:.15,transition:'cut',transitionDuration:0,introDuration:2,titleEnabled:false,footerMode:'full',footerPlacement:'bottom',footerScale:1,footerBottom:0};
for(const aspect of ['portrait','landscape']){
 const W=aspect==='portrait'?720:1280,H=aspect==='portrait'?1280:720;
 for(const fullTemplate of [false,true]){
  const footer=createCanvas(W,fullTemplate?H:Math.round(H*.25));footer.getContext('2d').fillStyle='#0000ff';footer.getContext('2d').fillRect(0,0,footer.width,footer.height);
  const red=createCanvas(W,H);red.getContext('2d').fillStyle='#ff0000';red.getContext('2d').fillRect(0,0,W,H);
  for(const fit of ['contain','cover','manual'])for(const rotation of [0,25,90]){
   const picture={id:'p',image:red,fit,scale:2.5,offsetX:100,offsetY:100,rotation,blurBackground:false};const data={...base,aspect,footer,pictures:[picture]};const frame=mediaFrameFor(data,5);assert.ok(frame.height<75&&frame.height>60);
   const canvas=createCanvas(W,H);drawFrame(canvas,5,data);const bottom=canvas.getContext('2d').getImageData(W/2,H*.9,1,1).data;assert.ok(bottom[2]>100&&bottom[0]<30,`${aspect}/${fit}/${rotation}: footer covered ${[...bottom]}`);
   const r=mediaLayout(picture,W,H,{scale:1.2,x:.9,y:.9},W,H*frame.height/100,true);assert.ok(Number.isFinite(r.x)&&Number.isFinite(r.y));
  }
 }
}
assert.equal(mediaFrameFor({...base,footer:{width:720,height:200},footerMode:'off'},0),undefined);
assert.equal(mediaFrameFor({...base,footer:{width:720,height:200},footerMode:'intro'},3),undefined);
assert.deepEqual(mediaFrameFor({...base,footer:{width:720,height:200},protectFooter:false,mediaBox:{x:0,y:0,width:100,height:100}},0),{x:0,y:0,width:100,height:100});
const repaired=mediaFrameFor({...base,footer:{width:720,height:250},mediaBox:{x:5,y:90,width:90,height:10}},0);assert.equal(repaired.y,0);assert.ok(repaired.height<81);
assert.ok(mediaFrameFor({...base,footer:{width:720,height:1280},footerSafeHeight:40},0).height<60);
const file=new Blob(['music-bytes'],{type:'audio/wav'});const saved=await saveMusic(file,'Bài của tôi.wav',25);
assert.equal((await readMusic()).length,1);assert.equal((await readMusic())[0].name,'Bài của tôi.wav');assert.equal(await(await readMusic())[0].blob.text(),'music-bytes');
assert.equal((await saveMusic(file,'Tên khác.wav',25)).id,saved.id);assert.equal((await readMusic()).length,1);
await assert.rejects(()=>saveMusic(new Blob(),'',20));await assert.rejects(()=>saveMusic(file,'x',601));
globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.document={querySelectorAll(){return [];}};
const player={currentTime:0,paused:true,pause(){this.paused=true;},async play(){this.paused=false;}};
const track={getBoundingClientRect(){return {left:100,width:500};},setPointerCapture(){}};
let chosen,sourcePlays=0,ui;
function Trim(){const [p,setP]=React.useState({id:'v',name:'Video',url:'video',kind:'video',videoDuration:10,trimStart:0,trimEnd:10});return React.createElement(VideoTrimEditor,{p,onChange:value=>{chosen=value;setP(value);},onSourcePlay:()=>sourcePlays++});}
const mock={createNodeMock:n=>n.type==='video'?player:n.props.className==='trim-track'?track:{}};
await act(async()=>{ui=Renderer.create(React.createElement(Trim),mock);});
const text=n=>typeof n==='string'?n:Array.isArray(n)?n.map(text).join(''):n?.props?.children?text(n.props.children):'';
const button=label=>ui.root.findAllByType('button').find(b=>text(b)===label);
player.currentTime=2.4;await act(async()=>button('Đặt mốc đầu tại đây').props.onClick());assert.equal(chosen.trimStart,2.4);
player.currentTime=7.8;await act(async()=>button('Đặt mốc cuối tại đây').props.onClick());assert.equal(chosen.trimEnd,7.8);
await act(async()=>ui.root.findByProps({'aria-label':'Kéo điểm bắt đầu'}).props.onPointerDown({preventDefault(){},stopPropagation(){},pointerId:1}));
await act(async()=>ui.root.findByProps({className:'trim-track'}).props.onPointerMove({clientX:250}));assert.equal(chosen.trimStart,3);
await act(async()=>ui.root.findByProps({className:'trim-track'}).props.onPointerUp());
await act(async()=>button('Phát đoạn đã chọn').props.onClick());assert.equal(player.currentTime,3);assert.equal(player.paused,false);
player.currentTime=7.9;await act(async()=>ui.root.findByType('video').props.onTimeUpdate());assert.equal(player.paused,true);assert.equal(player.currentTime,7.8);
await act(async()=>ui.unmount());
let selected,errors=[];
const props={revision:0,active:'',disabled:false,onChoose:record=>selected=record,onError:message=>errors.push(message)};
await act(async()=>{ui=Renderer.create(React.createElement(MusicLibrary,props));});await act(async()=>{await new Promise(r=>setTimeout(r,20));});
await act(async()=>ui.root.findByProps({'aria-label':'Dùng nhạc Bài của tôi.wav'}).props.onClick());assert.equal(selected.id,saved.id);
await act(async()=>ui.unmount());
await act(async()=>{ui=Renderer.create(React.createElement(MusicLibrary,props));});await act(async()=>{await new Promise(r=>setTimeout(r,20));});assert.equal(ui.root.findAllByProps({'aria-label':'Dùng nhạc Bài của tôi.wav'}).length,1);
await act(async()=>ui.root.findByProps({'aria-label':'Xóa Bài của tôi.wav khỏi kho nhạc'}).props.onClick());assert.equal((await readMusic()).length,0);assert.deepEqual(errors,[]);await act(async()=>ui.unmount());
console.log('PASS: shuffle/scene mapping, external-file discrimination, actual canvas pixels keep the footer visible in both aspects for contain/cover/manual/rotation, safe-frame fallback/custom size, persisted Blob music with dedup/reopen/delete, and trim markers/pointer handles/selected-segment playback. Browser drag/pointer/codec QA remains unverified; IndexedDB uses fake-indexeddb.');
