# Installs the Sahyadri Card Reader for the current Windows user (no admin rights needed):
# copies it to %LOCALAPPDATA%\SahyadriCardReader, adds a Start menu shortcut, starts it with Windows, and starts it now.
#   powershell -ExecutionPolicy Bypass -File install.ps1            install (builds first if needed)
#   powershell -ExecutionPolicy Bypass -File install.ps1 -Uninstall remove it
param([switch]$Uninstall)
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$dest = Join-Path $env:LOCALAPPDATA 'SahyadriCardReader'
$lnk = Join-Path ([Environment]::GetFolderPath('Programs')) 'Sahyadri Card Reader.lnk'
$run = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
Get-Process SahyadriCardReader -ErrorAction SilentlyContinue | Stop-Process -Force
if ($Uninstall) {
  Remove-Item -Recurse -Force $dest -ErrorAction SilentlyContinue
  Remove-Item -Force $lnk -ErrorAction SilentlyContinue
  Remove-ItemProperty -Path $run -Name SahyadriCardReader -ErrorAction SilentlyContinue
  Remove-Item -Recurse -Force 'HKCU:\Software\SahyadriHeights\CardReader' -ErrorAction SilentlyContinue
  Write-Host 'Sahyadri Card Reader removed.'
  return
}
# From the downloaded zip the programs sit next to this script; in the repo they are built into dist\.
$from = if (Test-Path (Join-Path $here 'SahyadriCardReader.exe')) { $here } else { Join-Path $here 'dist' }
if (-not (Test-Path (Join-Path $from 'SahyadriCardReader.exe'))) { & (Join-Path $here 'build.ps1'); $from = Join-Path $here 'dist' }
New-Item -ItemType Directory -Force $dest | Out-Null
Copy-Item (Join-Path $from '*.exe') $dest -Force
$exe = Join-Path $dest 'SahyadriCardReader.exe'
$sh = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
$sh.TargetPath = $exe; $sh.WorkingDirectory = $dest; $sh.Description = 'Reads NFC cards for the Sahyadri Heights gate desk'; $sh.Save()
Set-ItemProperty -Path $run -Name SahyadriCardReader -Value "`"$exe`""
Start-Process $exe
Write-Host "Installed to $dest. It runs in the tray (next to the clock) and starts with Windows."
