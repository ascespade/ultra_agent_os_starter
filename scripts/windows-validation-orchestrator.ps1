# Ultra Agent OS - Windows Native Validation Orchestrator
$ErrorActionPreference = "Stop"
$LogFile = "d:\Github\ultra_agent_os_starter\WINDOWS_NATIVE_VALIDATION_REPORT.md"
$PassFailFile = "d:\Github\ultra_agent_os_starter\PASS_FAIL_TABLE.md"
$VerdictFile = "d:\Github\ultra_agent_os_starter\FINAL_DECISION.json"

function Log-Header {
    param($Title)
    Write-Host "`n=== $Title ===" -ForegroundColor Cyan
    Add-Content -Path $LogFile -Value "`n## $Title`n"
}

function Log-Step {
    param($Message, $Status)
    $Icon = if ($Status -eq "PASS") { "✅" } else { "❌" }
    
    if ($Status -eq "PASS") {
        Write-Host "$Icon $Message" -ForegroundColor Green
    } else {
        Write-Host "$Icon $Message" -ForegroundColor Red
    }
    
    Add-Content -Path $LogFile -Value "- $Icon **$Message**: $Status"
    
    # Add to Pass/Fail Table
    $Time = Get-Date -Format 'HH:mm:ss'
    $Row = "| $Message | $Status | $Time |"
    Add-Content -Path $PassFailFile -Value $Row
    
    if ($Status -eq "FAIL" -and $Global:AbortOnFailure) {
        Write-Error "CRITICAL FAILURE: $Message"
    }
}

# Init Reports
" # Windows Native Validation Report`n**Date**: $(Get-Date)`n" | Set-Content -Path $LogFile
"| Check | Status | Time |`n|---|---|---|" | Set-Content -Path $PassFailFile
$Global:AbortOnFailure = $true

try {
    # PHASE 0: Environment
    Log-Header "PHASE 0: Environment Verification"
    
    $NodeVer = node -v
    if ($NodeVer) { Log-Step "Node.js Version ($NodeVer)" "PASS" } else { Log-Step "Node.js Installed" "FAIL" }
    
    $NpmVer = npm -v
    if ($NpmVer) { Log-Step "npm Version ($NpmVer)" "PASS" } else { Log-Step "npm Installed" "FAIL" }

    $Ports = @{5432="PostgreSQL"; 6379="Redis"; 11434="Ollama"}
    foreach ($Port in $Ports.Keys) {
        $Conn = Test-NetConnection -ComputerName localhost -Port $Port -InformationLevel Quiet
        if ($Conn) { Log-Step "$($Ports[$Port]) (Port $Port)" "PASS" } else { Log-Step "$($Ports[$Port]) (Port $Port)" "FAIL" }
    }

    # PHASE 1: Bootstrap
    Log-Header "PHASE 1: Project Bootstrap"
    
    Write-Host "Running npm install..."
    cmd /c "npm install 2>&1" | Out-Null
    if ($LASTEXITCODE -eq 0) { Log-Step "npm install" "PASS" } else { Log-Step "npm install" "FAIL" }
    
    Write-Host "Setting up env..."
    node scripts/setup-env.js --force
    if (Test-Path ".env.local") { Log-Step ".env.local created" "PASS" } else { Log-Step ".env.local created" "FAIL" }

    # Not running migrations explicitly as requested to use npm run start:prod which might rely on auto-sync or existing db, 
    # but let's check basic DB connectivity via a script if needed. Assuming Start will handle connection.

    # PHASE 2: Startup
    Log-Header "PHASE 2: Single Process Startup"
    
    Write-Host "Starting Server..."
    $ProcessInfo = New-Object System.Diagnostics.ProcessStartInfo
    $ProcessInfo.FileName = "npm"
    $ProcessInfo.Arguments = "run start:prod"
    $ProcessInfo.WorkingDirectory = "d:\Github\ultra_agent_os_starter"
    $ProcessInfo.RedirectStandardOutput = $true
    $ProcessInfo.RedirectStandardError = $true
    $ProcessInfo.UseShellExecute = $false
    
    $ServerProcess = [System.Diagnostics.Process]::Start($ProcessInfo)
    $Global:ServerId = $ServerProcess.Id
    
    Log-Step "Server Process Started (PID: $Global:ServerId)" "PASS"
    
    # Wait for Health
    $ServerUp = $false
    for ($i=0; $i -lt 30; $i++) {
        try {
            $Response = Invoke-RestMethod -Uri "http://localhost:3000/health" -Method Get -ErrorAction SilentlyContinue
            if ($Response.status -eq "healthy") {
                $ServerUp = $true
                break
            }
        } catch { Start-Sleep -Seconds 2 }
        Write-Host "." -NoNewline
    }
    Write-Host ""
    
    if ($ServerUp) { Log-Step "API Health Check (http://localhost:3000/health)" "PASS" } else { Log-Step "API Health Check" "FAIL" }

    # PHASE 3: Functional Tests
    Log-Header "PHASE 3: Functional Tests"
    
    cmd /c "node scripts/validate-system.js"
    if ($LASTEXITCODE -eq 0) { Log-Step "System Validation Script" "PASS" } else { Log-Step "System Validation Script" "FAIL" }
    
    # PHASE 4 & 5 covers Worker and LLM (validate-system covers basic flow, extending via stress test)
    
    # PHASE 6: Stress Test
    Log-Header "PHASE 6: Stress & Stability"
    cmd /c "node scripts/stress-test.js"
    if ($LASTEXITCODE -eq 0) { Log-Step "Stress Test (30 requests)" "PASS" } else { Log-Step "Stress Test" "FAIL" }
    
    # PHASE 7: UI Check
    try {
        $UI = Invoke-WebRequest -Uri "http://localhost:3000/ui/" -UseBasicParsing
        if ($UI.StatusCode -eq 200) { Log-Step "UI Accessible" "PASS" } else { Log-Step "UI Accessible" "FAIL" }
    } catch { Log-Step "UI Accessible" "FAIL" }

    # Final Verification
    $Verdict = @{
        decision = "READY_FOR_PRODUCTION_CORE"
        timestamp = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
        metrics = @{
            functional_pass_rate = 100
        }
    }
    $Verdict | ConvertTo-Json | Set-Content $VerdictFile
    
} catch {
    Write-Error $_.Exception.Message
    $Verdict = @{ decision = "NOT_READY"; error = $_.Exception.Message }
    $Verdict | ConvertTo-Json | Set-Content $VerdictFile
    exit 1
} finally {
    if ($ServerProcess -and -not $ServerProcess.HasExited) {
        Write-Host "Stopping Server..."
        Stop-Process -Id $ServerProcess.Id -Force -ErrorAction SilentlyContinue
        # Also kill node processes just in case
        Stop-Process -Name "node" -ErrorAction SilentlyContinue
    }
}
