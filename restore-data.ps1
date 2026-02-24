param(
  [Parameter(Mandatory = $true)]
  [string]$BackupPath,
  [switch]$RestoreVolumes,
  [switch]$StartAfterRestore
)

$ErrorActionPreference = "Stop"

function Run-Step {
  param(
    [string]$Message,
    [scriptblock]$Action
  )
  Write-Host "==> $Message" -ForegroundColor Cyan
  & $Action
}

$composeFile = "docker-compose.dev.yml"
if (-not (Test-Path $composeFile)) {
  throw "Cannot find $composeFile in current directory."
}

if (-not (Test-Path $BackupPath)) {
  throw "Backup path not found: $BackupPath"
}

$resolvedBackup = (Resolve-Path $BackupPath).Path
$workDir = $resolvedBackup

if ((Get-Item $resolvedBackup).PSIsContainer -eq $false) {
  if (-not $resolvedBackup.EndsWith(".zip")) {
    throw "Backup file must be a .zip archive or a backup directory."
  }
  $extractDir = Join-Path $env:TEMP ("huoke-restore-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
  Run-Step "Extract backup zip to temporary directory" {
    Expand-Archive -Path $resolvedBackup -DestinationPath $extractDir -Force
  }
  $workDir = $extractDir
}

$sqlPath = Join-Path $workDir "huokeagent.sql"
if (-not (Test-Path $sqlPath)) {
  throw "Cannot find huokeagent.sql in backup package."
}

Run-Step "Ensure postgres service is running" {
  docker compose -f $composeFile up -d postgres | Out-Null
}

Run-Step "Restore SQL dump into PostgreSQL" {
  Get-Content -Raw $sqlPath | docker compose -f $composeFile exec -T postgres psql -U huoke -d huokeagent
  if ($LASTEXITCODE -ne 0) {
    throw "psql restore failed."
  }
}

if ($RestoreVolumes) {
  $dockerDataBackup = Join-Path $workDir "docker-data"
  $uploadsBackup = Join-Path $workDir "uploads"

  Run-Step "Stop compose services before volume restore" {
    docker compose -f $composeFile down
    if ($LASTEXITCODE -ne 0) {
      throw "docker compose down failed."
    }
  }

  if (Test-Path $dockerDataBackup) {
    Run-Step "Restore docker/data snapshot" {
      if (Test-Path "docker\data") { Remove-Item -Path "docker\data" -Recurse -Force }
      Copy-Item -Path $dockerDataBackup -Destination "docker\data" -Recurse -Force
    }
  }

  if (Test-Path $uploadsBackup) {
    Run-Step "Restore uploads directory" {
      if (Test-Path "uploads") { Remove-Item -Path "uploads" -Recurse -Force }
      Copy-Item -Path $uploadsBackup -Destination "uploads" -Recurse -Force
    }
  }

  if ($StartAfterRestore) {
    Run-Step "Start compose services" {
      docker compose -f $composeFile up -d
      if ($LASTEXITCODE -ne 0) {
        throw "docker compose up failed."
      }
    }
  }
}

foreach ($f in @(".env", ".env.example")) {
  $src = Join-Path $workDir $f
  if (Test-Path $src -and -not (Test-Path $f)) {
    Run-Step "Restore missing $f file" {
      Copy-Item -Path $src -Destination $f -Force
    }
  }
}

Write-Host ""
Write-Host "Restore completed." -ForegroundColor Green
Write-Host "SQL restored from: $sqlPath"
if ($RestoreVolumes) {
  Write-Host "Volume data restore: enabled"
}
