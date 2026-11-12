"""Fetch and stage the Windows build while the current desktop is still open."""
import os
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import sys
import tempfile
from urllib.request import Request, urlopen
from zipfile import ZipFile

UPDATE_ZIP = 'https://codeload.github.com/taikhoanzaizai-ux/bantin/zip/refs/heads/main'
FOLDERS = {'app', 'deploy', 'licenses', 'local-voice', 'manager', 'runtime', 'source', 'third-party-source', 'web'}
ROOT_FILES = {'VERSION.txt', 'Quân Bản Tin.exe', 'MO-BAN-TIN.bat', 'MO-VIENEU.bat', 'DOC-TRUOC-KHI-DUNG.txt', 'THIRD-PARTY-NOTICES.txt'}
LIMIT = 150 * 1024 * 1024

def version(value):
    prefix, number = value.strip().rsplit(' ', 1)
    parts = number.split('.')
    if prefix != 'Quân Bản Tin Desktop' or len(parts) != 3 or not all(p.isascii() and p.isdigit() for p in parts):
        raise ValueError('Phiên bản cập nhật không hợp lệ.')
    return tuple(map(int, parts))

def stage(archive, output):
    total = 0
    for entry in archive.infolist():
        parts = PurePosixPath(entry.filename).parts
        if entry.is_dir() or len(parts) < 3 or parts[1] != 'BanTinStudio-QuanTri':
            continue
        relative = parts[2:]
        if not (relative[0] in FOLDERS and len(relative) > 1 or len(relative) == 1 and relative[0] in ROOT_FILES):
            continue
        if any(part in ('..', '.') or ':' in part or '\\' in part or part.endswith((' ', '.')) for part in relative):
            raise ValueError('Đường dẫn trong gói không hợp lệ.')
        total += entry.file_size
        if total > LIMIT:
            raise ValueError('Gói giải nén vượt giới hạn.')
        target = output.joinpath(*relative)
        target.parent.mkdir(parents=True, exist_ok=True)
        with archive.open(entry) as source, target.open('xb') as dest:
            shutil.copyfileobj(source, dest)

def prepare_update(root):
    if os.name != 'nt':
        raise ValueError('Tự cập nhật dành cho Windows.')
    scratch = Path(tempfile.mkdtemp(prefix='github-update-', dir=root/'data'))
    try:
        package = scratch/'update.zip'
        with urlopen(Request(UPDATE_ZIP, headers={'User-Agent':'Quan-Ban-Tin'}), timeout=25) as response, package.open('wb') as handle:
            received = 0
            while chunk := response.read(1024*1024):
                received += len(chunk)
                if received > LIMIT:
                    raise ValueError('Gói tải vượt giới hạn.')
                handle.write(chunk)
        staged = scratch/'staged'
        with ZipFile(package) as archive:
            stage(archive, staged)
        for file in ('VERSION.txt','Quân Bản Tin.exe','app/local_server.py','web/index.html','runtime/pythonw.exe'):
            if not (staged/file).is_file():
                raise ValueError('Gói cập nhật thiếu tệp bắt buộc.')
        if version((staged/'VERSION.txt').read_text(encoding='utf-8-sig')) <= version((root/'VERSION.txt').read_text(encoding='utf-8-sig')):
            raise ValueError('GitHub chưa có phiên bản mới hơn.')
        shutil.copytree(root/'runtime', scratch/'runner')
        worker = shutil.copy2(Path(__file__).with_name('github_update_worker.py'), scratch)
        subprocess.Popen([str(scratch/'runner'/'pythonw.exe'), str(worker), str(root), str(staged),
                          str(scratch/'backup'), str(os.getpid())], cwd=str(root),
                         creationflags=subprocess.CREATE_NO_WINDOW)
    except Exception:
        shutil.rmtree(scratch, ignore_errors=True)
        raise
