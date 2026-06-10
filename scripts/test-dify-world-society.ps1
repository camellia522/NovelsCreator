# 探活 novel-world-society-v1（需已发布工作流）
# 用法：
#   $env:DIFY_BASE_URL = "http://127.0.0.1/v1"
#   $env:DIFY_API_KEY = "app-xxxxxxxx"
#   .\scripts\test-dify-world-society.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$samplePath = Join-Path $root "dify\world\fixtures\society-run.sample.json"

$baseUrl = $env:DIFY_BASE_URL
if (-not $baseUrl) { $baseUrl = "http://127.0.0.1/v1" }
$apiKey = $env:DIFY_API_KEY
if (-not $apiKey) {
  Write-Host "请设置环境变量 DIFY_API_KEY（novel-world-society-v1 应用的 app- Key）" -ForegroundColor Yellow
  exit 1
}

$sample = Get-Content -Raw -Encoding UTF8 $samplePath | ConvertFrom-Json
$body = @{
  inputs     = $sample.inputs
  response_mode = "blocking"
  user       = "novelscreator-setup-test"
} | ConvertTo-Json -Depth 20

$uri = ($baseUrl.TrimEnd("/")) + "/workflows/run"
Write-Host "POST $uri"

try {
  $resp = Invoke-RestMethod -Uri $uri -Method Post -Headers @{
    Authorization = "Bearer $apiKey"
    "Content-Type" = "application/json"
  } -Body $body -TimeoutSec 300
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

$outputs = $resp.data.outputs
if (-not $outputs) {
  Write-Host "无 outputs，完整响应:" -ForegroundColor Yellow
  $resp | ConvertTo-Json -Depth 8
  exit 1
}

$sj = $outputs.society_json
$nj = $outputs.nations_json
if ($sj -or $nj) {
  Write-Host "OK workflow_run_id=$($resp.data.id)" -ForegroundColor Green
  if ($sj) { Write-Host "society_json length=$($sj.Length)" }
  if ($nj) { Write-Host "nations_json length=$($nj.Length)" }
  exit 0
}

Write-Host "失败：未返回 society_json / nations_json" -ForegroundColor Red
$outputs | ConvertTo-Json -Depth 5
exit 1
