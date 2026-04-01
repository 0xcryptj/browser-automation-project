param(
  [Parameter(Mandatory = $true)]
  [string]$ExtensionId,

  [string[]]$Browsers = @('chrome', 'brave')
)

$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$hostSource = Join-Path $PSScriptRoot 'BrowserAutomationNativeHost.cs'
$hostExe = Join-Path $PSScriptRoot 'browser-automation-native-host.exe'
$manifestDir = Join-Path $repoRoot 'packages\runner\.local\native-host'
$manifestPath = Join-Path $manifestDir 'com.browser_automation.host.json'

New-Item -ItemType Directory -Path $manifestDir -Force | Out-Null

& pnpm.cmd --filter @browser-automation/runner build

if ($LASTEXITCODE -ne 0) {
  throw 'Failed to build the runner runtime bundle.'
}

function Get-CscPath {
  $candidates = @(
    'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe',
    'C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe'
  )

  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) {
      return $candidate
    }
  }

  throw 'Could not find csc.exe. Install the .NET Framework compiler to build the silent native host.'
}

$csc = Get-CscPath
& $csc /nologo /target:winexe /out:$hostExe /r:System.Web.Extensions.dll $hostSource

if ($LASTEXITCODE -ne 0 -or -not (Test-Path $hostExe)) {
  throw 'Failed to build browser-automation-native-host.exe'
}

$manifest = @{
  name = 'com.browser_automation.host'
  description = 'Browser Automation local runner launcher'
  path = $hostExe
  type = 'stdio'
  allowed_origins = @("chrome-extension://$ExtensionId/")
}

$manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $manifestPath -Encoding UTF8

foreach ($browser in $Browsers) {
  switch ($browser.ToLowerInvariant()) {
    'chrome' {
      $registryPath = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.browser_automation.host'
    }
    'brave' {
      $registryPath = 'HKCU:\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\com.browser_automation.host'
    }
    default {
      throw "Unsupported browser '$browser'. Supported values: chrome, brave."
    }
  }

  New-Item -Path $registryPath -Force | Out-Null
  Set-ItemProperty -Path $registryPath -Name '(default)' -Value $manifestPath
}

Write-Output "Installed native host manifest:"
Write-Output $manifestPath
Write-Output ''
Write-Output "Registered for browsers: $($Browsers -join ', ')"
Write-Output "Allowed extension ID: $ExtensionId"
