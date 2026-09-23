$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $projectRoot
Write-Host 'PROCUREMENT SMILE - Cau hinh Gmail trung gian'
Write-Host 'Tao Gmail, bat Xac minh 2 buoc, tao Mat khau ung dung truoc.'
Write-Host 'Khong dung mat khau dang nhap Gmail thong thuong.'
$gmailAddress = Read-Host 'Dia chi Gmail [prc.cjgmd@gmail.com]'
if ([string]::IsNullOrWhiteSpace($gmailAddress)) { $gmailAddress = 'prc.cjgmd@gmail.com' }
$gmailAddress = $gmailAddress.Trim().ToLowerInvariant()
if ($gmailAddress -notmatch '^[a-z0-9._%+-]+@gmail\.com$') { throw 'Can dia chi Gmail hop le.' }
$securePassword = Read-Host 'Mat khau ung dung (16 ky tu, nhap an)' -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
    $appPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer) -replace '\s',''
    if ($appPassword -notmatch '^[a-zA-Z0-9]{16}$') { throw 'Mat khau ung dung can dung 16 ky tu.' }
    $env:GMAIL_USER = $gmailAddress
    $env:GMAIL_APP_PASSWORD = $appPassword
    Write-Host 'Dang kiem tra ket noi Gmail. Buoc nay KHONG gui email.'
    & node (Join-Path $PSScriptRoot 'verify-gmail.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'Chua luu cau hinh. Hay kiem tra Gmail/mat khau ung dung va thu lai.' }
    $configPath = Join-Path $projectRoot '.env'
    if (Test-Path -LiteralPath $configPath) { $configText = [IO.File]::ReadAllText($configPath) }
    else { $configText = [IO.File]::ReadAllText((Join-Path $projectRoot '.env.example')) }
    $values = @{MAIL_PROVIDER='GMAIL';GMAIL_USER=$gmailAddress;GMAIL_APP_PASSWORD=$appPassword;MAIL_ENABLED='true'}
    foreach ($key in $values.Keys) {
        $entry = $key + '=' + $values[$key]
        $pattern = '(?m)^' + [regex]::Escape($key) + '=.*$'
        if ([regex]::IsMatch($configText,$pattern)) { $configText = [regex]::Replace($configText,$pattern,$entry) }
        else { $configText += "`r`n" + $entry }
    }
    [IO.File]::WriteAllText($configPath,$configText,[Text.UTF8Encoding]::new($false))
    Write-Host 'Da luu. Dung website bang Ctrl+C, roi chay START-WEBSITE.cmd.'
    Write-Host 'Sau khi khoi dong, cac email dang cho cau hinh se duoc gui tu dong.'
    Write-Host 'Email UNKNOWN/PARTIAL/FAILED: kiem tra Trung tam email de gui lai.'
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
    $appPassword = $null
    Remove-Item Env:GMAIL_APP_PASSWORD -ErrorAction SilentlyContinue
}
