// Narration/music start at zero; only body video sound is placed after the visual intro.
// Intro source audio and legacy intro SFX are excluded.
export function offsetBodyAudio(clips:AudioBuffer|null,offset:number,duration:number):AudioBuffer|null{
 if(!clips)return null;const rate=clips.sampleRate,output=new AudioBuffer({length:Math.max(1,Math.ceil(duration*rate)),numberOfChannels:clips.numberOfChannels,sampleRate:rate}),start=Math.round(offset*rate);
 for(let c=0;c<output.numberOfChannels;c++){const dst=output.getChannelData(c),src=clips.getChannelData(c);if(start<dst.length)dst.set(src.subarray(0,dst.length-start),start);}return output;
}
