#ifndef UNICODE
#define UNICODE
#endif
#ifndef _UNICODE
#define _UNICODE
#endif
#include <windows.h>
#include <wchar.h>

int WINAPI wWinMain(HINSTANCE instance,HINSTANCE previous,PWSTR arguments,int show) {
    wchar_t root[32768],python[32768],script[32768],command[65536],message[1024];
    DWORD length=GetModuleFileNameW(NULL,root,32768);
    if (!length || length>=32768) return 1;
    wchar_t *slash=wcsrchr(root,L'\\');
    if (!slash) return 1;
    *slash=0;
    swprintf(python,32768,L"%ls\\runtime\\pythonw.exe",root);
    swprintf(script,32768,L"%ls\\app\\desktop_entry.py",root);
    if (GetFileAttributesW(python)==INVALID_FILE_ATTRIBUTES || GetFileAttributesW(script)==INVALID_FILE_ATTRIBUTES) {
        MessageBoxW(NULL,L"Hãy giải nén TOÀN BỘ gói Quân Bản Tin rồi mở lại. Giữ file EXE cạnh các thư mục runtime, app, web.",L"Quân Bản Tin",MB_OK|MB_ICONERROR);
        return 1;
    }
    swprintf(command,65536,L"\"%ls\" \"%ls\"",python,script);
    STARTUPINFOW startup={0};startup.cb=sizeof(startup);
    PROCESS_INFORMATION process={0};
    if (!CreateProcessW(python,command,NULL,NULL,FALSE,CREATE_NO_WINDOW,NULL,root,&startup,&process)) {
        swprintf(message,1024,L"Không mở được Quân Bản Tin (mã Windows %lu). Kiểm tra bạn đã giải nén toàn bộ gói và runtime\\pythonw.exe còn đầy đủ.",GetLastError());
        MessageBoxW(NULL,message,L"Quân Bản Tin",MB_OK|MB_ICONERROR);
        return 1;
    }
    CloseHandle(process.hThread);
    WaitForSingleObject(process.hProcess,INFINITE);
    DWORD exitCode=0;GetExitCodeProcess(process.hProcess,&exitCode);
    CloseHandle(process.hProcess);
    return (int)exitCode;
}
