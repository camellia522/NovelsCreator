# 探活 novel-outline-generation-v1（需已在 Dify 发布工作流）
# 用法：
#   $env:DIFY_BASE_URL = "http://127.0.0.1/v1"
#   $env:DIFY_API_KEY = "app-xxxxxxxx"
#   .\scripts\test-dify-outline.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$samplePath = Join-Path $root "dify\outline\fixtures\outline-run.sample.json"

$baseUrl = $env:DIFY_BASE_URL
if (-not $baseUrl) { $baseUrl = "http://127.0.0.1/v1" }
$apiKey = $env:DIFY_API_KEY
if (-not $apiKey) {
  Write-Host "请设置环境变量 DIFY_API_KEY（novel-outline-generation-v1 应用的 app- Key）" -ForegroundColor Yellow
  exit 1
}

$sample = Get-Content -Raw -Encoding UTF8 $samplePath | ConvertFrom-Json
$body = @{
  inputs        = $sample.inputs
  response_mode = "blocking"
  user          = "novelscreator-outline-setup-test"
} | ConvertTo-Json -Depth 20

$uri = ($baseUrl.TrimEnd("/")) + "/workflows/run"
Write-Host "POST $uri"

try {
  $resp = Invoke-RestMethod -Uri $uri -Method Post -Headers @{
    Authorization  = "Bearer $apiKey"
    "Content-Type" = "application/json"
  } -Body $body -TimeoutSec 900
} catch {
  Write-Host "请求失败:" -ForegroundColor Red
  if ($_.Exception.Response) {
    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    Write-Host $reader.ReadToEnd()
  } else {
    Write-Host $_.Exception.Message
  }
  exit 1
}

if ($resp.data.status -eq "failed") {
  Write-Host "工作流 failed: $($resp.data.error)" -ForegroundColor Red
  exit 1
}

$outputs = $resp.data.outputs
if (-not $outputs) {
  Write-Host "无 outputs，完整响应:" -ForegroundColor Yellow
  $resp | ConvertTo-Json -Depth 8
  exit 1
}

$status = $outputs.status
Write-Host "status=$status workflow_run_id=$($resp.data.id)" -ForegroundColor $(if ($status -eq "success") { "Green" } else { "Yellow" })

if ($outputs.outline_json) {
  Write-Host "outline_json length=$($outputs.outline_json.Length)"
}
if ($outputs.outline_summary) {
  Write-Host "outline_summary: $($outputs.outline_summary.Substring(0, [Math]::Min(120, $outputs.outline_summary.Length)))..."
}
if ($outputs.retry_issues_formatted) {
  Write-Host "retry_issues:`n$($outputs.retry_issues_formatted)"
}

if ($status -eq "success" -and $outputs.outline_json) {
  exit 0
}
if ($status -eq "retry") {
  Write-Host "校验未通过，客户端可带上 retry_issues_formatted 再 POST" -ForegroundColor Yellow
  exit 0
}

Write-Host "未得到 success + outline_json" -ForegroundColor Red
$outputs | ConvertTo-Json -Depth 5
exit 1
