param(
  [Parameter(Mandatory = $true)]
  [string]$ExtensionId,

  [string[]]$Browsers = @('chrome', 'brave')
)

$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$hostCmd = Join-Path $PSScriptRoot 'browser-automation-native-host.cmd'
$manifestDir = Join-Path $repoRoot 'packages\runner\.local\native-host'
$manifestPath = Join-Path $manifestDir 'com.browser_automation.host.json'

New-Item -ItemType Directory -Path $manifestDir -Force | Out-Null

$manifest = @{
  name = 'com.browser_automation.host'
  description = 'Browser Automation local runner launcher'
  path = $hostCmd
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
