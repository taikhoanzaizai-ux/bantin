import type {Picture,Scene} from './news';
export function shuffledMedia<T>(items:T[],random:()=>number=Math.random):T[]{
 const next=[...items];for(let i=next.length-1;i>0;i--){const j=Math.min(i,Math.max(0,Math.floor(random()*(i+1))));[next[i],next[j]]=[next[j],next[i]];}
 if(next.length>1&&next.every((v,i)=>v===items[i]))[next[0],next[1]]=[next[1],next[0]];
 return next;
}
export function scenesForOrder(scenes:Scene[],pictures:Picture[]){return pictures.length?scenes.map((scene,i)=>({...scene,imageId:pictures[i%pictures.length].id})):scenes;}
export function isFileDrag(data:Pick<DataTransfer,'types'|'files'>){return Array.from(data.types||[]).includes('Files')||!!data.files?.length;}
