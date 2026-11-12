"""Portable per-installation bootstrap and one native desktop process at a time."""
from __future__ import annotations
import contextlib,json,os,secrets
from pathlib import Path

@contextlib.contextmanager
def desktop_lock(data):
    path=Path(data)/'desktop-instance.lock';path.parent.mkdir(parents=True,exist_ok=True)
    with path.open('a+b') as stream:
        stream.seek(0,2)
        if not stream.tell():stream.write(b'0');stream.flush()
        stream.seek(0);acquired=False
        try:
            if os.name=='nt':
                import msvcrt
                msvcrt.locking(stream.fileno(),msvcrt.LK_NBLCK,1)
            else:
                import fcntl
                fcntl.flock(stream.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
            acquired=True
        except OSError:pass
        try:yield acquired
        finally:
            if acquired:
                stream.seek(0)
                if os.name=='nt':
                    import msvcrt
                    msvcrt.locking(stream.fileno(),msvcrt.LK_UNLCK,1)
                else:
                    import fcntl
                    fcntl.flock(stream.fileno(),fcntl.LOCK_UN)

def launch_secret(data):
    """Only called while holding desktop_lock; stays valid after browser restore."""
    path=Path(data)/'desktop-launch.json'
    try:value=json.loads(path.read_text('utf-8')).get('key','')
    except (OSError,ValueError,AttributeError):value=''
    if not isinstance(value,str) or len(value)!=64 or any(c not in '0123456789abcdef' for c in value):
        value=secrets.token_hex(32);temporary=path.with_suffix('.tmp')
        temporary.write_text(json.dumps({'key':value}),'utf-8');temporary.replace(path)
    try:path.chmod(0o600)
    except OSError:pass
    return value
