"""Application-owned storage lives beside the extracted Windows tool."""
from __future__ import annotations
import os, shutil, sqlite3, tempfile
from pathlib import Path

def storage(root):
    path=Path(root).resolve()/'data'
    try:
        path.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryFile(dir=path):pass
    except OSError as error:
        raise OSError('Không ghi được thư mục data cạnh tool. Giải nén vào thư mục có quyền ghi, ví dụ D:\\BanTinStudio; không chạy trong ZIP hoặc Program Files.') from error
    return path

def environment(root,base=None):
    env=dict(os.environ if base is None else base);data=storage(root)
    paths={'HF_HOME':data/'ai/cache/huggingface','HF_HUB_CACHE':data/'ai/cache/huggingface/hub',
           'HUGGINGFACE_HUB_CACHE':data/'ai/cache/huggingface/hub','HF_XET_CACHE':data/'ai/cache/huggingface/xet',
           'HF_ASSETS_CACHE':data/'ai/cache/huggingface/assets','TRANSFORMERS_CACHE':data/'ai/cache/huggingface/hub',
           'SENTENCE_TRANSFORMERS_HOME':data/'ai/cache/sentence-transformers','TORCH_HOME':data/'ai/cache/torch','MODELSCOPE_CACHE':data/'ai/cache/modelscope',
           'XDG_CACHE_HOME':data/'ai/cache','NUMBA_CACHE_DIR':data/'ai/cache/numba','MPLCONFIGDIR':data/'ai/cache/matplotlib',
           'PIP_CACHE_DIR':data/'ai/cache/pip','TEMP':data/'temp','TMP':data/'temp','TMPDIR':data/'temp'}
    for name,path in paths.items():path.mkdir(parents=True,exist_ok=True);env[name]=str(path)
    # Do not inherit user-install destinations outside this tool.
    for name in ('PIP_TARGET','PIP_PREFIX','PIP_USER','PYTHONUSERBASE','PYTHONPATH','PYTHONHOME','PYTHONPYCACHEPREFIX'):
        env.pop(name,None)
    env.update({'PIP_CONFIG_FILE':os.devnull,'PYTHONNOUSERSITE':'1','PYTHONUTF8':'1','PYTHONIOENCODING':'utf-8'})
    return env

def browser_command(exe,url,root):
    data=storage(root);profile=data/'browser';cache=data/'browser-cache'
    profile.mkdir(exist_ok=True);cache.mkdir(exist_ok=True)
    return [str(exe),'--user-data-dir='+str(profile),'--disk-cache-dir='+str(cache),
            '--no-first-run','--no-default-browser-check','--app='+url]

def copy_missing(source,target,allowed=None):
    """Copy bytes, never links to the previous drive, and never replace new data."""
    source,target=Path(source),Path(target)
    if not source.is_dir() or source.resolve()==target.resolve():return
    for file in source.rglob('*'):
        if not file.is_file() or file.name.endswith(('.incomplete','.lock')):continue
        relative=file.relative_to(source)
        if allowed and not allowed(relative):continue
        destination=target/relative
        if destination.exists():continue
        destination.parent.mkdir(parents=True,exist_ok=True)
        fd,part=tempfile.mkstemp(prefix='migration-',suffix='.part',dir=destination.parent);os.close(fd)
        try:
            shutil.copyfile(file,part,follow_symlinks=True)
            if Path(part).stat().st_size!=file.stat().st_size:raise OSError('Sao chép dữ liệu cũ chưa đầy đủ.')
            os.replace(part,destination)
        finally:Path(part).unlink(missing_ok=True)

def migrate_client(data,owner=False):
    old=Path(os.environ.get('LOCALAPPDATA',str(Path.home())))/('BanTinStudioOwner' if owner else 'BanTinStudio')
    copy_missing(old,data,lambda p:len(p.parts)==1 and p.name=='activation.json')

def migrate_licenses(data):
    data=Path(data);data.mkdir(parents=True,exist_ok=True)
    old=Path(os.environ.get('LOCALAPPDATA',str(Path.home())))/'BanTinLicenseServer'
    if old.resolve()==data.resolve() or (data/'licenses.sqlite3').exists() or not (old/'licenses.sqlite3').is_file():return
    # SQLite backup includes committed WAL contents, even if the old service was
    # not shut down cleanly. No old database or administrator file is modified.
    part=data/'licenses-migration.part'
    try:
        with sqlite3.connect((old/'licenses.sqlite3').resolve().as_uri()+'?mode=ro',uri=True) as source:
            with sqlite3.connect(part) as target:source.backup(target)
        copy_missing(old,data,lambda p:len(p.parts)==1 and p.name in ('admin-auth.json','MAT-KHAU-QUAN-TRI.txt','settings.json'))
        os.replace(part,data/'licenses.sqlite3')
    finally:part.unlink(missing_ok=True)
