Add-Type -AssemblyName System.Drawing
$inputFile = "c:\Ajay Porject\Main App Development\Second App Development\public\app-icon.png"
$outputFile = "c:\Ajay Porject\Main App Development\Second App Development\public\app-icon-1200x1200.png"

$img = [System.Drawing.Image]::FromFile($inputFile)
$bmp = New-Object System.Drawing.Bitmap 1200, 1200
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.DrawImage($img, 0, 0, 1200, 1200)

$outputFileJpg = "c:\Ajay Porject\Main App Development\Second App Development\public\app-icon-1200x1200.jpg"

$encoder = [System.Drawing.Imaging.Encoder]::Quality
$encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
$encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter($encoder, 85L)
$jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }

$bmp.Save($outputFileJpg, $jpegCodec, $encoderParams)

$g.Dispose()
$bmp.Dispose()
$img.Dispose()
Write-Host "Successfully generated 1200x1200px JPG app icon!"
