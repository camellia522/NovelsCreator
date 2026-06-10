# Install official worldengine (scripts/.conda-env with Anaconda, else scripts/.venv)
param(
  [switch]$UseVenv,
  [switch]$Clean
)

$ErrorActionPreference = "Stop"

$Venv = Join-Path $PSScriptRoot ".venv"
$VenvPy = Join-Path $Venv "Scripts\python.exe"
$CondaEnv = Join-Path $PSScriptRoot ".conda-env"
$CondaPy = Join-Path $CondaEnv "python.exe"
$ReqFile = Join-Path $PSScriptRoot "requirements-worldengine.txt"
$GenScript = Join-Path $PSScriptRoot "worldengine_generate.py"
$CondaForge = @("-c", "conda-forge", "--override-channels")

function Test-PythonExe([string]$Exe) {
  if (-not $Exe -or -not (Test-Path -LiteralPath $Exe)) { return $false }
  try {
    $ver = & $Exe --version 2>&1
    return ($ver -match 'Python 3\.(9|1[0-9]|[2-9][0-9])')
  } catch {
    return $false
  }
}

function Get-PythonVersionMajorMinor([string]$Exe) {
  $raw = (& $Exe -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>&1 | Out-String).Trim()
  if ($raw -match '^(\d+)\.(\d+)$') {
    return [int]$Matches[1], [int]$Matches[2]
  }
  return 0, 0
}

function Invoke-Checked([string]$Label, [scriptblock]$Block) {
  & $Block
  if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) {
    throw "$Label failed (exit $LASTEXITCODE)"
  }
}

function Test-CondaAvailable {
  return [bool](Get-Command conda -ErrorAction SilentlyContinue)
}

function Test-ModuleInstalled([string]$Exe, [string]$Module) {
  & $Exe -c "import $Module" 2>$null
  return ($LASTEXITCODE -eq 0)
}

function Resolve-AnacondaPython {
  if ($env:CONDA_PREFIX) {
    $exe = Join-Path $env:CONDA_PREFIX "python.exe"
    if (Test-PythonExe $exe) { return $exe }
  }

  if (Test-CondaAvailable) {
    try {
      $base = (& conda info --base 2>$null | Out-String).Trim()
      if ($base) {
        $exe = Join-Path $base "python.exe"
        if (Test-PythonExe $exe) { return $exe }
      }
    } catch { }
  }

  $roots = @($env:USERPROFILE, $env:LOCALAPPDATA, ${env:ProgramData})
  $names = @(
    "anaconda3", "Anaconda3", "miniconda3", "Miniconda3",
    "miniforge3", "Miniforge3", "mambaforge", "Mambaforge"
  )
  foreach ($root in $roots) {
    if (-not $root) { continue }
    foreach ($name in $names) {
      $exe = Join-Path $root $name "python.exe"
      if (Test-PythonExe $exe) { return $exe }
    }
  }

  return $null
}

function Resolve-RealPython {
  $condaPy = Resolve-AnacondaPython
  if ($condaPy) { return $condaPy }

  if (Get-Command py -ErrorAction SilentlyContinue) {
    foreach ($flag in @('-3.12', '-3.11', '-3.10', '-3.9', '-3')) {
      try {
        $exe = & py $flag -c "import sys; print(sys.executable)" 2>$null
        $exe = ($exe | Out-String).Trim()
        if (Test-PythonExe $exe) { return $exe }
      } catch { }
    }
  }

  foreach ($name in @('python3', 'python')) {
    $cmd = Get-Command $name -ErrorAction SilentlyContinue
    if (-not $cmd) { continue }
    $src = $cmd.Source
    if ($src -match '\\WindowsApps\\') { continue }
    if (Test-PythonExe $src) { return $src }
  }

  return $null
}

function Remove-EnvDir([string]$Path) {
  if (Test-Path $Path) {
    Write-Host "Removing: $Path"
    Remove-Item -Recurse -Force $Path
  }
}

function Ensure-CondaEnv {
  if (-not (Test-CondaAvailable)) {
    Write-Error "conda not found."
  }

  $needsCreate = -not (Test-Path $CondaPy)
  if (-not $needsCreate) {
    $major, $minor = Get-PythonVersionMajorMinor $CondaPy
    if ($major -ne 3 -or $minor -gt 12) {
      Write-Host "Recreating conda env (need Python 3.9-3.12, found $major.$minor)"
      Remove-EnvDir $CondaEnv
      $needsCreate = $true
    }
  }

  if ($needsCreate) {
    Write-Host "Creating conda env (Python 3.11, conda-forge only): $CondaEnv"
    Invoke-Checked "conda create" {
      conda create -y -p $CondaEnv @CondaForge python=3.11 pip setuptools wheel
    }
    if (-not (Test-Path $CondaPy)) {
      Write-Error "conda env creation failed. python.exe not found at: $CondaPy"
    }
  }

  return $CondaPy
}

function Ensure-Venv([string]$BasePython) {
  if (Test-Path $Venv) {
    if (-not (Test-Path $VenvPy)) {
      Remove-EnvDir $Venv
    }
  }
  if (-not (Test-Path $VenvPy)) {
    Write-Host "Creating venv: $Venv"
    Invoke-Checked "venv create" { & $BasePython -m venv $Venv }
    if (-not (Test-Path $VenvPy)) {
      Write-Error "venv creation failed. python.exe not found at: $VenvPy"
    }
  }
  return $VenvPy
}

function Install-CondaNoise([string]$TargetPy) {
  if (Test-ModuleInstalled $TargetPy "noise") {
    Write-Host "noise already installed (conda-forge)"
    return
  }
  Write-Host "Installing noise from conda-forge (prebuilt, no MSVC needed)..."
  Invoke-Checked "conda install noise" {
    conda install -y -p $CondaEnv @CondaForge noise
  }
}

function Install-WorldEnginePip([string]$TargetPy) {
  if (Test-ModuleInstalled $TargetPy "worldengine") {
    Write-Host "worldengine already installed"
    return
  }
  Write-Host "Installing worldengine via pip..."
  & $TargetPy -m pip install --upgrade pip
  if ($LASTEXITCODE -ne 0) { throw "pip upgrade failed (exit $LASTEXITCODE)" }
  Invoke-Checked "pip install worldengine" {
    & $TargetPy -m pip install -r $ReqFile
  }
}

function Test-WorldEngine([string]$TargetPy) {
  Write-Host "Verifying..."
  $out = & $TargetPy $GenScript --check --seed 1 --name test --width 512 --height 256 --output-dir $env:TEMP 2>&1 | Out-String
  Write-Host $out.Trim()
  if ($LASTEXITCODE -ne 0) {
    throw "WorldEngine verify failed (exit $LASTEXITCODE)"
  }
  if ($out -match '"ok"\s*:\s*false') {
    throw "WorldEngine verify returned ok:false"
  }
}

if ($Clean) {
  Remove-EnvDir $Venv
  Remove-EnvDir $CondaEnv
}

$BasePython = $env:WORLDENGINE_PYTHON
if ($BasePython) {
  $BasePython = $BasePython.Trim().Trim([char]34).Trim([char]39)
}
if (-not (Test-PythonExe $BasePython)) {
  $BasePython = Resolve-RealPython
}
if (-not $BasePython) {
  Write-Host "Python 3.9+ not found. Open Anaconda Prompt and retry." -ForegroundColor Yellow
  exit 1
}

$HasConda = Test-CondaAvailable
$UseCondaNoise = $false

Write-Host "Using Python: $BasePython" -ForegroundColor Green
& $BasePython --version

if ($UseVenv) {
  $major, $minor = Get-PythonVersionMajorMinor $BasePython
  if ($major -eq 3 -and $minor -ge 13) {
    Write-Host "Warning: Python 3.13+ venv cannot pip-install noise on Windows without MSVC." -ForegroundColor Yellow
  }
  $TargetPy = Ensure-Venv $BasePython
} elseif ($HasConda) {
  Write-Host "Anaconda detected: using scripts/.conda-env + conda-forge noise" -ForegroundColor Cyan
  Remove-EnvDir $Venv
  $TargetPy = Ensure-CondaEnv
  $UseCondaNoise = $true
} else {
  $TargetPy = Ensure-Venv $BasePython
}

try {
  if ($UseCondaNoise) {
    Install-CondaNoise $TargetPy
  }
  Install-WorldEnginePip $TargetPy
  Test-WorldEngine $TargetPy
} catch {
  Write-Host ""
  Write-Host $_.Exception.Message -ForegroundColor Red
  Write-Host ""
  Write-Host "If install was interrupted, retry the same command (resume supported)." -ForegroundColor Yellow
  Write-Host "For a full reset: powershell -ExecutionPolicy Bypass -File setup-worldengine.ps1 -Clean" -ForegroundColor Yellow
  exit 1
}

Write-Host ""
Write-Host "Done. WorldEngine Python:" -ForegroundColor Green
Write-Host "  $TargetPy"
