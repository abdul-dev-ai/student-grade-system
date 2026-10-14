[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$buildPath = Join-Path $projectRoot 'build/native'
New-Item -ItemType Directory -Path $buildPath -Force | Out-Null
$compiler = Get-Command 'g++' -ErrorAction SilentlyContinue
if (-not $compiler) { $compiler = Get-Command 'clang++' -ErrorAction SilentlyContinue }
if (-not $compiler) { throw 'A native C++17 compiler (g++ or clang++) is required. For MSVC, use the CMake instructions in README.md.' }
$outputPath = Join-Path $buildPath 'grade_tests.exe'
& $compiler.Source '-std=c++17' '-O2' '-Wall' '-Wextra' '-Wpedantic' '-Werror' '-I' (Join-Path $projectRoot 'include') (Join-Path $projectRoot 'src/grade_engine.cpp') (Join-Path $projectRoot 'tests/grade_engine_test.cpp') '-o' $outputPath
if ($LASTEXITCODE -ne 0) { throw "Native compilation failed with exit code $LASTEXITCODE." }
& $outputPath
if ($LASTEXITCODE -ne 0) { throw "Native tests failed with exit code $LASTEXITCODE." }
if (Get-Command 'node' -ErrorAction SilentlyContinue) {
    & node (Join-Path $projectRoot 'tests/native-json.test.mjs') $outputPath
    if ($LASTEXITCODE -ne 0) { throw 'Native JSON integration test failed.' }
}
