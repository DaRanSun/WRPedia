param(
    [switch]$SkipImages,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName System.Net.Http

$root = Split-Path -Parent $PSScriptRoot
$assetsDir = Join-Path $root 'assets\champions'
$dataDir = Join-Path $root 'data'
New-Item -ItemType Directory -Force -Path $assetsDir, $dataDir | Out-Null

$ua = 'WRpediaBuilder/1.0 (https://github.com/; contact: local)'
$tmp = Join-Path $env:TEMP 'wrpedia'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

function Get-Url($url, $path) {
    if (Test-Path $path) { return }
    curl.exe -L -sS -A $ua $url -o $path
    if (-not (Test-Path $path)) { throw "Failed to download: $url" }
}

function Get-Api($url) {
    $tmpJson = Join-Path $tmp ([guid]::NewGuid().ToString() + '.json')
    curl.exe --compressed -L -sS -A $ua $url -o $tmpJson
    $json = Get-Content $tmpJson -Raw -Encoding UTF8 | ConvertFrom-Json
    Remove-Item $tmpJson -Force
    return $json
}

# ---------------------------------------------------------------
# 1. Official Wild Rift champions page (English + Traditional Chinese)
# ---------------------------------------------------------------
$enHtml = Join-Path $tmp 'champions_en.html'
$zhHtml = Join-Path $tmp 'champions_zh.html'
Get-Url 'https://wildrift.leagueoflegends.com/en-sg/champions/' $enHtml
Get-Url 'https://wildrift.leagueoflegends.com/zh-tw/champions/' $zhHtml

$enRaw = Get-Content $enHtml -Raw -Encoding UTF8
$m = [regex]::Match($enRaw, '<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', [System.Text.RegularExpressions.RegexOptions]::Singleline)
if (-not $m.Success) { throw 'en-sg __NEXT_DATA__ not found' }
$enJson = $m.Groups[1].Value | ConvertFrom-Json
$enItems = @(($enJson.props.pageProps.page.blades | Where-Object { $_.type -eq 'characterCardGrid' }).items)
if ($enItems.Count -lt 141) { throw "Incomplete champion directory: got $($enItems.Count) entries" }

$zhRaw = Get-Content $zhHtml -Raw -Encoding UTF8
$zhPairs = [regex]::Matches($zhRaw, '"title":"((?:[^"\\]|\\.)*)","action":\{"type":"weblink","payload":\{"url":"/zh-tw/champions/([a-z0-9-]+)/"')
$zhMap = @{}
foreach ($p in $zhPairs) {
    $slug = $p.Groups[2].Value
    $title = $p.Groups[1].Value -replace '\\u([0-9a-fA-F]{4})', { param($mm) [char][int]('0x' + $mm.Groups[1].Value) }
    $title = $title -replace '\\"', '"' -replace '\\\\', '\'
    $zhMap[$slug] = $title
}
Write-Output "zh-tw names: $($zhMap.Count)"

# ---------------------------------------------------------------
# 2. Data Dragon champion list (proper-case names + square icons)
# ---------------------------------------------------------------
$versions = Get-Api 'https://ddragon.leagueoflegends.com/api/versions.json'
$ddVersion = $versions[0]
$ddData = Get-Api "https://ddragon.leagueoflegends.com/cdn/$ddVersion/data/en_US/champion.json"
$ddByName = @{}
foreach ($prop in $ddData.data.PSObject.Properties) {
    $champ = $prop.Value
    $key = ($champ.name -replace '[^a-zA-Z0-9]', '').ToLowerInvariant()
    $ddByName[$key] = @{ id = $champ.id; name = $champ.name }
}
Write-Output "ddragon $ddVersion champions: $($ddByName.Count)"

function Get-NormKey($s) {
    return ($s -replace '[^a-zA-Z0-9]', '').ToLowerInvariant()
}

# ---------------------------------------------------------------
# 3. Liquipedia Wild Rift champion icons (Category:Champions)
# ---------------------------------------------------------------
$cat = Get-Api 'https://liquipedia.net/wildrift/api.php?action=query&list=categorymembers&cmtitle=Category:Champions&cmlimit=500&format=json'
$lpTitles = @($cat.query.categorymembers | Where-Object { $_.title -notlike 'Category:*' } | ForEach-Object { $_.title })
Write-Output "liquipedia champion pages: $($lpTitles.Count)"

$lpIcons = @{}
for ($i = 0; $i -lt $lpTitles.Count; $i += 50) {
    $chunk = $lpTitles[$i..([Math]::Min($i + 49, $lpTitles.Count - 1))]
    $titles = @($chunk | ForEach-Object { [uri]::EscapeDataString("File:WR_Champion_icon_$_.png") })
    $q = Get-Api ('https://liquipedia.net/wildrift/api.php?action=query&format=json&prop=imageinfo&iiprop=url&titles=' + ($titles -join '|'))
    foreach ($p in $q.query.pages.PSObject.Properties) {
        $page = $p.Value
        if ($page.imageinfo -and $page.imageinfo.Count -gt 0) {
            $normTitle = $page.title -replace '^File:WR[\s_]+Champion[\s_]+icon[\s_]+', '' -replace '\.png$', ''
            $lpIcons[(Get-NormKey $normTitle)] = $page.imageinfo[0].url
        }
    }
}
Write-Output "liquipedia icons: $($lpIcons.Count)"

# ---------------------------------------------------------------
# 4. Build champion records
# ---------------------------------------------------------------
function Get-Name($slug, $official) {
    $dd = $ddByName[(Get-NormKey $official)]
    if ($dd) { return $dd.name }
    $words = $official.ToLowerInvariant() -split '\s+'
    $out = @()
    foreach ($w in $words) {
        $w = $w -replace "'([a-z])", { param($mm) "'" + $mm.Groups[1].Value.ToUpperInvariant() }
        if ($w -eq 'iv') { $out += 'IV' } elseif ($w -eq '&') { $out += '&' } else {
            if ($w.Length -gt 0) { $out += $w.Substring(0,1).ToUpperInvariant() + $w.Substring(1) } else { $out += '' }
        }
    }
    return ($out -join ' ')
}

$champions = @()
foreach ($item in $enItems) {
    $slug = [regex]::Match($item.action.payload.url, '/champions/([a-z0-9-]+)/').Groups[1].Value
    $official = $item.title
    $name = Get-Name $slug $official
    $nameZh = $zhMap[$slug]
    if (-not $nameZh) { $nameZh = '' }

    $icon = ''
    $iconSource = ''
    $lpUrl = $lpIcons[(Get-NormKey $name)]
    $dd = $ddByName[(Get-NormKey $name)]
    if ($lpUrl) {
        $icon = "assets/champions/$slug.png"
        $iconSource = 'liquipedia'
    } elseif ($dd) {
        $icon = "assets/champions/$slug.png"
        $iconSource = 'ddragon'
    } else {
        $icon = "assets/champions/$slug-portrait.jpg"
        $iconSource = 'portrait'
    }

    $champions += [pscustomobject]@{
        slug       = $slug
        name       = $name
        nameZh     = $nameZh
        official   = $official
        icon       = $icon
        portrait   = "assets/champions/$slug-portrait.jpg"
        iconSource = $iconSource
        portraitUrl = $item.media.url
    }
}

# A newly confirmed hero may precede its appearance in the regional directory.
# Preserve existing asset records (e.g. Hwei); tournament eligibility lives separately.
$existingData = Join-Path $dataDir 'champions.json'
if (Test-Path $existingData) {
    $knownSlugs = @($champions | ForEach-Object { $_.slug })
    foreach ($existing in @(Get-Content $existingData -Raw -Encoding UTF8 | ConvertFrom-Json)) {
        if ($existing.slug -notin $knownSlugs) { $champions += $existing }
    }
}
$champions = @($champions | Sort-Object name)
$jsonOut = $champions | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText((Join-Path $dataDir 'champions.json'), $jsonOut, (New-Object System.Text.UTF8Encoding($false)))

$jsOut = "// Auto-generated by tools/fetch_assets.ps1 - do not edit by hand.`r`nwindow.WR_CHAMPIONS = " + $jsonOut + ";"
[System.IO.File]::WriteAllText((Join-Path $dataDir 'champions.js'), $jsOut, (New-Object System.Text.UTF8Encoding($false)))
Write-Output "champions.json written: $($champions.Count)"

# ---------------------------------------------------------------
# 5. Download images
# ---------------------------------------------------------------
if (-not $SkipImages) {
    if ($Force) {
        Get-ChildItem $assetsDir -File | Remove-Item -Force
    }
    $client = New-Object System.Net.Http.HttpClient
    $client.DefaultRequestHeaders.UserAgent.ParseAdd('WRpediaBuilder/1.0')
    $client.Timeout = [TimeSpan]::FromSeconds(60)
    $ok = 0
    $fail = @()

    foreach ($c in $champions) {
        # Square icon
        $iconPath = Join-Path $assetsDir ([IO.Path]::GetFileName($c.icon))
        $iconUrl = $lpIcons[(Get-NormKey $c.name)]
        if (-not $iconUrl) {
            $dd = $ddByName[(Get-NormKey $c.name)]
            if ($dd) { $iconUrl = "https://ddragon.leagueoflegends.com/cdn/$ddVersion/img/champion/$($dd.id).png" }
            else { $iconUrl = $c.portraitUrl }
        }
        if (-not (Test-Path $iconPath)) {
            try {
                $bytes = $client.GetByteArrayAsync($iconUrl).GetAwaiter().GetResult()
                [System.IO.File]::WriteAllBytes($iconPath, $bytes)
                $ok++
            } catch { $fail += "$($c.slug) icon: $($_.Exception.Message)" }
        } else { $ok++ }

        # Portrait
        $portraitPath = Join-Path $assetsDir ([IO.Path]::GetFileName($c.portrait))
        if (-not (Test-Path $portraitPath)) {
            try {
                $bytes = $client.GetByteArrayAsync($c.portraitUrl).GetAwaiter().GetResult()
                [System.IO.File]::WriteAllBytes($portraitPath, $bytes)
                $ok++
            } catch { $fail += "$($c.slug) portrait: $($_.Exception.Message)" }
        } else { $ok++ }
    }

    $client.Dispose()
    Write-Output "images downloaded/verified: $ok"
    if ($fail.Count -gt 0) { Write-Output ("failures: " + ($fail -join '; ')) }
}
