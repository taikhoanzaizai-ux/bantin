"""No-console entry used by Quân Bản Tin.exe and the bundled pythonw runtime."""
from pathlib import Path
import ctypes,os,sys,traceback

ROOT=Path(__file__).resolve().parent.parent

def main():
    from portable import storage
    data=storage(ROOT);logs=data/'logs';logs.mkdir(exist_ok=True)
    # pythonw has no stdout/stderr. Always retain actionable startup failures.
    log=(logs/'desktop.log').open('a',encoding='utf-8',buffering=1)
    sys.stdout=sys.stderr=log
    os.environ['BTS_DESKTOP_GUI']='1'
    try:
        if (ROOT/'app/owner_launcher.py').is_file():
            from owner_launcher import OwnerLicense
            from local_server import run
            run(OwnerLicense(),8787)
        else:
            from local_server import run
            run()
    finally:log.flush()

if __name__=='__main__':
    try:main()
    except Exception as error:
        if sys.stderr:traceback.print_exc()
        if os.name=='nt':ctypes.windll.user32.MessageBoxW(None,str(error)+'\n\nNhật ký: '+str(ROOT/'data/logs/desktop.log'),'Quân Bản Tin',0x10)
