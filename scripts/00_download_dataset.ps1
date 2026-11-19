# ==============================================================================
# Script 00: Descarga Automática del Dataset NYC 311 (50.000 Registros)
# Fuente oficial: NYC Open Data (Socrata API - erm2-nwe9)
# ==============================================================================

$targetDir = "$PSScriptRoot\..\data"
if (!(Test-Path $targetDir)) {
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
}

$outputFile = "$targetDir\nyc_311_sample.csv"

Write-Host "Iniciando descarga de 50.000 registros desde NYC Open Data..." -ForegroundColor Cyan

$columns = "unique_key,created_date,closed_date,agency,agency_name,complaint_type,descriptor,location_type,incident_zip,incident_address,street_name,community_board,borough,latitude,longitude,status,resolution_description"
$whereClause = "created_date >= '2024-01-01T00:00:00' and created_date <= '2024-01-15T23:59:59'"
$limit = 50000

$url = "https://data.cityofnewyork.us/resource/erm2-nwe9.csv?`$select=$columns&`$where=$whereClause&`$limit=$limit&`$order=created_date ASC"

try {
    Invoke-WebRequest -Uri $url -OutFile $outputFile
    $sizeMb = [math]::Round(((Get-Item $outputFile).Length / 1MB), 2)
    Write-Host "Descarga completada con éxito: $outputFile ($sizeMb MB)" -ForegroundColor Green
} catch {
    Write-Error "Fallo en la descarga: $_"
}
