import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';import Renderer,{act} from 'react-test-renderer';
import {createCanvas,GlobalFonts} from '@napi-rs/canvas';
import {testModules} from './test-modules.mjs';
const load=testModules(),colors=await import(load('lib/text-colors.ts')),{defaultTextStyles,normalizeTextStyles,drawStyledText,textLines}=await import(load('lib/text-style.ts')),{validateCues}=await import(load('lib/captions.ts')),{captionDisplay}=await import(load('lib/caption-presets.ts')),{default:Input}=await import(load('app/color-text-input.tsx'));
const text='Một hai ba bốn năm sáu bảy tám chín mười. Phần còn lại';const end=text.indexOf('.');
let ranges=colors.paintRange(text,[],0,end,'#ff0000');assert.equal(ranges[0].end,end);
ranges=colors.paintRange(text,ranges,4,7,'#0000ff');assert.deepEqual(ranges.map(r=>[r.start,r.end,r.color]),[[0,4,'#ff0000'],[4,7,'#0000ff'],[7,end,'#ff0000']]);
ranges=colors.paintRange(text,ranges,4,7);assert.deepEqual(ranges.map(r=>[r.start,r.end]),[[0,4],[7,end]]);
let moved=colors.editColorRanges(text,'Tin: '+text,ranges);assert.equal(moved[0].start,5);assert.equal(moved[1].end,end+5);
const unicode='A a\u0306\u0301 😀 Z';assert.equal(colors.paintRange(unicode,[],3,4,'#abcdef')[0].start,2);assert.equal(colors.paintRange(unicode,[],7,8,'#abcdef')[0].end,8);
const normalized=normalizeTextStyles({title:{colorRanges:[...ranges,{text,start:-1,end:3,color:'#ffffff'},{text,start:1,end:2,color:'red'}]}});assert.deepEqual(normalized.title.colorRanges,ranges);
assert.deepEqual(validateCues([{id:'a',text,start:0,end:4,colorRanges:ranges}])[0].colorRanges,ranges);
const repeat='Tin Tin mới',cue={text:repeat,id:'r',start:0,end:3,words:[{text:'Tin',start:0,end:1},{text:'Tin',start:1,end:2},{text:'mới',start:2,end:3}]},repeated=colors.paintRange(repeat,[],4,7,'#123456');for(const mode of ['line','highlight','word','reveal']){const d=captionDisplay(cue,1.5,mode),mapped=colors.displayColorRanges(repeat,d.text,repeated,d.offset);assert.equal(mapped[0].start,mode==='word'?0:4);assert.equal(mapped[0].color,'#123456');}
// Native canvas pixels: two ranges survive wrapping, uppercase, spacing, outline and full-HD scale.
GlobalFonts.registerFromPath('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf','Arial');
const base={...defaultTextStyles().title,size:44,bold:false,x:0,y:0,width:100,maxLines:10,backgroundOpacity:0,shadowBlur:0,strokeWidth:0,color:'#ffffff'};
for(const letterCase of ['original','upper','title'])for(const spacing of [0,2]){
 const sample='Tin nóng\nĐây là bản tin mới',r=colors.paintRange(sample,[],0,8,'#ff0000'),canvas=createCanvas(720,400),c=canvas.getContext('2d');drawStyledText(c,sample,{...base,colorRanges:r,letterCase,spacing},720,400);const px=c.getImageData(0,0,720,400).data;let red=0,white=0;for(let i=0;i<px.length;i+=4){if(px[i+3]>200&&px[i]>230&&px[i+1]<20)red++;if(px[i+3]>200&&px[i]>230&&px[i+1]>230)white++;}assert.ok(red>200&&white>200,`${letterCase}/${spacing}: coloured and default pixels`);
}
const c=createCanvas(280,400).getContext('2d');assert.ok(textLines(c,text,{...base,size:30},250).length>2);
const sample=createCanvas(720,400);drawStyledText(sample.getContext('2d'),text,{...base,width:92,colorRanges:colors.paintRange(text,[],0,end,'#ffdb33')},720,400);fs.writeFileSync('/tmp/rich-colors113.png',sample.toBuffer('image/png'));
globalThis.IS_REACT_ACT_ENVIRONMENT=true;let current;function Harness(){const [value,setValue]=React.useState({text,ranges:[]});current=value;return React.createElement(Input,{label:'Thử màu',value:value.text,ranges:value.ranges,onChange:(text,ranges)=>setValue({text,ranges})});}
let ui;await act(async()=>ui=Renderer.create(React.createElement(Harness)));const field=()=>ui.root.findByType('textarea'),picker=()=>ui.root.findByProps({'aria-label':'Màu đoạn chọn · Thử màu'});
assert.equal(picker().props.disabled,true);await act(async()=>field().props.onSelect({currentTarget:{selectionStart:0,selectionEnd:end}}));assert.equal(picker().props.disabled,false);await act(async()=>picker().props.onChange({target:{value:'#ee1122'}}));assert.equal(current.ranges[0].end,end);assert.equal(current.ranges[0].color,'#ee1122');
await act(async()=>picker().props.onChange({target:{value:'#11ee22'}}));assert.equal(current.ranges.length,1,'Repeated picker changes keep the same saved selection');assert.equal(current.ranges[0].color,'#11ee22');
await act(async()=>field().props.onChange({target:{value:'Tin: '+text,selectionStart:5,selectionEnd:5}}));assert.equal(current.ranges[0].start,5);assert.equal(picker().props.disabled,true);
await act(async()=>ui.unmount());console.log('PASS: 10-word selection, overlapping colours/removal, edits shift offsets, Unicode graphemes/emoji, validation/project data, repeated timed words in all caption modes, real canvas pixels/case/wrap/spacing, and picker selection retained across focus changes. Browser colour dialog and Windows not exercised.');
