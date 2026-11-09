$json = Get-Content static/offline-data/chapters/tt_klngl_q06.json -Raw
$data = $json | ConvertFrom-Json
Write-Host "Total chapters: $($data.Count)"
for ($i=0; $i -lt $data.Count; $i++) {
    $ch = $data[$i]
    $title = $ch.tieu_de.Substring(0, [Math]::Min(80, $ch.tieu_de.Length))
    $msg = "Chapter " + $i + ": id=$($ch.id), so_thu_tu=$($ch.so_thu_tu), title=$title"
    Write-Host $msg
    $msg2 = "  Content length: $($ch.noi_dung.Length)"
    Write-Host $msg2
}