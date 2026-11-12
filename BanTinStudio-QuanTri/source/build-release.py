"""Rebuild UI first (ui/npm ci + npm run build), then package owner/customer."""
from pathlib import Path
import argparse,hashlib,shutil,tempfile,zipfile
ROOT=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,required=True);args=parser.parse_args();output=args.output.resolve()
if output.is_relative_to(ROOT):raise SystemExit('Output ZIP must be outside the tool folder.')
def archive(folder,path,prefix):
    with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED,compresslevel=7) as z:
        for file in sorted(folder.rglob('*')):
            relative=file.relative_to(folder)
            if relative.parts[0]=='data' or any(name in relative.parts for name in ['node_modules','dist','__pycache__','.venv']):continue
            if file.name in {'activation.json','admin-auth.json','licenses.sqlite3','MAT-KHAU-QUAN-TRI.txt'}:raise AssertionError('Private runtime data must not be packaged: '+str(relative))
            if file.is_file() and not file.name.endswith(('.tsbuildinfo','.pyc')):z.write(file,prefix+'/'+relative.as_posix())
    with zipfile.ZipFile(path) as z:assert z.testzip() is None
dist=ROOT/'source/ui/dist'
assert (dist/'index.html').is_file(),'Build ui first.'
shutil.rmtree(ROOT/'web/assets',ignore_errors=True);shutil.copytree(dist,ROOT/'web',dirs_exist_ok=True)
with tempfile.TemporaryDirectory() as temp:
    with zipfile.ZipFile(ROOT/'manager/customer-template.zip') as z:z.extractall(temp)
    customer=Path(temp)/'BanTinStudio'
    shutil.rmtree(customer/'web/assets',ignore_errors=True);shutil.copytree(dist,customer/'web',dirs_exist_ok=True)
    shutil.copy(ROOT/'VERSION.txt',customer/'VERSION.txt');shutil.copy(ROOT/'source/HUONG-DAN-KHACH.txt',customer/'DOC-TRUOC-KHI-DUNG.txt')
    for file in ['portable.py','desktop_entry.py','local_server.py','voice_manager.py','licensing.py','article_import.py','desktop_session.py']:shutil.copy(ROOT/'app'/file,customer/'app'/file)
    shutil.copy(ROOT/'local-voice/server.py',customer/'local-voice/server.py')
    assert not (customer/'app/owner_launcher.py').exists()
    archive(customer,ROOT/'manager/customer-template.zip','BanTinStudio')
archive(ROOT,output,'BanTinStudio-QuanTri')
print(f'{output}\n{output.stat().st_size} bytes\nSHA-256 {hashlib.sha256(output.read_bytes()).hexdigest()}')
