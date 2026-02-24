param(
  [string]$WebBase = "http://localhost:3000",
  [string]$ApiBase = "http://localhost:4000",
  [switch]$RunSelftests
)

$ErrorActionPreference = "Stop"

function Step($msg) {
  Write-Host "==> $msg" -ForegroundColor Cyan
}

function Pass($msg) {
  Write-Host "[PASS] $msg" -ForegroundColor Green
}

function Fail($msg) {
  Write-Host "[FAIL] $msg" -ForegroundColor Red
}

$failed = $false

function Check-UrlStatus {
  param(
    [string]$Name,
    [string]$Url
  )
  try {
    $res = Invoke-WebRequest -Uri $Url -Method Get -TimeoutSec 12
    if ($res.StatusCode -ge 200 -and $res.StatusCode -lt 400) {
      Pass "$Name ($($res.StatusCode))"
    } else {
      Fail "$Name returned $($res.StatusCode)"
      $script:failed = $true
    }
  } catch {
    Fail "$Name unreachable: $($_.Exception.Message)"
    $script:failed = $true
  }
}

Step "Check backend health"
try {
  $health = Invoke-RestMethod -Uri "$ApiBase/health" -Method Get -TimeoutSec 12
  if ($health.ok -eq $true -and $health.checks.database.ok -eq $true) {
    Pass "Backend health OK (database OK)"
  } else {
    Fail "Backend health not OK: $($health | ConvertTo-Json -Compress)"
    $failed = $true
  }
} catch {
  Fail "Backend health failed: $($_.Exception.Message)"
  $failed = $true
}

Step "Check key web routes"
Check-UrlStatus -Name "Home" -Url "$WebBase/"
Check-UrlStatus -Name "Login" -Url "$WebBase/login"
Check-UrlStatus -Name "Register" -Url "$WebBase/register"
Check-UrlStatus -Name "Service" -Url "$WebBase/service"
Check-UrlStatus -Name "Tickets" -Url "$WebBase/tickets"
Check-UrlStatus -Name "Dashboard" -Url "$WebBase/dashboard"

if ($RunSelftests) {
  Step "Run selftest: ticket attachments"
  pnpm selftest:ticket-attachments
  if ($LASTEXITCODE -eq 0) {
    Pass "selftest:ticket-attachments"
  } else {
    Fail "selftest:ticket-attachments failed"
    $failed = $true
  }

  Step "Run selftest: widget modules"
  pnpm selftest:widget-modules
  if ($LASTEXITCODE -eq 0) {
    Pass "selftest:widget-modules"
  } else {
    Fail "selftest:widget-modules failed"
    $failed = $true
  }
}

Write-Host ""
if ($failed) {
  Write-Host "Migration verification finished with failures." -ForegroundColor Red
  exit 1
}

Write-Host "Migration verification completed successfully." -ForegroundColor Green
exit 0
