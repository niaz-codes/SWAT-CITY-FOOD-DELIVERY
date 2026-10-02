<#
    Builds the app icon / splash / in-app logo variants from the PROVIDED
    artwork in Images\ (logo.png / icon.png). The artwork itself is never
    redrawn - only keyed and resized for each platform requirement:

      * icon.png           opaque 1024x1024  -> iOS / Android legacy launcher
      * adaptive-icon.png  transparent fg    -> Android adaptive foreground
                                                (mark kept inside the 66%
                                                safe zone so no launcher mask
                                                can clip it)
      * splash-icon.png    transparent       -> splash + in-app <Image>
      * logo.png           transparent       -> full-res transparent master

    Why keying is required: the source is 24bpp RGB with an opaque
    near-white background. An opaque square used as an Android adaptive
    foreground renders as a white box, and as a splash image it clashes
    with the deep-teal brand background.

    Usage:  powershell -ExecutionPolicy Bypass -File scripts\build-assets.ps1
#>

param(
    [string]$SourceDir = "Images",
    [string]$OutDir   = "assets"
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

function Write-Step($msg) { Write-Host "  $msg" }

if (-not (Test-Path -LiteralPath $OutDir)) {
    New-Item -ItemType Directory -Path $OutDir | Out-Null
}

# ---------------------------------------------------------------------------
# 1. Load the provided artwork
# ---------------------------------------------------------------------------

$logoPath = Join-Path $SourceDir 'logo.png'
$iconPath = Join-Path $SourceDir 'icon.png'

if (-not (Test-Path -LiteralPath $logoPath)) { throw "Missing source: $logoPath" }
if (-not (Test-Path -LiteralPath $iconPath)) { throw "Missing source: $iconPath" }

$source = New-Object System.Drawing.Bitmap($logoPath)
$srcW = $source.Width
$srcH = $source.Height
Write-Step "source logo.png ${srcW}x${srcH} ($((Get-Item $logoPath).Length / 1KB | ForEach-Object { '{0:N0}' -f $_ }) KB)"

# ---------------------------------------------------------------------------
# 2. Work out the background colour from the corners
# ---------------------------------------------------------------------------

function Get-CornerColor($bmp) {
    $pts = @(
        $bmp.GetPixel(2, 2),
        $bmp.GetPixel($bmp.Width - 3, 2),
        $bmp.GetPixel(2, $bmp.Height - 3),
        $bmp.GetPixel($bmp.Width - 3, $bmp.Height - 3),
        $bmp.GetPixel([int]($bmp.Width / 2), 2)
    )
    $avgR = ($pts | Measure-Object -Property R -Average).Average
    $avgG = ($pts | Measure-Object -Property G -Average).Average
    $avgB = ($pts | Measure-Object -Property B -Average).Average
    return @{ R = [int]$avgR; G = [int]$avgG; B = [int]$avgB }
}

$bg = Get-CornerColor $source
Write-Step "background colour detected: R=$($bg.R) G=$($bg.G) B=$($bg.B)"

# ---------------------------------------------------------------------------
# 3. Find the tight bounding box of the non-background artwork
# ---------------------------------------------------------------------------

function Get-ContentBounds($bmp, $bg, $tolerance) {
    $d = $bmp.LockBits((New-Object System.Drawing.Rectangle(0, 0, $bmp.Width, $bmp.Height)),
                       [System.Drawing.Imaging.ImageLockMode]::ReadOnly,
                       [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $stride = $d.Stride
    $bytes = New-Object byte[] ($stride * $bmp.Height)
    [System.Runtime.InteropServices.Marshal]::Copy($d.Scan0, $bytes, 0, $bytes.Length)
    $bmp.UnlockBits($d)

    $bgR = [double]$bg.R; $bgG = [double]$bg.G; $bgB = [double]$bg.B
    $tol2 = [double]$tolerance * $tolerance

    $minX = $bmp.Width; $maxX = -1; $minY = $bmp.Height; $maxY = -1
    for ($y = 0; $y -lt $bmp.Height; $y += 2) {
        $row = $y * $stride
        for ($x = 0; $x -lt $bmp.Width; $x += 2) {
            $i = $row + ($x * 3)
            $dr = $bytes[$i + 2] - $bgR
            $dg = $bytes[$i + 1] - $bgG
            $db = $bytes[$i] - $bgB
            if (($dr * $dr + $dg * $dg + $db * $db) -gt $tol2) {
                if ($x -lt $minX) { $minX = $x }
                if ($x -gt $maxX) { $maxX = $x }
                if ($y -lt $minY) { $minY = $y }
                if ($y -gt $maxY) { $maxY = $y }
            }
        }
    }
    if ($maxX -lt 0) { throw 'No artwork found - is the tolerance too high?' }
    return @{ X = $minX; Y = $minY; W = ($maxX - $minX + 1); H = ($maxY - $minY + 1) }
}

$TOL = 42
$bounds = Get-ContentBounds $source $bg $TOL
Write-Step "artwork bounds: x=$($bounds.X) y=$($bounds.Y) w=$($bounds.W) h=$($bounds.H)"
Write-Step ("artwork occupies {0:N1}% of the canvas" -f (($bounds.W * $bounds.H) / ($srcW * $srcH) * 100))

# ---------------------------------------------------------------------------
# 4. Key out the background -> 32bpp ARGB master
# ---------------------------------------------------------------------------

# Feathered threshold: fully transparent inside the background tolerance, fully
# opaque past $killAt, and a linear ramp across the band so anti-aliased edges
# keep a soft alpha ramp instead of turning into dark fringes on the teal
# splash background.
$TOL   = 42.0
$killAt = 150.0

# Read the source through LockBits rather than GetPixel: ~1.6M pixels makes the
# per-pixel accessor path unusably slow.
$sd = $source.LockBits((New-Object System.Drawing.Rectangle(0, 0, $srcW, $srcH)),
                       [System.Drawing.Imaging.ImageLockMode]::ReadOnly,
                       [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$srcStride = $sd.Stride
$srcBytes = New-Object byte[] ($srcStride * $srcH)
[System.Runtime.InteropServices.Marshal]::Copy($sd.Scan0, $srcBytes, 0, $srcBytes.Length)
$source.UnlockBits($sd)

$master = New-Object System.Drawing.Bitmap($srcW, $srcH, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$md = $master.LockBits((New-Object System.Drawing.Rectangle(0, 0, $srcW, $srcH)),
                        [System.Drawing.Imaging.ImageLockMode]::WriteOnly,
                        [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$mStride = $md.Stride
$mBytes = New-Object byte[] ($mStride * $srcH)

$bgR = [double]$bg.R; $bgG = [double]$bg.G; $bgB = [double]$bg.B
$span = $killAt - $TOL

for ($y = 0; $y -lt $srcH; $y++) {
    $sRow = $y * $srcStride
    $mRow = $y * $mStride
    for ($x = 0; $x -lt $srcW; $x++) {
        $si = $sRow + ($x * 3)
        $b = $srcBytes[$si]; $g2 = $srcBytes[$si + 1]; $r = $srcBytes[$si + 2]

        $dr = $r - $bgR; $dg = $g2 - $bgG; $db = $b - $bgB
        $dist = [Math]::Sqrt($dr * $dr + $dg * $dg + $db * $db)

        if ($dist -le $TOL)   { $a = 0 }
        elseif ($dist -ge $killAt) { $a = 255 }
        else { $a = [int](255 * (($dist - $TOL) / $span)) }

        $mi = $mRow + ($x * 4)
        $mBytes[$mi]     = $b    # BGRA little-endian
        $mBytes[$mi + 1] = $g2
        $mBytes[$mi + 2] = $r
        $mBytes[$mi + 3] = [byte]$a
    }
}

[System.Runtime.InteropServices.Marshal]::Copy($mBytes, 0, $md.Scan0, $mBytes.Length)
$master.UnlockBits($md)
$source.Dispose()
Write-Step "background keyed out (tolerance $TOL, feather to $killAt)"

function Save-Png($bmp, $path) {
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $size = (Get-Item $path).Length / 1KB
    Write-Step ("{0,-22} {1,5}x{2,-5} {3,7:N0} KB" -f (Split-Path $path -Leaf), $bmp.Width, $bmp.Height, $size)
}

# ---------------------------------------------------------------------------
# 5. Variants
# ---------------------------------------------------------------------------

# 5a. Full-res transparent master, used by the in-app <BrandLogo> component.
Save-Png $master (Join-Path $OutDir 'logo.png')

# 5a-2. Tight crop around the artwork (2% breathing room). The provided canvas
#       has a wide empty margin, so rendering the full square would make the
#       visible mark far smaller than the requested `size`. Cropping makes
#       `size` mean the artwork's actual extent.
$pad = [int]($bounds.W * 0.02)
$cropX = [Math]::Max(0, $bounds.X - $pad)
$cropY = [Math]::Max(0, $bounds.Y - $pad)
$cropW = [Math]::Min($srcW - $cropX, $bounds.W + (2 * $pad))
$cropH = [Math]::Min($srcH - $cropY, $bounds.H + (2 * $pad))

$cropped = New-Object System.Drawing.Bitmap($cropW, $cropH, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($cropped)
$g.Clear([System.Drawing.Color]::Transparent)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.DrawImage($master,
    (New-Object System.Drawing.Rectangle(0, 0, $cropW, $cropH)),
    (New-Object System.Drawing.Rectangle($cropX, $cropY, $cropW, $cropH)),
    [System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose()
Save-Png $cropped (Join-Path $OutDir 'logo-cropped.png')

# 5a-3. Half-resolution crop for <Image> use on device. React Native scales the
#       PNG down anyway, so shipping 2x the pixels only costs bundle size.
$half = [int]([Math]::Floor($cropW / 2))
$halfH = [int]([Math]::Floor($cropH / 2))
$logoUi = New-Object System.Drawing.Bitmap($half, $halfH, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($logoUi)
$g.Clear([System.Drawing.Color]::Transparent)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.DrawImage($cropped, (New-Object System.Drawing.Rectangle(0, 0, $half, $halfH)))
$g.Dispose()
Save-Png $logoUi (Join-Path $OutDir 'logo-ui.png')
$cropped.Dispose()

# 5b. Splash logo - a touch smaller than the master so it sits well on the
#     splash gradient at the sizes the current splash config requests.
$splash = New-Object System.Drawing.Bitmap(512, 512, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($splash)
$g.Clear([System.Drawing.Color]::Transparent)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.DrawImage($master, (New-Object System.Drawing.Rectangle(0, 0, 512, 512)))
$g.Dispose()
Save-Png $splash (Join-Path $OutDir 'splash-icon.png')

# 5c. Android adaptive FOREGROUND. Android only guarantees the inner 66% of the
#     108dp canvas survives every launcher mask, so the artwork is inset well
#     inside that circle and the canvas is transparent.
$adaptive = New-Object System.Drawing.Bitmap(1024, 1024, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($adaptive)
$g.Clear([System.Drawing.Color]::Transparent)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$safeInset = 0.62   # artwork diameter -> 62% of the 1024 canvas
$markSize = [int](1024 * $safeInset)
$markOffset = [int]((1024 - $markSize) / 2)
$g.DrawImage($master, (New-Object System.Drawing.Rectangle($markOffset, $markOffset, $markSize, $markSize)))
$g.Dispose()
Save-Png $adaptive (Join-Path $OutDir 'adaptive-icon.png')

# 5d. Legacy square launcher icon. Opaque, artwork padded onto brand teal so it
#     still reads on both light and dark launcher themes.
$legacy = New-Object System.Drawing.Bitmap(1024, 1024, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($legacy)
$g.Clear([System.Drawing.Color]::FromArgb(255, 14, 63, 58))   # #0E3F3A
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$legacyMark = [int](1024 * 0.70)
$legacyOff = [int]((1024 - $legacyMark) / 2)
$g.DrawImage($master, (New-Object System.Drawing.Rectangle($legacyOff, $legacyOff, $legacyMark, $legacyMark)))
$g.Dispose()
Save-Png $legacy (Join-Path $OutDir 'icon-legacy.png')

# 5e. iOS launcher icon: 1024x1024 and FULLY OPAQUE (Apple rejects alpha).
#     The provided artwork is already opaque, so this is a straight resize -
#     no keying, no recolouring.
$ios = New-Object System.Drawing.Bitmap(1024, 1024, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$g = [System.Drawing.Graphics]::FromImage($ios)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.Clear([System.Drawing.Color]::White)
$iconSrc = [System.Drawing.Image]::FromFile((Resolve-Path $iconPath).Path)
$g.DrawImage($iconSrc, (New-Object System.Drawing.Rectangle(0, 0, 1024, 1024)))
$iconSrc.Dispose()
$g.Dispose()
Save-Png $ios (Join-Path $OutDir 'icon.png')

# 5f. Android status-bar notification icon. Android requires a WHITE silhouette
#     on transparency for notification small icons (it tints them itself and
#     silently drops notifications that ship a coloured bitmap). One master at
#     xxxhdpi; the config plugin scales the rest.
$notifBase = 432
$notif = New-Object System.Drawing.Bitmap($notifBase, $notifBase, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$nd = $notif.LockBits((New-Object System.Drawing.Rectangle(0, 0, $notifBase, $notifBase)),
                       [System.Drawing.Imaging.ImageLockMode]::WriteOnly,
                       [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$nStride = $nd.Stride
$nBytes = New-Object byte[] ($nStride * $notifBase)

# Reuse the crop rect so the notification glyph matches the brand lockup.
for ($y = 0; $y -lt $notifBase; $y++) {
    $nRow = $y * $nStride
    $sy = $cropY + [int](($y / $notifBase) * $cropH)
    $sRow2 = $sy * $srcStride
    for ($x = 0; $x -lt $notifBase; $x++) {
        $sx = $cropX + [int](($x / $notifBase) * $cropW)
        $si = $sRow2 + ($sx * 3)
        $ni = $nRow + ($x * 4)
        # Only the keyed alpha is kept - every surviving pixel becomes solid
        # white so the launcher can tint it.
        $mSrc = ($sy * $mStride) + ($sx * 4)
        $a = $mBytes[$mSrc + 3]
        $nBytes[$ni]     = 255
        $nBytes[$ni + 1] = 255
        $nBytes[$ni + 2] = 255
        $nBytes[$ni + 3] = $a
    }
}
[System.Runtime.InteropServices.Marshal]::Copy($nBytes, 0, $nd.Scan0, $nBytes.Length)
$notif.UnlockBits($nd)

# Inset to ~76% so the glyph clears the status bar's rounded mask.
$notifPad = [int]($notifBase * 0.12)
$notifInner = $notifBase - (2 * $notifPad)
$notifFinal = New-Object System.Drawing.Bitmap($notifBase, $notifBase, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($notifFinal)
$g.Clear([System.Drawing.Color]::Transparent)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.DrawImage($notif, (New-Object System.Drawing.Rectangle($notifPad, $notifPad, $notifInner, $notifInner)))
$g.Dispose()
$notif.Dispose()
Save-Png $notifFinal (Join-Path $OutDir 'ic_notification.png')

# Per-density variants for Android's status bar. The notification small icon is
# 24dp, so the master (432px) is scaled to each bucket. Emitting real files here
# keeps the Expo config plugin a pure copy step - no Node image dependency.
$notifDensities = [ordered]@{
    'mdpi'    = 24
    'hdpi'    = 36
    'xhdpi'   = 48
    'xxhdpi'  = 72
    'xxxhdpi' = 96
}
foreach ($density in $notifDensities.GetEnumerator()) {
    $px = $density.Value
    $variant = New-Object System.Drawing.Bitmap($px, $px, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($variant)
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($notifFinal, (New-Object System.Drawing.Rectangle(0, 0, $px, $px)))
    $g.Dispose()
    Save-Png $variant (Join-Path $OutDir "ic_notification-$($density.Key).png")
    $variant.Dispose()
}
$notifFinal.Dispose()

$master.Dispose(); $splash.Dispose(); $adaptive.Dispose(); $legacy.Dispose(); $ios.Dispose(); $logoUi.Dispose()

Write-Host ""
Write-Host "Assets written to $OutDir" -ForegroundColor Green
Get-ChildItem $OutDir -Filter *.png | ForEach-Object { "  {0,-22} {1,7:N0} KB" -f $_.Name, ($_.Length / 1KB) }