# Builds the Windows card reader with the C# compiler that ships with Windows (.NET Framework 4); nothing to install.
# Output: dist\SahyadriCardReader.exe (tray app) and dist\SahyadriCardCheck.exe (console: --read-once [seconds]).
$ErrorActionPreference = 'Stop'
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) { $csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe' }
if (-not (Test-Path $csc)) { throw '.NET Framework 4 C# compiler not found' }
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$dist = Join-Path $here 'dist'
New-Item -ItemType Directory -Force $dist | Out-Null
$src = Join-Path $here 'CardReader.cs'
$refs = '/r:System.Windows.Forms.dll', '/r:System.Drawing.dll'
& $csc /nologo /optimize+ /target:winexe "/out:$dist\SahyadriCardReader.exe" @refs $src
if ($LASTEXITCODE) { throw 'build failed (tray app)' }
& $csc /nologo /optimize+ /target:exe "/out:$dist\SahyadriCardCheck.exe" @refs $src
if ($LASTEXITCODE) { throw 'build failed (check tool)' }
# The portal serves this zip on the gate desk (public/downloads), so a guard PC can install it from the browser.
$pkg = Join-Path $dist 'package'
Remove-Item -Recurse -Force $pkg -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $pkg | Out-Null
Copy-Item "$dist\SahyadriCardReader.exe", "$dist\SahyadriCardCheck.exe", (Join-Path $here 'install.ps1'), (Join-Path $here 'README.txt') $pkg
$zip = Join-Path (Split-Path -Parent $here) 'public\downloads\SahyadriCardReader.zip'
New-Item -ItemType Directory -Force (Split-Path -Parent $zip) | Out-Null
Compress-Archive -Path "$pkg\*" -DestinationPath $zip -Force
Write-Host "Built $dist\SahyadriCardReader.exe, SahyadriCardCheck.exe and $zip"
