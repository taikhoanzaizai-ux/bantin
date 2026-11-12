"""Change speech duration without changing sample rate or intended pitch."""
import math

def change_speech_speed(audio, speed=1.0):
    if isinstance(speed, bool) or not math.isfinite(speed) or not .75 <= speed <= 1.5:
        raise ValueError('Tốc độ đọc phải từ 0.75 đến 1.50.')
    if speed == 1.0:
        return audio
    # librosa is already a required dependency of vieneu==3.8.3.
    import librosa
    import numpy as np
    samples = np.asarray(audio, dtype=np.float32)
    if samples.ndim != 1 or samples.size == 0 or not np.isfinite(samples).all():
        raise ValueError('Âm thanh lời đọc không hợp lệ.')
    return librosa.effects.time_stretch(samples, rate=speed)
