$ErrorActionPreference = 'Stop'
echo "Starting MT5..."
adb shell monkey -p net.metaquotes.metatrader5 -c android.intent.category.LAUNCHER 1
Start-Sleep -Seconds 3

echo "Starting screen recording for MT5 for 10 seconds..."
Start-Process adb -ArgumentList "shell screenrecord --time-limit 10 --size 720x1280 --bit-rate 8000000 /sdcard/mt5_actionsheet3.mp4" -NoNewWindow
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

echo "Pulling video..."
adb pull /sdcard/mt5_actionsheet3.mp4 .\mt5_actionsheet3.mp4
echo "Extracting frames..."
if (Test-Path frames_mt5_3) { Remove-Item -Recurse -Force frames_mt5_3 }
mkdir frames_mt5_3 -Force | Out-Null
ffmpeg -i .\mt5_actionsheet3.mp4 -fps_mode vfr frames_mt5_3/out_%04d.jpg
echo "Done"
