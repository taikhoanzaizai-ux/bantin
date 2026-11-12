import { positionAt, type Picture, type Scene } from './news';
export function trimRange(p: Picture) { const start = Math.max(0, Math.min(p.trimStart || 0, Math.max(0, (p.videoDuration || 1) - .1))); return { start, end: Math.max(start + .1, Math.min(p.trimEnd ?? p.videoDuration ?? 1, p.videoDuration || 1)) }; }
export function sourceTime(p: Picture, elapsed: number) { const { start, end } = trimRange(p), length = end - start; return start + (p.playback !== 'hold' ? Math.max(0, elapsed) % length : Math.min(Math.max(0, elapsed), Math.max(0, length - .001))); }
export function mediaLayout(p: Picture, w: number, h: number, m = { scale: 1, x: .5, y: .5 },W=720,H=1280,constrain=false) {
    const sx = w * (p.cropLeft || 0) / 100, sy = h * (p.cropTop || 0) / 100, sw = w * (1 - ((p.cropLeft || 0) + (p.cropRight || 0)) / 100), sh = h * (1 - ((p.cropTop || 0) + (p.cropBottom || 0)) / 100);
    const angle=(p.rotation||0)*Math.PI/180,rw=Math.abs(sw*Math.cos(angle))+Math.abs(sh*Math.sin(angle)),rh=Math.abs(sw*Math.sin(angle))+Math.abs(sh*Math.cos(angle));
    const fit = p.fit || 'contain', base = fit === 'cover' ? Math.max((W*Math.abs(Math.cos(angle))+H*Math.abs(Math.sin(angle)))/sw,(W*Math.abs(Math.sin(angle))+H*Math.abs(Math.cos(angle)))/sh) : Math.min(W / rw, H / rh), factor = base * (fit === 'manual' ? (p.scale || 1) : 1) * m.scale, dw = sw * factor, dh = sh * factor;
    // Express travel in frame units: an exact-fit image must still visibly pan.
    let x=(W-dw)/2+(.5-m.x)*W+(p.offsetX||0)*W/200,y=(H-dh)/2+(.5-m.y)*H+(p.offsetY||0)*H/200;
    if(constrain){const bw=Math.abs(dw*Math.cos(angle))+Math.abs(dh*Math.sin(angle)),bh=Math.abs(dw*Math.sin(angle))+Math.abs(dh*Math.cos(angle));const bound=(center:number,size:number,total:number)=>Math.max(Math.min(size/2,total-size/2),Math.min(Math.max(size/2,total-size/2),center));x=bound(x+dw/2,bw,W)-dw/2;y=bound(y+dh/2,bh,H)-dh/2;}
    return {sx,sy,sw,sh,dw,dh,x,y};
}
async function inputFor(url: string) { const m = await import('mediabunny'); return { m, input: new m.Input({ formats: m.ALL_FORMATS, source: new m.BlobSource(await (await fetch(url)).blob()) }) }; }
export async function loadVideo(url: string) {
    const { m, input } = await inputFor(url);
    try {
        const track = await input.getPrimaryVideoTrack();
        if (!track || !await track.canDecode())
            throw new Error('Trình duyệt không giải mã được video này. Hãy đổi sang MP4 H.264 hoặc WebM.');
        const duration = await track.computeDuration() - Math.max(0, await track.getFirstTimestamp());
        if (!Number.isFinite(duration) || duration < .1 || duration > 1800)
            throw new Error('Chọn video từ 0,1 giây đến 30 phút.');
        const sink = new m.CanvasSink(track, { width: Math.min(1280, await track.getDisplayWidth()), poolSize: 2 }), first = await sink.getCanvas(Math.max(0, await track.getFirstTimestamp()));
        if (!first)
            throw new Error('Không đọc được khung hình video.');
        const canvas = document.createElement('canvas');
        canvas.width = first.canvas.width;
        canvas.height = first.canvas.height;
        canvas.getContext('2d')!.drawImage(first.canvas, 0, 0);
        const image = new Image();
        image.src = canvas.toDataURL('image/jpeg', .8);
        await image.decode();
        const audio = await input.getPrimaryAudioTrack();
        if (audio && !await audio.canDecode())
            throw new Error('Không giải mã được âm thanh video. Hãy chuyển video sang MP4 H.264/AAC.');
        return { image, videoDuration: duration };
    }
    finally {
        input.dispose();
    }
}
// One decoder per scene keeps transitions independent. Sequential requests use one
// decoding stream instead of seeking back to a keyframe on every preview frame.
export class VideoFrames {
    constructor(private fps = 25, private maxWidth = 960) { }
    private readers = new Map<string, Promise<{
        input: import('mediabunny').Input;
        sink: import('mediabunny').CanvasSink;
        origin: number;
        iterator: AsyncGenerator<import('mediabunny').WrappedCanvas | null> | null;
        nextTime: number;
        last: CanvasImageSource | null;
        lastTarget: number;
    }>>();
    async frames(pictures: Picture[], scenes: Scene[], time: number) {
        const out = new Map<number, CanvasImageSource>(), pos = positionAt(scenes, time);
        if (!pos) return out;
        const indices = Array.from(new Set([Math.max(0, pos.index - 1), pos.index]));
        const keys = new Set(indices.map(i => pictures.find(p => p.id === scenes[i].imageId)?.url + ':' + i));
        for (const [key, promise] of this.readers) if (!keys.has(key)) {
            this.readers.delete(key);
            void promise.then(async r => { await r.iterator?.return(null); r.input.dispose(); }).catch(() => {});
        }
        for (const index of indices) {
            const scene = scenes[index], pic = pictures.find(p => p.id === scene.imageId);
            if (pic?.kind !== 'video') continue;
            const key = pic.url + ':' + index;
            let reader = this.readers.get(key);
            if (!reader) {
                reader = inputFor(pic.url).then(async ({m, input}) => {
                    try {
                        const track = await input.getPrimaryVideoTrack();
                        if (!track || !await track.canDecode()) throw new Error('Không giải mã được ' + pic.name);
                        return {input, sink: new m.CanvasSink(track, {width: Math.min(this.maxWidth, await track.getDisplayWidth()), poolSize: 2}), origin: Math.max(0, await track.getFirstTimestamp()), iterator: null, nextTime: 0, last: null, lastTarget: -1};
                    } catch (e) { input.dispose(); throw e; }
                });
                this.readers.set(key, reader);
            }
            const r = await reader, elapsed = index === pos.index ? pos.progress * scene.duration : scene.duration, target = sourceTime(pic, elapsed);
            const step = 1 / Math.max(1, this.fps);
            if (!r.last || Math.abs(target - r.lastTarget) > 1e-7) {
                // A backward seek/loop or a large scrub starts a fresh stream. Small
                // forward steps reuse decoded packets and never build a frame backlog.
                if (!r.iterator || target < r.lastTarget - 1e-7 || target - r.nextTime > .5) {
                    await r.iterator?.return(null);
                    const origin = r.origin, end = pic.videoDuration || trimRange(pic).end;
                    function* timestamps() {
                        for (let n = 0; ; n++) {
                            const t = target + n * step;
                            if (t >= end) break;
                            yield origin + t;
                        }
                    }
                    r.iterator = r.sink.canvasesAtTimestamps(timestamps());
                    r.nextTime = target;
                    r.last = null;
                }
                while (r.nextTime <= target + 1e-7) {
                    const frame = await r.iterator.next();
                    if (frame.done) { r.iterator = null; break; }
                    r.nextTime += step;
                    if (frame.value) r.last = frame.value.canvas;
                }
                r.lastTarget = target;
            }
            if (!r.last) throw new Error('Không đọc được khung hình: ' + pic.name);
            out.set(index, r.last);
        }
        return out;
    }
    dispose() {
        for (const promise of this.readers.values()) void promise.then(async r => { await r.iterator?.return(null); r.input.dispose(); }).catch(() => {});
        this.readers.clear();
    }
}
export async function clipAudio(pictures: Picture[], scenes: Scene[]) {
    const audible = pictures.filter(p => p.kind === 'video' && !p.muted && (p.volume ?? 1) > 0 && scenes.some(s => s.imageId === p.id));
    if (!audible.length)
        return null;
    const rate = 44100, duration = scenes.reduce((sum, s) => sum + s.duration, 0), out = new AudioBuffer({ length: Math.max(1, Math.ceil(duration * rate)), numberOfChannels: 2, sampleRate: rate });
    for (const p of audible) {
        const { m, input } = await inputFor(p.url);
        try {
            const track = await input.getPrimaryAudioTrack();
            if (!track)
                continue;
            if (!await track.canDecode())
                throw new Error('Không đọc được âm thanh ' + p.name);
            const range = trimRange(p), start = range.start, end = Math.min(range.end, start + Math.max(...scenes.filter(s => s.imageId === p.id).map(s => s.duration))), origin = Math.max(0, await (await input.getPrimaryVideoTrack())?.getFirstTimestamp() || 0), sink = new m.AudioBufferSink(track), n = Math.ceil((end - start) * rate), channels = [new Float32Array(n), new Float32Array(n)];
            for await (const chunk of sink.buffers(origin + start, origin + end)) {
                const b = chunk.buffer;
                const first = Math.max(0, Math.ceil((chunk.timestamp - origin - start) * rate)), last = Math.min(n, Math.ceil((chunk.timestamp - origin - start + b.duration) * rate));
                for (let dst = first; dst < last; dst++) {
                    const at = (dst / rate + origin + start - chunk.timestamp) * b.sampleRate, j = Math.floor(at), f = at - j;
                    for (let c = 0; c < 2; c++) {
                        const ch = b.getChannelData(Math.min(c, b.numberOfChannels - 1));
                        channels[c][dst] = (ch[j] || 0) * (1 - f) + (ch[j + 1] ?? ch[j] ?? 0) * f;
                    }
                }
            }
            let offset = 0;
            for (const scene of scenes) {
                if (scene.imageId === p.id) {
                    const length = Math.ceil(scene.duration * rate), base = Math.round(offset * rate);
                    for (let i = 0; i < length && base + i < out.length; i++) {
                        if (p.playback === 'hold' && i >= n)
                            break;
                        for (let c = 0; c < 2; c++)
                            out.getChannelData(c)[base + i] += channels[c][i % n] * (p.volume ?? 1);
                    }
                }
                offset += scene.duration;
            }
        }
        finally {
            input.dispose();
        }
    }
    return out;
}
export function addClipAudio(base: AudioBuffer | null, clips: AudioBuffer | null) { if (!clips)
    return base; if (!base) {
    let peak = 1;
    for (let c = 0; c < clips.numberOfChannels; c++)
        for (const v of clips.getChannelData(c))
            peak = Math.max(peak, Math.abs(v) / .98);
    if (peak > 1)
        for (let c = 0; c < clips.numberOfChannels; c++) {
            const ch = clips.getChannelData(c);
            for (let i = 0; i < ch.length; i++)
                ch[i] /= peak;
        }
    return clips;
} const out = new AudioBuffer({ length: clips.length, numberOfChannels: 2, sampleRate: clips.sampleRate }); let peak = 1; for (let c = 0; c < 2; c++) {
    const dst = out.getChannelData(c), a = base.getChannelData(Math.min(c, base.numberOfChannels - 1)), b = clips.getChannelData(c);
    for (let i = 0; i < dst.length; i++) {
        const pos = i * base.sampleRate / clips.sampleRate, j = Math.floor(pos), f = pos - j;
        dst[i] = (a[j] || 0) * (1 - f) + (a[j + 1] || 0) * f + b[i];
        peak = Math.max(peak, Math.abs(dst[i]) / .98);
    }
} if (peak > 1)
    for (let c = 0; c < 2; c++) {
        const dst = out.getChannelData(c);
        for (let i = 0; i < dst.length; i++)
            dst[i] /= peak;
    } return out; }
