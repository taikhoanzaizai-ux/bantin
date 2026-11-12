"""Bản Tin Studio local bridge for the Apache-2.0 VieNeu-TTS SDK.
Models and inference run on this computer, never in the Sites worker.
"""
from __future__ import annotations
import hmac, inspect, io, json, logging, os, re, secrets, tempfile, threading, uuid, wave
from pathlib import Path
from typing import Optional
from fastapi import FastAPI, Depends, File, Form, Header, HTTPException, UploadFile, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse
from pydantic import BaseModel, Field
import uvicorn

SITE_ORIGIN = os.environ.get('SITE_ORIGIN', 'http://127.0.0.1:8787').rstrip('/')
TOKEN = os.environ.get('STUDIO_PAIRING_CODE') or secrets.token_urlsafe(24)
DATA = Path(os.environ.get('STUDIO_VOICE_DATA', str(Path(__file__).parent / 'my-voices')))
LOCK = threading.Lock()
MODEL = None
app = FastAPI(title='Bản Tin Studio — VieNeu local', docs_url=None, redoc_url=None)
cors_options = {'allow_private_network': True} if 'allow_private_network' in inspect.signature(CORSMiddleware).parameters else {}
app.add_middleware(CORSMiddleware, **cors_options, allow_origins=[SITE_ORIGIN], allow_methods=['GET', 'POST', 'OPTIONS'], allow_headers=['Authorization', 'Content-Type'], max_age=600)

@app.middleware('http')
async def local_boundary(request: Request, call_next):
    origin = request.headers.get('origin')
    if origin and origin != SITE_ORIGIN:
        return JSONResponse({'error': 'Website này chưa được ghép nối.'}, status_code=403)
    response = await call_next(request)
    response.headers['Cache-Control'] = 'no-store'
    if origin == SITE_ORIGIN and request.method == 'OPTIONS':
        response.headers['Access-Control-Allow-Private-Network'] = 'true'
    return response

def auth(authorization: Optional[str] = Header(None)):
    if not hmac.compare_digest((authorization or '').encode(), ('Bearer ' + TOKEN).encode()):
        raise HTTPException(401, 'Mã ghép nối chưa đúng. Xem mã trong cửa sổ bộ chạy VieNeu.')

def engine():
    global MODEL
    if MODEL is None:
        try:
            from model_files import install_model_copy_fix
            install_model_copy_fix(Path(os.environ.get('STUDIO_MODEL_DIR', str(Path(__file__).parent / 'models-local'))))
            from vieneu import Vieneu
            print('Đang nạp mô hình; các tệp ONNX và trọng số được sao chép về models-local.', flush=True)
            candidate = Vieneu(mode='v3turbo', backend='onnx', precision='fp32')
        except Exception as error:
            logging.exception('Không nạp được mô hình VieNeu')
            text = str(error).lower()
            if 'external data' in text or 'escapes model directory' in text:
                detail = 'Lỗi vị trí tệp mô hình ONNX. Hãy cập nhật cả server.py và model_files.py từ bộ chạy mới, rồi khởi động lại.'
            elif isinstance(error, OSError):
                detail = 'Chưa tải hoặc sao chép được mô hình. Kiểm tra Internet, dung lượng trống và quyền ghi thư mục bộ chạy.'
            else:
                detail = 'VieNeu chưa nạp được mô hình. Kiểm tra thông báo trong cửa sổ bộ chạy rồi thử lại.'
            raise HTTPException(503, detail) from error
        if DATA.exists():
            for meta_path in sorted(DATA.glob('*.json')):
                try:
                    meta = json.loads(meta_path.read_text(encoding='utf-8'))
                    wav_path = DATA / (meta_path.stem + '.wav')
                    if wav_path.exists():
                        candidate.add_voice(meta['name'], str(wav_path), denoise=True)
                except Exception as error:
                    logging.warning('Chưa nạp được giọng đã lưu %s: %s: %s',meta_path.name,type(error).__name__,str(error))
        MODEL = candidate
    return MODEL

@app.get('/health', dependencies=[Depends(auth)])
def health():
    return {'status': 'ok', 'engine': 'VieNeu-TTS v3 Turbo', 'model_loaded': MODEL is not None, 'protocol': 'ban-tin-local-v1', 'bridge_version': '1.4', 'capabilities': ['tts', 'transcribe', 'speech-speed']}

@app.post('/v1/audio/transcribe', dependencies=[Depends(auth)])
def transcribe(file: UploadFile = File(...), model: str = Form('small')):
    from transcription import transcribe_wav
    try:
        return transcribe_wav(file.file.read(10_000_001), model)
    except ValueError as error:
        raise HTTPException(400, str(error)) from error
    except ImportError as error:
        raise HTTPException(503, 'Chưa cài đủ thư viện phụ đề. Bấm Chuẩn bị / sửa thư viện trong tool khi có Internet. Bạn vẫn có thể tạo giọng hoặc xuất khi tắt phụ đề.') from error
    except Exception as error:
        logging.exception('Không nhận dạng được lời đọc')
        raise HTTPException(503, 'Chưa căn được phụ đề. Lần đầu cần Internet để tải mô hình Whisper. Xem cửa sổ bộ chạy và thử lại.') from error

@app.post('/v1/prepare', dependencies=[Depends(auth)])
def prepare():
    if os.environ.get('STUDIO_MANAGED') != '1':
        raise HTTPException(403, 'Chức năng chuẩn bị tự động chỉ dùng trong bản máy tính.')
    try:
        with LOCK:
            model=engine()
            voices=[{'id':str(v),'name':str(v),'description':str(label)} for label,v in model.list_preset_voices()]
            if not voices:
                raise HTTPException(503, 'VieNeu không nạp được giọng dựng sẵn. Bấm Chuẩn bị / sửa thư viện để khôi phục tệp voices_v3_turbo.json của SDK; giọng riêng được giữ nguyên.')
            if os.environ.get('STUDIO_FIRST_PREPARE') == '1' and voices:
                model.infer('Xin chào.', voice=voices[0]['id'])
    except HTTPException:
        raise
    except Exception as error:
        logging.exception('Không chuẩn bị được mô hình AI')
        detail=str(error).replace(TOKEN, '[đã ẩn]')[-700:]
        raise HTTPException(503,'Chưa nạp được bộ tạo giọng VieNeu: '+type(error).__name__+': '+detail) from error
    # Optional ASR and speaker-encoder downloads must never gate preset TTS.
    # They load only when the user requests captions or enrolls a new voice.
    return {'data':voices,'models':['v3turbo']}

@app.get('/v1/voices', dependencies=[Depends(auth)])
def voices():
    with LOCK:
        model = engine()
        return {'data': [{'id': str(voice_id), 'name': str(voice_id), 'description': str(label)} for label, voice_id in model.list_preset_voices()]}

@app.post('/v1/voices', dependencies=[Depends(auth)])
def add_voice(name: str = Form(...), consent: str = Form(...), file: UploadFile = File(...)):
    if not re.fullmatch(r'[^\W_][\w .-]{1,63}', name.strip()) or consent != 'yes':
        raise HTTPException(400, 'Tên giọng cần 2–64 ký tự thông thường và xác nhận quyền sử dụng.')
    audio = file.file.read(5_000_001)
    if not audio or len(audio) > 5_000_000:
        raise HTTPException(413, 'Mẫu giọng WAV tối đa 5 MB.')
    try:
        with wave.open(io.BytesIO(audio)) as clip:
            seconds = clip.getnframes() / clip.getframerate()
            if not 3 <= seconds <= 8.1 or clip.getnchannels() not in (1, 2) or clip.getsampwidth() != 2:
                raise ValueError()
    except Exception:
        raise HTTPException(400, 'Mẫu giọng cần là WAV PCM16, dài 3–8 giây. Hãy chọn lại mẫu trong website.')
    with LOCK:
        model = engine()
        if any(str(v) == name.strip() for _, v in model.list_preset_voices()):
            raise HTTPException(409, 'Tên giọng đã có. Hãy chọn tên mới hoặc dùng lại giọng trong danh sách.')
        DATA.mkdir(parents=True, exist_ok=True)
        ident = uuid.uuid4().hex
        path = DATA / (ident + '.wav')
        path.write_bytes(audio)
        try:
            model.add_voice(name.strip(), str(path), denoise=True)
            (DATA / (ident + '.json')).write_text(json.dumps({'name': name.strip()}, ensure_ascii=False), encoding='utf-8')
        except Exception:
            path.unlink(missing_ok=True)
            raise HTTPException(500, 'VieNeu chưa nạp được giọng mẫu. Thử mẫu rõ tiếng hơn.')
    return {'id': name.strip(), 'name': name.strip()}

class Speech(BaseModel):
    input: str = Field(min_length=3)
    voice: str = Field(min_length=1, max_length=64)
    speed: float = Field(default=1.0, ge=.75, le=1.5, allow_inf_nan=False)

@app.post('/v1/audio/speech', dependencies=[Depends(auth)])
def speech(body: Speech):
    with LOCK:
        model = engine()
        if not any(str(v) == body.voice for _, v in model.list_preset_voices()):
            raise HTTPException(404, 'Giọng chưa có trên máy. Tải lại danh sách hoặc nạp lại mẫu giọng.')
        with tempfile.TemporaryDirectory() as folder:
            path = str(Path(folder) / 'speech.wav')
            try:
                audio = model.infer(body.input, voice=body.voice)
                from speech_speed import change_speech_speed
                audio = change_speech_speed(audio, body.speed)
                model.save(audio, path)
                output = Path(path).read_bytes()
            except Exception:
                raise HTTPException(500, 'VieNeu chưa tạo được lời đọc. Xem cửa sổ bộ chạy để kiểm tra mô hình.')
    return Response(output, media_type='audio/wav')

def watch_parent():
    """Stop the managed engine even when Windows closes the parent console directly."""
    parent=int(os.environ.get('STUDIO_PARENT_PID','0'))
    if parent<=0:return
    def monitor():
        if os.name=='nt':
            import ctypes
            from ctypes import wintypes
            kernel=ctypes.WinDLL('kernel32',use_last_error=True)
            kernel.OpenProcess.argtypes=[wintypes.DWORD,wintypes.BOOL,wintypes.DWORD]
            kernel.OpenProcess.restype=wintypes.HANDLE
            kernel.WaitForSingleObject.argtypes=[wintypes.HANDLE,wintypes.DWORD]
            kernel.WaitForSingleObject.restype=wintypes.DWORD
            kernel.CloseHandle.argtypes=[wintypes.HANDLE]
            handle=kernel.OpenProcess(0x00100000,False,parent)
            if handle:
                kernel.WaitForSingleObject(handle,0xFFFFFFFF)
                kernel.CloseHandle(handle)
        else:
            import time
            while os.getppid()==parent:time.sleep(1)
        os._exit(0)
    threading.Thread(target=monitor,daemon=True).start()

if __name__ == '__main__':
    port=int(os.environ.get('STUDIO_VOICE_PORT','8000'))
    if os.environ.get('STUDIO_MANAGED') == '1':
        watch_parent()
        print('Bản Tin Studio tự quản lý VieNeu; mô hình/giọng được lưu bền vững trên máy.',flush=True)
    else:
        print('BẢN TIN STUDIO — VieNeu 1.3')
        print('Địa chỉ: http://127.0.0.1:'+str(port))
        print('Mã ghép nối (chỉ phiên này): '+TOKEN)
        print('Giữ cửa sổ này mở khi dùng bản ghép nối thủ công.')
    uvicorn.run(app, host='127.0.0.1', port=port, workers=1, log_level='warning')
