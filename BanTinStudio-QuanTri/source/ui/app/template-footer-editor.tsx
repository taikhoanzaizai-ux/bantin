'use client';
import type {TemplateFooter} from '@/lib/template-footer';
export default function TemplateFooterEditor({name,value,custom,busy,onChange,onReset}:{name:string;value:TemplateFooter;custom:boolean;busy:boolean;onChange:(value:TemplateFooter)=>void;onReset:()=>void}){
 const patch=(v:Partial<TemplateFooter>)=>onChange({...value,...v});
 return <details className="editor-disclosure template-footer-editor"><summary>Chân trang riêng · {name}</summary><fieldset className="disclosure-body" disabled={busy}>
 <p className="micro">Chỉnh riêng video này; Lưu dự án để giữ lại. Preview và file xuất dùng cùng thiết lập; mốc đầu nội dung tính sau intro.</p>
 <label className="field-label">Hiển thị chân video<select aria-label={`Hiển thị chân video · ${name}`} value={value.mode} onChange={e=>patch({mode:e.target.value as TemplateFooter['mode']})}><option value="intro">Chỉ đầu nội dung · sau intro</option><option value="full">Suốt phần bản tin · sau intro</option><option value="off">Ẩn chân trang</option></select></label>
 {value.mode==='intro'&&<label className="field-label">Số giây hiện ở đầu nội dung<input aria-label={`Thời gian chân trang · ${name}`} type="number" min={1} max={30} step={.5} value={value.introDuration} onChange={e=>patch({introDuration:Number(e.target.value)})}/></label>}
 <label className="field-label">Cách đặt chân trang<select aria-label={`Vị trí chân trang · ${name}`} value={value.placement} onChange={e=>patch({placement:e.target.value as TemplateFooter['placement']})}><option value="bottom">Căn dưới</option><option value="full">Căn giữa khung</option></select></label>
 <label className="media-slider">Chiều rộng · {Math.round(value.scale*100)}%<input aria-label={`Chiều rộng chân trang · ${name}`} type="range" min={.1} max={1} step={.01} value={value.scale} onChange={e=>patch({scale:Number(e.target.value)})}/></label>
 <label className="media-slider">Cách mép dưới · {value.bottom} px<input aria-label={`Cách mép chân trang · ${name}`} type="range" min={0} max={500} step={5} value={value.bottom} onChange={e=>patch({bottom:Number(e.target.value)})}/></label>
 <label className="consent-row"><input aria-label={`Vùng an toàn · ${name}`} type="checkbox" checked={value.protect} onChange={e=>patch({protect:e.target.checked})}/>Giữ tư liệu trong vùng an toàn phía trên chân trang</label>
 <label className="field-label">Chiều cao vùng dành cho chân trang · 0 = tự tính<input aria-label={`Chiều cao vùng chân trang · ${name}`} type="number" min={0} max={80} step={1} value={value.safeHeight} onChange={e=>patch({safeHeight:Number(e.target.value)})}/></label>
 <button className="text-link" disabled={!custom} onClick={onReset}>Dùng lại chân trang gốc của mẫu</button>
 </fieldset></details>;
}
