'use client';
import {useEffect,useRef,useState} from 'react';
import {drawFrame} from '@/lib/render-news';
import {frameSize} from '@/lib/text-style';
import {templatePreviewData} from '@/lib/template-preview';
import type {FooterTemplate} from '@/lib/template-store';
export default function TemplateCanvas({template,time=1.25,large=false}:{template:FooterTemplate;time?:number;large?:boolean}){const ref=useRef<HTMLCanvasElement>(null),[error,setError]=useState('');const {width,height}=frameSize(template.design?.aspect);useEffect(()=>{let current=true;templatePreviewData(template).then(data=>{if(current&&ref.current){drawFrame(ref.current,time,data);setError('');}}).catch(e=>{if(current)setError((e as Error).message);});return()=>{current=false;};},[template,time]);return <>{error?<div className="template-preview-error">{error}</div>:null}<canvas ref={ref} width={large?width:Math.round(width/4)} height={large?height:Math.round(height/4)} aria-label={`Xem trước mẫu ${template.name}`} style={{aspectRatio:`${width} / ${height}`}}/></>;}
