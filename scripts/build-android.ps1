param([string]$SdkPath='', [string]$JdkPath='C:\Program Files\Java\jdk-21.0.12.1')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
if (!$SdkPath) { $SdkPath = Join-Path $projectRoot '.tools\android-sdk' }
$buildTools = Join-Path $SdkPath 'build-tools\36.0.0'
$androidJar = Join-Path $SdkPath 'platforms\android-36\android.jar'
if (!(Test-Path -LiteralPath $androidJar)) { throw 'Install platforms;android-36 and build-tools;36.0.0 first.' }
if (!(Test-Path -LiteralPath (Join-Path $projectRoot 'build\index.html'))) { throw 'Run npm run build first.' }
$env:JAVA_HOME = $JdkPath
$work = Join-Path $projectRoot '.android-build'
$releases = Join-Path $projectRoot 'releases'
$keys = Join-Path $projectRoot '.localkeys'
foreach ($dir in @($work,$releases,$keys,(Join-Path $work 'classes'),(Join-Path $work 'dex'),(Join-Path $work 'generated'),(Join-Path $work 'assets\game'))) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
# Copy only the static game, never the downloadable APK back into itself.
$assetRoot = [IO.Path]::GetFullPath((Join-Path $work 'assets\game'))
$expectedAssetRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot '.android-build\assets\game'))
if ($assetRoot -ne $expectedAssetRoot -or !$assetRoot.StartsWith($projectRoot + [IO.Path]::DirectorySeparatorChar)) { throw 'Unsafe asset staging path' }
if (Get-ChildItem -LiteralPath $assetRoot -Force -Recurse | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }) { throw 'Asset staging contains a link' }
Get-ChildItem -LiteralPath $assetRoot -Force | Remove-Item -Recurse -Force
Get-ChildItem -LiteralPath (Join-Path $projectRoot 'build') | Where-Object { $_.Name -ne 'downloads' } | Copy-Item -Destination (Join-Path $work 'assets\game') -Recurse -Force
& (Join-Path $buildTools 'aapt2.exe') compile --dir 'android/res' -o '.android-build/resources.zip'
if ($LASTEXITCODE -ne 0) { throw 'Resource compilation failed' }
& (Join-Path $buildTools 'aapt2.exe') link -o '.android-build/unsigned.apk' -I (Resolve-Path -LiteralPath $androidJar -Relative) --manifest 'android/AndroidManifest.xml' --java '.android-build/generated' '.android-build/resources.zip' --auto-add-overlay
if ($LASTEXITCODE -ne 0) { throw 'Resource linking failed' }
$sources = Get-ChildItem -LiteralPath (Join-Path $projectRoot 'android\src') -Recurse -Filter '*.java' | Select-Object -ExpandProperty FullName
& (Join-Path $JdkPath 'bin\javac.exe') -encoding UTF-8 -source 8 -target 8 -classpath $androidJar -d (Join-Path $work 'classes') $sources
if ($LASTEXITCODE -ne 0) { throw 'Java compilation failed' }
& (Join-Path $JdkPath 'bin\jar.exe') --create --file (Join-Path $work 'classes.jar') -C (Join-Path $work 'classes') .
& (Join-Path $buildTools 'd8.bat') --lib $androidJar --min-api 24 --output (Join-Path $work 'dex') (Join-Path $work 'classes.jar')
if ($LASTEXITCODE -ne 0) { throw 'Dex compilation failed' }
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::Open((Join-Path $work 'unsigned.apk'),[IO.Compression.ZipArchiveMode]::Update)
try {
  [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,(Join-Path $work 'dex\classes.dex'),'classes.dex') | Out-Null
  # Windows aapt2 can write backslashes into asset entry names. Android's
  # AssetManager requires forward slashes, so create these entries explicitly.
  foreach ($assetFile in Get-ChildItem -LiteralPath $assetRoot -File -Recurse) {
    $relativeAsset = $assetFile.FullName.Substring($assetRoot.Length + 1).Replace('\','/')
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$assetFile.FullName,('assets/game/' + $relativeAsset)) | Out-Null
  }
} finally { $archive.Dispose() }
& (Join-Path $buildTools 'zipalign.exe') -f 4 '.android-build/unsigned.apk' '.android-build/aligned.apk'
if ($LASTEXITCODE -ne 0) { throw 'APK alignment failed' }
$keyPath = Join-Path $keys 'debug.keystore'
if (!(Test-Path -LiteralPath $keyPath)) { & (Join-Path $JdkPath 'bin\keytool.exe') -genkeypair -keystore $keyPath -storepass android -keypass android -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10000 -dname 'CN=OSBB Development,O=OSBB,C=UA' | Out-Null }
$apk = Join-Path $releases 'osbb.apk'
& (Join-Path $buildTools 'apksigner.bat') sign --ks $keyPath --ks-key-alias androiddebugkey --ks-pass pass:android --key-pass pass:android --out $apk (Join-Path $work 'aligned.apk')
if ($LASTEXITCODE -ne 0) { throw 'APK signing failed' }
& (Join-Path $buildTools 'apksigner.bat') verify --verbose $apk
if ($LASTEXITCODE -ne 0) { throw 'APK verification failed' }
$verifiedArchive = [IO.Compression.ZipFile]::OpenRead($apk)
try {
  if ($verifiedArchive.Entries | Where-Object { $_.FullName.Contains('\') }) { throw 'APK contains Windows paths' }
  $verifiedAssets = 0
  foreach ($assetFile in Get-ChildItem -LiteralPath $assetRoot -File -Recurse) {
    $relativeAsset = $assetFile.FullName.Substring($assetRoot.Length + 1).Replace('\','/')
    $entry = $verifiedArchive.GetEntry('assets/game/' + $relativeAsset)
    if (!$entry) { throw "Missing APK asset: $relativeAsset" }
    $stream = $entry.Open()
    $hasher = [Security.Cryptography.SHA256]::Create()
    try { $assetHash = [BitConverter]::ToString($hasher.ComputeHash($stream)).Replace('-','') } finally { $stream.Dispose(); $hasher.Dispose() }
    if ($assetHash -ne (Get-FileHash -LiteralPath $assetFile.FullName -Algorithm SHA256).Hash) { throw "Corrupt APK asset: $relativeAsset" }
    $verifiedAssets++
  }
  Write-Output "Verified $verifiedAssets bundled game files against the web build."
} finally { $verifiedArchive.Dispose() }
foreach ($target in @('public\downloads','build\downloads')) { $destination=Join-Path $projectRoot $target; New-Item -ItemType Directory -Force -Path $destination | Out-Null; Copy-Item -LiteralPath $apk -Destination (Join-Path $destination 'osbb.apk') -Force }
Get-Item -LiteralPath $apk | Select-Object Name,Length
