$proxy = "http://127.0.0.1:7897"

git config --local http.proxy $proxy
git config --local https.proxy $proxy

Write-Host "Git proxy enabled for this repository: $proxy"
