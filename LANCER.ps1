# SEPTIM : tout lancer en une fois sous Windows (Docker Desktop requis). Double-clic sur LANCER.bat, ou : .\LANCER.bat
# Ce fichier est volontairement en ASCII (Windows PowerShell 5.1 lit mal les accents sans BOM).
Set-Location $PSScriptRoot

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Host ""
  Write-Host "Docker Desktop n'est pas installe. Une seule fois :"
  Write-Host "  winget install -e --id Docker.DockerDesktop"
  Write-Host "Puis redemarre Windows, ouvre Docker Desktop (attends 'Engine running'), et relance LANCER.bat."
  exit 1
}

docker info *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "Docker Desktop est installe mais pas demarre."
  Write-Host "Ouvre Docker Desktop, attends 'Engine running' (icone verte), puis relance LANCER.bat."
  exit 1
}

# Le fichier .env des cles : cree vide (un simple en-tete), jamais copie depuis .env.example dont les valeurs ecraseraient les defauts.
if (-not (Test-Path ".env")) {
  Set-Content -Path ".env" -Value "# Reglages SEPTIM : septim env init (assistant), septim env set CLE=valeur" -Encoding ascii
  Write-Host "Fichier .env cree. Pour tes cles : septim env init (dans un NOUVEAU terminal), ou l'onglet Reglages du Studio."
}

Write-Host ""
Write-Host "Construction et demarrage de SEPTIM (5 a 10 minutes la premiere fois)..."
docker compose up -d --build
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "Echec du demarrage. Copie le texte ci-dessus et envoie-le : c'est ce qui permet de corriger."
  exit 1
}

$url = $null
for ($i = 0; $i -lt 60 -and -not $url; $i++) {
  $line = docker compose logs septim 2>$null | Select-String -Pattern "http://localhost:\d+/\?token=\w+" | Select-Object -Last 1
  if ($line) { $url = $line.Matches[0].Value } else { Start-Sleep -Seconds 2 }
}

Write-Host ""
if ($url) {
  Write-Host "SEPTIM est pret : $url"
  Write-Host "(garde cette adresse : elle contient ton acces ; elle ne change pas)"
  Start-Process $url
} else {
  Write-Host "SEPTIM demarre encore. Regarde : docker compose logs septim"
}
# La commande "septim" disponible dans tous les nouveaux terminaux (une seule fois ; ne touche qu'a ton PATH utilisateur).
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($null -eq $userPath) { $userPath = "" }
if (($userPath -split ";") -notcontains $PSScriptRoot) {
  [Environment]::SetEnvironmentVariable("Path", ($userPath.TrimEnd(";") + ";" + $PSScriptRoot), "User")
  Write-Host "La commande 'septim' est ajoutee a ton PATH : ouvre un NOUVEAU terminal, puis par exemple : septim doctor"
}

Write-Host ""
Write-Host "Arreter : docker compose down      Relancer : LANCER.bat"
