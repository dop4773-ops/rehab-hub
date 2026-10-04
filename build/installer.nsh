; 업데이트로 아이콘이 바뀌어도 윈도우가 옛 아이콘(캐시)을 계속 보여주는 문제를 막는다.
; 바로가기(바탕화면·시작 메뉴)의 아이콘 위치를 새 exe로 다시 지정하고, 탐색기에 아이콘을 다시 읽으라고 알린다.
!macro customInstall
  ${if} ${FileExists} "$newDesktopLink"
    CreateShortCut "$newDesktopLink" "$appExe" "" "$appExe" 0
    WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
  ${endIf}
  ${if} ${FileExists} "$newStartMenuLink"
    CreateShortCut "$newStartMenuLink" "$appExe" "" "$appExe" 0
    WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"
  ${endIf}
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
