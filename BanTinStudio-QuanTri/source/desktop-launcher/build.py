"""Build the GUI launcher with MinGW-w64; no Python/AI code is bundled into it."""
import argparse,os,shutil,subprocess,tempfile
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,default=Path(__file__).resolve().parent/'Quân Bản Tin.exe');args=parser.parse_args()
root=Path(__file__).resolve().parent
cc=os.environ.get('MINGW_CC') or shutil.which('x86_64-w64-mingw32-gcc') or shutil.which('gcc')
windres=os.environ.get('MINGW_WINDRES') or shutil.which('x86_64-w64-mingw32-windres') or shutil.which('windres')
if not cc or not windres:raise SystemExit('Install MinGW-w64 gcc/windres or set MINGW_CC and MINGW_WINDRES.')
args.output=args.output.resolve();args.output.parent.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory() as temp:
    resource=Path(temp)/'launcher.o'
    subprocess.run([windres,'launcher.rc',str(resource)],cwd=root,check=True)
    subprocess.run([cc,'-municode','-mwindows','-Os','-s','-static','-o',str(args.output),'launcher.c',str(resource),'-luser32'],cwd=root,check=True)
print(args.output)
