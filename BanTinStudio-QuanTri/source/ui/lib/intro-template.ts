import type {RenderData} from './render-news';
import type {FooterTemplate} from './template-store';
import {templateAssets} from './template-preview';
import {designOverrides} from './template-design';
export type IntroAppearance=Partial<Omit<RenderData,'intro'|'introTemplate'|'pictures'|'scenes'|'videoFrames'>>;
export async function prepareIntroTemplate(id:string|undefined,templates:FooterTemplate[]):Promise<IntroAppearance|undefined>{
 if(!id||id==='inherit'||id==='off')return undefined;
 const template=templates.find(t=>t.id===id);if(!template)throw Error('Mẫu chân trang intro đã bị xóa. Chọn lại mẫu hoặc dùng mẫu bản tin.');
 const assets=await templateAssets(template);
 return {protectFooter:true,footerSafeHeight:0,footerGradient:undefined,footerOpacity:1,mediaBox:undefined,logoBox:undefined,templateSource:undefined,templateDate:undefined,...(template.design?designOverrides(template.design):{}),footer:assets.footer,logo:assets.logo,footerPlacement:template.placement,footerScale:template.scale,footerBottom:template.bottom};
}
