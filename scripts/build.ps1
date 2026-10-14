[CmdletBinding()]
param([switch]$StaticOnly)
$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$distPath = Join-Path $projectRoot 'dist'
$wasmPath = Join-Path $distPath 'wasm'
New-Item -ItemType Directory -Path $distPath, $wasmPath -Force | Out-Null
foreach ($file in @('index.html', 'styles.css', 'app.js', 'persistence.js', 'favicon.svg')) {
    Copy-Item -LiteralPath (Join-Path $projectRoot "web/$file") -Destination (Join-Path $distPath $file) -Force
}
Set-Content -LiteralPath (Join-Path $distPath '.nojekyll') -Value '' -NoNewline
if ($StaticOnly) {
    Write-Output 'Static frontend copied to dist. WebAssembly compilation was NOT run.'
    exit 0
}
$compiler = Get-Command 'em++' -ErrorAction SilentlyContinue
if (-not $compiler) {
    throw 'Emscripten em++ is unavailable. Static files are prepared, but dist is NOT deployment-ready. Activate emsdk in this shell, then rerun scripts/build.ps1. See README.md.'
}
$buildPath = Join-Path $projectRoot 'build/wasm'
New-Item -ItemType Directory -Path $buildPath -Force | Out-Null
$outputPath = Join-Path $buildPath 'grade_engine.mjs'
$arguments = @(
    '-std=c++17', '-O2', '-Wall', '-Wextra', '-Wpedantic', '--bind', '--no-entry',
    (Join-Path $projectRoot 'src/grade_engine.cpp'),
    (Join-Path $projectRoot 'src/bindings.cpp'),
    '-I', (Join-Path $projectRoot 'include'),
    '-sMODULARIZE=1', '-sEXPORT_ES6=1', '-sALLOW_MEMORY_GROWTH=1',
    '-sENVIRONMENT=web,node', '-sFILESYSTEM=0', '-o', $outputPath
)
& $compiler.Source @arguments
if ($LASTEXITCODE -ne 0) { throw "Emscripten compilation failed with exit code $LASTEXITCODE." }
foreach ($artifact in @('grade_engine.mjs', 'grade_engine.wasm')) {
    $artifactPath = Join-Path $buildPath $artifact
    if (-not (Test-Path -LiteralPath $artifactPath) -or (Get-Item -LiteralPath $artifactPath).Length -eq 0) {
        throw "Expected build artifact is missing or empty: $artifact"
    }
    Copy-Item -LiteralPath $artifactPath -Destination (Join-Path $wasmPath $artifact) -Force
}
Write-Output 'C++17 WebAssembly build succeeded. dist contains the frontend and compiled engine.'
