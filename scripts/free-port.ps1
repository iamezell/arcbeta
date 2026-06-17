param(
  [int]$Port = 443,
  [switch]$Kill,
  [switch]$Force
)

$ErrorActionPreference = "Stop"

function Get-ListeningConnections {
  try {
    return @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
  } catch {
    Write-Warning "Could not query listening ports with Get-NetTCPConnection: $($_.Exception.Message)"
    return @()
  }
}

$connections = Get-ListeningConnections

if ($connections.Count -eq 0) {
  Write-Host "Port $Port is free. Nothing to stop."
  exit 0
}

$owners = $connections | Select-Object -ExpandProperty OwningProcess -Unique

Write-Host "Port $Port is currently in use by:"
foreach ($processId in $owners) {
  $process = Get-Process -Id $processId -ErrorAction SilentlyContinue

  if ($process) {
    Write-Host "  PID $processId - $($process.ProcessName)"
  } else {
    Write-Host "  PID $processId - unknown process"
  }
}

if (-not $Kill) {
  Write-Host ""
  Write-Host "To stop the process, run:"
  Write-Host "  npm run free:443:kill"
  Write-Host ""
  Write-Host "Or for another port:"
  Write-Host "  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/free-port.ps1 -Port <port> -Kill"
  exit 1
}

foreach ($processId in $owners) {
  if ($processId -eq 0 -or $processId -eq 4) {
    Write-Warning "Skipping PID $processId because it is a protected system process."
    continue
  }

  $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
  $processName = if ($process) { $process.ProcessName } else { "unknown process" }

  if (-not $Force) {
    $answer = Read-Host "Stop PID $processId ($processName)? Type y to continue"
    if ($answer -ne "y" -and $answer -ne "Y") {
      Write-Host "Skipped PID $processId."
      continue
    }
  }

  try {
    if ($Force) {
      Stop-Process -Id $processId -Force -ErrorAction Stop
    } else {
      Stop-Process -Id $processId -ErrorAction Stop
    }

    Write-Host "Stopped PID $processId ($processName)."
  } catch {
    Write-Error "Failed to stop PID $processId ($processName): $($_.Exception.Message)"
  }
}

$remainingConnections = Get-ListeningConnections
if ($remainingConnections.Count -eq 0) {
  Write-Host "Port $Port is now free."
} else {
  Write-Warning "Port $Port is still in use. You may need to run this terminal as Administrator."
  exit 1
}
