$ErrorActionPreference = 'Stop'
echo "Starting screen recording for 15 seconds..."
Start-Process adb -ArgumentList "shell screenrecord --time-limit 15 --size 720x1280 --bit-rate 4000000 /sdcard/mt5_actionsheet.mp4" -NoNewWindow
Start-Sleep -Seconds 1

echo "Tapping MT5 symbol multiple times..."
adb shell input tap 300 450
Start-Sleep -Seconds 2
adb shell input tap 300 150
Start-Sleep -Seconds 1
adb shell input tap 300 450
Start-Sleep -Seconds 2
adb shell input tap 300 150
Start-Sleep -Seconds 1
adb shell input tap 300 450
Start-Sleep -Seconds 2
adb shell input tap 300 150
Start-Sleep -Seconds 3

echo "Pulling video..."
adb pull /sdcard/mt5_actionsheet.mp4 .\mt5_actionsheet.mp4
echo "Extracting frames..."
if (Test-Path frames_mt5) { Remove-Item -Recurse -Force frames_mt5 }
mkdir frames_mt5 -Force | Out-Null
ffmpeg -i .\mt5_actionsheet.mp4 -fps_mode vfr frames_mt5/out_%04d.jpg
echo "Done"
