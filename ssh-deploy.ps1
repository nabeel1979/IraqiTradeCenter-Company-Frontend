param(
    [Parameter(Mandatory=$true)] [string]$User,
    [Parameter(Mandatory=$true)] [string]$Host_,
    [Parameter(Mandatory=$true)] [string]$Password,
    [Parameter(Mandatory=$true)] [string]$Command
)

# Use plink-like approach via Process with redirected stdin (works for password auth)
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "ssh.exe"
$psi.Arguments = "-o StrictHostKeyChecking=no -o LogLevel=ERROR -tt $User@$Host_ `"$Command`""
$psi.UseShellExecute = $false
$psi.RedirectStandardInput = $true
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true

$p = [System.Diagnostics.Process]::Start($psi)
Start-Sleep -Milliseconds 800
$p.StandardInput.WriteLine($Password)
$p.StandardInput.Flush()

$out = $p.StandardOutput.ReadToEndAsync()
$err = $p.StandardError.ReadToEndAsync()
$p.WaitForExit(60000) | Out-Null
Write-Host $out.Result
if ($err.Result) { Write-Host "STDERR:" $err.Result }
exit $p.ExitCode
