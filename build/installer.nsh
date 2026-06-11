; 安装后用已嵌入图标的 exe 重建快捷方式（.lnk 直接引用 .ico 在部分环境会显示空白图标）
!macro customInstall
  ${ifNot} ${isNoDesktopShortcut}
    ${if} $newDesktopLink != ""
      Delete "$newDesktopLink"
      CreateShortCut "$newDesktopLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
      ClearErrors
      WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
    ${endif}
  ${endif}
  ${if} $newStartMenuLink != ""
    Delete "$newStartMenuLink"
    CreateShortCut "$newStartMenuLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
    ClearErrors
    WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"
  ${endif}
  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend
