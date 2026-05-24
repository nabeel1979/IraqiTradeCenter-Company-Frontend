param(
    [Parameter(Mandatory=$true)] [string]$LocalPath,    # local source folder
    [Parameter(Mandatory=$true)] [string]$RemotePath,   # remote destination root, e.g. /D:/iraqitradecenter/IraqiTradeCenter_Company
    [Parameter(Mandatory=$true)] [PSCredential]$Credential,
    # ‎ملفات يجب عدم استبدالها على السيرفر (مثل appsettings.Production.json
    # ‎الذي يحوي connection string الإنتاج بكلمة سر صحيحة، بينما النسخة المحلية
    # ‎فيها placeholder "CHANGE_ME"). أيضاً مجلدات بأكملها مثل Logs.
    [string[]]$ExcludeNames = @('appsettings.Production.json', 'Logs', 'logs')
)

Import-Module Posh-SSH -Force
$session = New-SFTPSession -ComputerName '65.20.159.30' -Credential $Credential -AcceptKey -ConnectionTimeout 60
if (-not $session) { throw "SFTP session failed" }
$sid = $session.SessionId

function Ensure-RemoteDir {
    param([string]$Path)
    # Try to create directory; ignore error if exists
    try { New-SFTPItem -SessionId $sid -Path $Path -ItemType Directory -ErrorAction Stop | Out-Null }
    catch { } # exists already
}

function Upload-Folder {
    param([string]$LocalDir, [string]$RemoteDir)
    Ensure-RemoteDir -Path $RemoteDir
    $items = Get-ChildItem -LiteralPath $LocalDir -Force
    foreach ($it in $items) {
        if ($ExcludeNames -contains $it.Name) {
            Write-Host ("  SKIP " + $it.Name + " (excluded)") -ForegroundColor Yellow
            continue
        }
        $remoteChild = ($RemoteDir.TrimEnd('/') + '/' + $it.Name)
        if ($it.PSIsContainer) {
            Upload-Folder -LocalDir $it.FullName -RemoteDir $remoteChild
        } else {
            try {
                Set-SFTPItem -SessionId $sid -Path $it.FullName -Destination $RemoteDir -Force -ErrorAction Stop
                Write-Host ("  OK  " + $remoteChild)
            } catch {
                Write-Host ("  ERR " + $remoteChild + " :: " + $_.Exception.Message) -ForegroundColor Red
            }
        }
    }
}

$start = Get-Date
Upload-Folder -LocalDir $LocalPath -RemoteDir $RemotePath
$elapsed = ((Get-Date) - $start).TotalSeconds
Write-Host ("DONE in {0:N1}s" -f $elapsed)
Remove-SFTPSession -SessionId $sid | Out-Null
