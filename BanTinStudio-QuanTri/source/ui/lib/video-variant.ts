import {footerOverrides,type TemplateFooter} from './template-footer';
import {textOverrides,type TemplateText} from './template-text';
import type {RenderData} from './render-news';
import type {FooterTemplate} from './template-store';
import {templateAssets} from './template-preview';
import {prepareIntroTemplate} from './intro-template';
import {designOverrides,loadTemplateFonts} from './template-design';
export async function templateVariant(base:RenderData,t:FooterTemplate|null,active:string,templates:FooterTemplate[],text?:TemplateText,footer?:TemplateFooter){let d={...base};if(t&&t.id!==active){const a=await templateAssets(t);d={...d,footerGradient:undefined,footerOpacity:1,mediaBox:undefined,logoBox:undefined,templateSource:undefined,templateDate:undefined,...(t.design?designOverrides(t.design):{}),footer:a.footer,logo:t.design?a.logo:base.logo,footerMode:t.mode,footerPlacement:t.placement,footerScale:t.scale,footerBottom:t.bottom};}d={...d,...footerOverrides(footer)};d.introTemplate=await prepareIntroTemplate(d.intro?.footerId,templates);if(text){await loadTemplateFonts(text.fonts);const overrides=textOverrides(text);d={...d,...overrides,introTemplate:d.introTemplate?{...d.introTemplate,...overrides}:undefined};}return d;}
