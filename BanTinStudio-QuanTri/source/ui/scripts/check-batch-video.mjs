import assert from 'node:assert/strict';
import {testModules} from './test-modules.mjs';
const load=testModules(),{batchVisuals,narrationScenes,normalizeBatchVoices,voiceKey}=await import(load('lib/batch-video.ts')),{defaultIntro}=await import(load('lib/intro.ts'));
const pictures=Array.from({length:4},(_,i)=>({id:'p'+i,name:'P'+i,image:{},url:'mock:'+i})),scenes=Array.from({length:4},(_,i)=>({id:'s'+i,text:'Câu thứ '+i,imageId:'p'+i,duration:2})),intro=defaultIntro();
const original=JSON.stringify({pictures,scenes,intro}),variants=batchVisuals(pictures,scenes,intro,24,()=>0);
assert.equal(new Set(variants.map(v=>v.scenes.map(s=>s.imageId).join(','))).size,24,'Use every possible order before repeating even with constant RNG');assert.equal(JSON.stringify({pictures,scenes,intro}),original);
for(let i=0;i<variants.length;i++){assert.deepEqual(variants[i].scenes.map(s=>s.text),scenes.map(s=>s.text));assert.deepEqual(variants[i].scenes.map(s=>s.duration),[2,2,2,2]);if(i)assert.notDeepEqual(variants[i].scenes.map(s=>s.effect),variants[i-1].scenes.map(s=>s.effect));}
assert.equal(new Set(batchVisuals(pictures,scenes.slice(0,1),intro,4,()=>0).map(v=>v.scenes[0].imageId)).size,4,'Orders must differ in visible scenes, not unused tail');
const few=batchVisuals(pictures.slice(0,2),scenes,intro,30,()=>0);assert.equal(new Set(few.map(v=>v.pictures.map(p=>p.id).join(','))).size,2);assert.equal(new Set(few.map(v=>JSON.stringify([v.scenes.map(s=>s.effect),v.motionStrength,v.transition,v.transitionDuration,v.intro.clips.map(c=>c.effect)]))).size,30);
assert.equal(batchVisuals(pictures.slice(0,1),scenes,intro,30).length,30);assert.equal(narrationScenes(scenes,18,6).reduce((n,s)=>n+s.duration,0),12);assert.throws(()=>narrationScenes(scenes,5,6),/rút ngắn/);
const voice={mode:'vieneu',voice:'clone-123',speed:1.2,audio:'data:audio/wav;base64,QUJD',generatedKey:voiceKey('Bản tin','clone-123',1.2)};assert.deepEqual(normalizeBatchVoices({one:voice}).one.generatedKey,voice.generatedKey);assert.notEqual(voiceKey('Tin khác',voice.voice,voice.speed),voice.generatedKey);assert.throws(()=>normalizeBatchVoices({one:{...voice,audio:'https://other/audio.wav'}}));
console.log('PASS: all 24 permutations, visible-scene uniqueness, exhaustion with 1/2 media, 30 motion combinations, immutable script/editor data, intro-aware narration fit, voice cache key and embedded-audio validation.');
