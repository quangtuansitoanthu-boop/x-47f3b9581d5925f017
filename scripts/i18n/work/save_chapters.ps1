$json = Get-Content static/offline-data/chapters/tt_klngl_q06.json -Raw
$data = $json | ConvertFrom-Json

# Chapter 0 - full content
$ch0 = $data[0]
$ch0.noi_dung | Out-File -FilePath scripts/i18n/work/ch0_vi.html -Encoding utf8
Write-Host "Chapter 0 saved, length: $($ch0.noi_dung.Length)"

# Chapter 1 - full content
$ch1 = $data[1]
$ch1.noi_dung | Out-File -FilePath scripts/i18n/work/ch1_vi.html -Encoding utf8
Write-Host "Chapter 1 saved, length: $($ch1.noi_dung.Length)"