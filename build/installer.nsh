; 업데이트로 아이콘이 바뀌어도 윈도우가 옛 아이콘(캐시)을 계속 보여주는 문제를 막는다.
; 윈도우의 아이콘 캐시는 "아이콘 파일 경로"별로 저장되므로, 버전이 붙은 새 아이콘 파일(icon-<버전>.ico)을 바로가기가 가리키게 하면
; 옛 캐시를 다시 쓸 수 없다. 그 뒤 탐색기에 아이콘을 다시 읽으라고 알린다.
!macro customInstall
  CopyFiles /SILENT "$INSTDIR\resources\icon.ico" "$INSTDIR\icon-${VERSION}.ico"
  ${if} ${FileExists} "$newDesktopLink"
    CreateShortCut "$newDesktopLink" "$appExe" "" "$INSTDIR\icon-${VERSION}.ico" 0
    WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
  ${endIf}
  ${if} ${FileExists} "$newStartMenuLink"
    CreateShortCut "$newStartMenuLink" "$appExe" "" "$INSTDIR\icon-${VERSION}.ico" 0
    WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"
  ${endIf}
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
  nsExec::Exec '"$SYSDIR\ie4uinit.exe" -show'
  Pop $0
!macroend
