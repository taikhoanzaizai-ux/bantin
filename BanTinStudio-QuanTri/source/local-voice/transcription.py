"""Speech-derived timestamps for subtitles; independent from the TTS model."""
import io
import threading
import wave

MODEL = None
MODEL_NAME = None
LOCK = threading.RLock()


def warm_model(model_name='small'):
    global MODEL, MODEL_NAME
    if model_name not in ('base','small'):raise ValueError('Chọn base hoặc small.')
    with LOCK:
        if MODEL is None or MODEL_NAME != model_name:
            from faster_whisper import WhisperModel
            MODEL = WhisperModel(model_name, device='cpu', compute_type='int8')
            MODEL_NAME = model_name
        return MODEL


def transcribe_wav(audio: bytes, model_name='small'):
    global MODEL, MODEL_NAME
    if model_name not in ('base', 'small'):
        raise ValueError('Chọn mô hình phụ đề base hoặc small.')
    if not audio or len(audio) > 10_000_000:
        raise ValueError('Lời đọc WAV mono 16 kHz tối đa 5 phút / 10 MB.')
    try:
        with wave.open(io.BytesIO(audio)) as clip:
            duration = clip.getnframes() / clip.getframerate()
            if clip.getnchannels() != 1 or clip.getsampwidth() != 2 or clip.getframerate() != 16000 or not .1 <= duration <= 300.1:
                raise ValueError()
            pcm = clip.readframes(clip.getnframes())
            if len(pcm) != clip.getnframes() * 2:
                raise ValueError()
    except Exception as error:
        raise ValueError('Cần WAV PCM16 mono 16 kHz, tối đa 5 phút. Hãy chọn lại file lời đọc trên website.') from error
    with LOCK:
        warm_model(model_name)
        # The bridge only accepts PCM16 WAV, so decode directly. This also avoids
        # incompatible av.open(metadata_errors=...) across recent PyAV versions.
        import numpy as np
        samples = np.frombuffer(pcm, dtype='<i2').astype(np.float32) / 32768.0
        segments, _ = MODEL.transcribe(samples, language='vi', beam_size=5, word_timestamps=True, vad_filter=True, condition_on_previous_text=False)
        words = []
        for segment in segments:
            for word in segment.words or []:
                start = max(0., float(word.start))
                end = min(duration, float(word.end))
                if word.word.strip() and end > start:
                    words.append({'text': word.word.strip(), 'start': round(start, 3), 'end': round(end, 3)})
        return {'words': words, 'duration': duration, 'source': 'faster-whisper-' + model_name}
