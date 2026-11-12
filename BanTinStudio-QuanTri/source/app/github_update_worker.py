"""Install a staged Quân Bản Tin update after the desktop server exits."""
import ctypes
import os
from pathlib import Path
import shutil
import sys
import time
import traceback

def install(root, staged, backup):
    changed = []
    try:
        for source in sorted(staged.rglob('*')):
            if not source.is_file():
                continue
            relative = source.relative_to(staged)
            target = root / relative
            if not target.resolve().is_relative_to(root):
                raise ValueError('Update target outside application directory')
            target.parent.mkdir(parents=True, exist_ok=True)
            saved = None
            if target.exists():
                saved = backup / relative
                saved.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(target, saved)
            os.replace(source, target)
            changed.append((target, saved))
    except Exception:
        for target, saved in reversed(changed):
            if saved is None:
                target.unlink(missing_ok=True)
            else:
                os.replace(saved, target)
        raise

def wait_for_server(pid):
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.OpenProcess.argtypes = (ctypes.c_ulong, ctypes.c_int, ctypes.c_ulong)
    kernel.OpenProcess.restype = ctypes.c_void_p
    kernel.WaitForSingleObject.argtypes = (ctypes.c_void_p, ctypes.c_ulong)
    kernel.CloseHandle.argtypes = (ctypes.c_void_p,)
    handle = kernel.OpenProcess(0x100000, 0, pid)
    if not handle:
        if ctypes.get_last_error() == 87:
            return
        raise OSError(ctypes.get_last_error(), 'Cannot open desktop process')
    try:
        if kernel.WaitForSingleObject(handle, 45000) != 0:
            raise RuntimeError('Desktop server did not close')
    finally:
        kernel.CloseHandle(handle)

if __name__ == '__main__':
    root, staged, backup = (Path(value).resolve() for value in sys.argv[1:4])
    launcher = root / 'Quân Bản Tin.exe'
    try:
        wait_for_server(int(sys.argv[4]))
        time.sleep(0.5)
        install(root, staged, backup)
    except Exception:
        (root / 'data' / 'github-update-error.txt').write_text(traceback.format_exc(), encoding='utf-8')
        ctypes.windll.user32.MessageBoxW(None, 'Cập nhật thất bại. Xem data\\github-update-error.txt.', 'Quân Bản Tin', 16)
    os.startfile(str(launcher))
