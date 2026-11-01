 # Автоматичне копіювання Excel-файлів з Downloads у папку проекту
 # Запуск: powershell -ExecutionPolicy Bypass -File copy-excel.ps1
 
 $downloads = "$env:USERPROFILE\Downloads"
 $project   = "C:\tmp\ekonopikhin23-star.github.io"
 $patterns  = @("my-quiz-questions*.xlsx", "my-quiz-questions*.csv", "my-quiz-questions*.json", "quiz-export*.xlsx")
 
 Write-Host "🔍 Перевіряю $downloads ..." -ForegroundColor Cyan
 
 $copied = 0
 foreach ($pattern in $patterns) {
     $files = Get-ChildItem -Path $downloads -Filter $pattern -File -ErrorAction SilentlyContinue |
              Sort-Object LastWriteTime -Descending |
              Select-Object -First 1
     
     if ($files) {
         $dest = Join-Path $project $files.Name
         Copy-Item $files.FullName -Destination $dest -Force
         Write-Host "✅ Скопійовано: $($files.Name) → $project" -ForegroundColor Green
         $copied++
     }
 }
 
 if ($copied -eq 0) {
     Write-Host "ℹ️ Нових файлів для копіювання не знайдено." -ForegroundColor Yellow
 } else {
     Write-Host "`nГотово! Скопійовано файлів: $copied" -ForegroundColor Cyan
 }
 
 if ($host.Name -eq "ConsoleHost") {
     Read-Host "Натисніть Enter для виходу"
 }
