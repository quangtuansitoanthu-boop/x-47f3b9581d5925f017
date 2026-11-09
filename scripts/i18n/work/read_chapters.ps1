$json = Get-Content static/offline-data/chapters/tt_klngl_q06.json -Raw
$data = $json | ConvertFrom-Json

# Chapter 0
$ch0 = $data[0]
Write-Host "=== CHAPTER 0 ==="
Write-Host "Title: $($ch0.tieu_de)"
Write-Host "Summary: $($ch0.tom_tat)"
Write-Host ""
Write-Host "Content (first 5000 chars):"
Write-Host $($ch0.noi_dung.Substring(0, [Math]::Min(5000, $ch0.noi_dung.Length)))

Write-Host ""
Write-Host "=== CHAPTER 1 ==="
$ch1 = $data[1]
Write-Host "Title: $($ch1.tieu_de)"
Write-Host "Summary: $($ch1.tom_tat)"
Write-Host ""
Write-Host "Content (first 5000 chars):"
Write-Host $($ch1.noi_dung.Substring(0, [Math]::Min(5000, $ch1.noi_dung.Length)))