import assert from 'node:assert/strict';
import {testModules} from './test-modules.mjs';
// A strict decoding stub checks timestamp order and pipeline reuse. It does not
// stand in for native Chrome/Windows codec QA.
globalThis.videoQA={streams:0,reads:0,closed:0,disposed:0,seeks:0,widths:[]};
const load=testModules({'mediabunny':`
 export const ALL_FORMATS=[];export class BlobSource{constructor(blob){}}
 export class Input{async getPrimaryVideoTrack(){return {async canDecode(){return true;},async getDisplayWidth(){return 1920;},async getFirstTimestamp(){return .4;}};}async getPrimaryAudioTrack(){return {async canDecode(){return true;}};}dispose(){globalThis.videoQA.disposed++;}}
 export class AudioBufferSink{async *buffers(){const buffer=new AudioBuffer({length:66150,numberOfChannels:1,sampleRate:44100});buffer.getChannelData(0).fill(.2);yield {timestamp:.65,buffer};}}
 export class CanvasSink{constructor(track,options){globalThis.videoQA.widths.push(options.width);}
 async getCanvas(){globalThis.videoQA.seeks++;throw Error('Per-frame random seek must not be used');}
 async *canvasesAtTimestamps(timestamps){globalThis.videoQA.streams++;let last=-Infinity;try{for await(const t of timestamps){if(t<last)throw Error('Nonmonotonic decoder stream');last=t;globalThis.videoQA.reads++;yield {canvas:{timestamp:t}};}}finally{globalThis.videoQA.closed++;}}}
`});
const {VideoFrames,sourceTime,clipAudio}=await import(load('lib/media.ts'));
const pic={id:'v',name:'Clip ngắn',url:'data:video/mp4;base64,AA==',kind:'video',videoDuration:2,trimStart:.25,trimEnd:1.75};
assert.equal(sourceTime(pic,2),.75,'A short clip must keep playing by default');
assert.equal(sourceTime({...pic,playback:'hold'},2),1.749,'Explicit hold stays supported');
assert.equal(sourceTime({...pic,playback:'loop'},2),.75);
const scene={id:'s',imageId:'v',text:'',duration:12};
for(const fps of [25,30]){
 const d=new VideoFrames(fps),samples=[];const before=videoQA.streams;
 for(let i=0;i<12*fps;i++){
  const t=i/fps,frame=(await d.frames([pic],[scene],t)).get(0);
  samples.push(frame.timestamp);
  assert.ok(Math.abs(frame.timestamp-(.4+sourceTime(pic,t)))<=1/fps+1e-6,'Decoded frame follows trimmed/looped source time');
 }
 assert.ok(new Set(samples.slice(3*fps)).size>fps,'Frames still advance after the first loop');
 assert.ok(videoQA.streams-before<12,'Sequential preview/export reuses decoding streams');
 for(const t of [9.2,.1,6.3,.5,11.9,0])assert.ok(Math.abs((await d.frames([pic],[scene],t)).get(0).timestamp-(.4+sourceTime(pic,t)))<.05,'Scrubbing backward/forward works');
 const longer=[{...scene,duration:24}];assert.ok((await d.frames([pic],longer,20)).has(0),'Scene timing can change without stale timestamp schedules');
 const hold={...pic,playback:'hold'};const a=(await d.frames([hold],[scene],9)).get(0),reads=videoQA.reads,b=(await d.frames([hold],[scene],10)).get(0);assert.equal(a,b);assert.equal(videoQA.reads,reads,'Explicit hold reuses last decoded frame');
 const scenes=[{...scene,duration:2},{...scene,id:'s2',duration:3}];const both=await d.frames([pic],scenes,2.2);assert.equal(both.size,2);assert.notEqual(both.get(0).timestamp,both.get(1).timestamp,'Same video decodes independently on both sides of a transition');
 d.dispose();await new Promise(setImmediate);
}
const full=new VideoFrames(25,1920);await full.frames([pic],[scene],0);full.dispose();await new Promise(setImmediate);assert.ok(videoQA.widths.includes(960)&&videoQA.widths.includes(1920));assert.equal(videoQA.seeks,0);assert.equal(videoQA.closed,videoQA.streams);
// Original clip audio repeats with the same default as sourceTime, including trim.
globalThis.AudioBuffer=class{constructor({length,numberOfChannels,sampleRate}){Object.assign(this,{length,numberOfChannels,sampleRate,duration:length/sampleRate});this.channels=Array.from({length:numberOfChannels},()=>new Float32Array(length));}getChannelData(i){return this.channels[i];}};
console.log('PASS: 12-second sequential video at 25/30 fps, repeated trims, independent transition readers, backward/forward seeks, timing changes, explicit hold, decoder cleanup, and separate preview/export resolution. Codec is mocked.');

const audible={...pic,muted:false,volume:1};const loopAudio=await clipAudio([audible],[{...scene,duration:4.5}]),holdAudio=await clipAudio([{...audible,playback:'hold'}],[{...scene,duration:4.5}]);assert.ok(loopAudio.getChannelData(0)[44100*4]>.19);assert.equal(holdAudio.getChannelData(0)[44100*4],0);assert.equal(await clipAudio([{...audible,muted:true}],[scene]),null);console.log('PASS: repeated original audio follows video looping; explicit hold stops original audio and muted clips stay silent.');
