param(
  [string]$OutputDir = ".\migration-backup",
  [switch]$WithVolumes,
  [switch]$RestartAfterVolumeBackup
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

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupRoot = Join-Path $OutputDir "backup-$timestamp"
$null = New-Item -ItemType Directory -Path $backupRoot -Force

$sqlPath = Join-Path $backupRoot "huokeagent.sql"

Run-Step "Ensure postgres service is running" {
  docker compose -f $composeFile up -d postgres | Out-Null
}

Run-Step "Export PostgreSQL database to $sqlPath" {
  docker compose -f $composeFile exec -T postgres pg_dump -U huoke -d huokeagent > $sqlPath
  if ($LASTEXITCODE -ne 0) {
    throw "pg_dump failed."
  }
}

Run-Step "Copy environment files and uploads (if present)" {
  foreach ($f in @(".env", ".env.example")) {
    if (Test-Path $f) {
      Copy-Item -Path $f -Destination (Join-Path $backupRoot $f) -Force
    }
  }
  if (Test-Path "uploads") {
    Copy-Item -Path "uploads" -Destination (Join-Path $backupRoot "uploads") -Recurse -Force
  }
}

if ($WithVolumes) {
  Run-Step "Stop compose services for consistent volume snapshot" {
    docker compose -f $composeFile down
    if ($LASTEXITCODE -ne 0) {
      throw "docker compose down failed."
    }
  }

  Run-Step "Copy docker/data directory snapshot" {
    if (Test-Path "docker\data") {
      Copy-Item -Path "docker\data" -Destination (Join-Path $backupRoot "docker-data") -Recurse -Force
    }
  }

  if ($RestartAfterVolumeBackup) {
    Run-Step "Restart compose services" {
      docker compose -f $composeFile up -d
      if ($LASTEXITCODE -ne 0) {
        throw "docker compose up failed."
      }
    }
  }
}

$zipPath = "$backupRoot.zip"
Run-Step "Create zip package: $zipPath" {
  if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
  }
  Compress-Archive -Path (Join-Path $backupRoot "*") -DestinationPath $zipPath -Force
}

Write-Host ""
Write-Host "Backup completed." -ForegroundColor Green
Write-Host "Folder : $backupRoot"
Write-Host "Zip    : $zipPath"
Write-Host ""
Write-Host "Recommended migration payload:"
Write-Host "1) $zipPath"
Write-Host "2) Entire project code directory"
