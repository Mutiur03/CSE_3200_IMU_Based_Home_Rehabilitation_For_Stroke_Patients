# Build the Godot Web export into server/web/ (served at /play).
# Downloads Godot + export templates once into .godot-tools/ (official godotengine/godot-builds releases).
# Usage: powershell -ExecutionPolicy Bypass -File scripts/export-game.ps1
$ErrorActionPreference = "Stop"
$ver = "4.7.2-stable"   # project.godot targets 4.7
$root = Split-Path $PSScriptRoot -Parent
$tools = Join-Path $root ".godot-tools"
# curl.exe resumes a partial download (-C -) and retries; Invoke-WebRequest restarts from zero on a dropped connection.
function Get-File($url, $out) {
  for ($i = 1; $i -le 20; $i++) {
    curl.exe -L -C - --fail --retry 5 --retry-delay 3 -o $out $url
    if ($LASTEXITCODE -eq 0) { return }
    Write-Host "Download interrupted, resuming (attempt $i)..."
    Start-Sleep -Seconds 3
  }
  throw "Download failed: $url"
}
$base = "https://github.com/godotengine/godot-builds/releases/download/$ver"
New-Item -ItemType Directory -Force $tools | Out-Null

$exeName = "Godot_v$ver`_win64.exe"
$exe = Join-Path $tools $exeName
if (-not (Test-Path $exe)) {
  $zip = Join-Path $tools "godot.zip"
  Get-File "$base/$exeName.zip" $zip
  Expand-Archive $zip $tools -Force
  Remove-Item $zip
}

# Templates go in %APPDATA%\Godot\export_templates\4.7.2.stable
$tdir = Join-Path $env:APPDATA "Godot\export_templates\$($ver -replace '-','.')"
if (-not (Test-Path (Join-Path $tdir "web_nothreads_release.zip"))) {
  $tpz = Join-Path $tools "templates.zip"
  Get-File "$base/Godot_v$ver`_export_templates.tpz" $tpz
  $tmp = Join-Path $tools "tpl"
  Expand-Archive $tpz $tmp -Force
  Remove-Item $tpz
  New-Item -ItemType Directory -Force $tdir | Out-Null
  Copy-Item (Join-Path $tmp "templates\*") $tdir -Recurse -Force
  Remove-Item $tmp -Recurse -Force
}

New-Item -ItemType Directory -Force (Join-Path $root "server\web") | Out-Null
# The GUI exe returns at once from `&`; Start-Process -Wait waits and gives a real exit code. The _console exe prints its log here.
$con = $exe -replace "\.exe$", "_console.exe"
if (Test-Path $con) { $exe = $con }
$p = Start-Process $exe -Wait -NoNewWindow -PassThru -ArgumentList @("--headless", "--path", "`"$(Join-Path $root 'imu-rehab-game')`"", "--export-release", "Web", "../server/web/index.html")
if ($p.ExitCode -ne 0) { throw "Godot export failed (exit $($p.ExitCode))" }
if (-not (Test-Path (Join-Path $root "server\web\index.html"))) { throw "Export finished but server/web/index.html is missing" }
Write-Host "Done: server/web/index.html. Restart the api (or rebuild the docker image)."
