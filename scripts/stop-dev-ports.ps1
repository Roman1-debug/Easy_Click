$ports = @(3000, 3001, 8000)
$stopped = @{}

foreach ($port in $ports) {
    try {
        $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop
        foreach ($connection in $connections) {
            $pid = $connection.OwningProcess
            if ($pid -and -not $stopped.ContainsKey($pid)) {
                try {
                    Stop-Process -Id $pid -Force -ErrorAction Stop
                    $stopped[$pid] = $true
                    Write-Host "Stopped existing dev process on port $port (PID $pid)"
                } catch {
                    Write-Host "Could not stop PID $pid on port $port"
                }
            }
        }
    } catch {
        # No listener on this port.
    }
}

$processes = @()
try {
    $processes = Get-CimInstance Win32_Process | Where-Object {
        $_.CommandLine -and (
            $_.CommandLine -match "run_server\.py" -or
            ($_.CommandLine -match "node_modules\\next\\dist\\server\\lib\\start-server\.js" -and $_.CommandLine -match "E:\\EasyClick") -or
            ($_.CommandLine -match "next dev" -and $_.CommandLine -match "E:\\EasyClick")
        )
    }
} catch {
    $processes = @()
}

foreach ($process in $processes) {
    $procId = $process.ProcessId
    if ($procId -and -not $stopped.ContainsKey($procId)) {
        try {
            Stop-Process -Id $procId -Force -ErrorAction Stop
            $stopped[$procId] = $true
            Write-Host "Stopped lingering dev process (PID $procId)"
        } catch {
            Write-Host "Could not stop lingering PID $procId"
        }
    }
}
