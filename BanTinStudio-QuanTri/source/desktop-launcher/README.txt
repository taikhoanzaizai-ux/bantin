QUÂN BẢN TIN — GUI LAUNCHER

launcher.c uses WinAPI CreateProcessW to open the included runtime/pythonw.exe
with app/desktop_entry.py. Unicode paths and spaces are supported; no shell,
BAT, elevation, or console is used. Keep the EXE beside app/, runtime/, web/.

Build with MinGW-w64 GCC + windres:
  python build.py --output "Quân Bản Tin.exe"
Or configure MINGW_CC and MINGW_WINDRES with their absolute paths.

launcher.rc contains the icon/version resources. The executable is Windows
x64 GUI subsystem. Source is included for the tool owner. The build toolchain
and AI installation are not included in this small executable.

App-owned data lives in data/ beside the EXE. UI uses an installed Chrome/Edge
in app mode with a private user-data-dir inside data/. Python 3.11 x64 is
still needed for optional AI; the bundled Python 3.13 runtime runs the shell.

Tests check PE headers/imports, local HTTP lifecycle, path isolation, migration,
relative manifests and UI interactions. Native Windows launch/SmartScreen,
browser window layout and real GPU/codec/model execution remain unverified.
