$ErrorActionPreference = 'Stop'
echo "Starting screen recording for RTX5 for 10 seconds..."
Start-Process adb -ArgumentList "shell screenrecord --time-limit 10 --size 720x1280 --bit-rate 8000000 /sdcard/rtx5_actionsheet4.mp4" -NoNewWindow
Start-Sleep -Seconds 1

echo "Tapping RTX5 symbol multiple times..."
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
adb pull /sdcard/rtx5_actionsheet4.mp4 .\rtx5_actionsheet4.mp4
echo "Extracting frames..."
if (Test-Path frames_rtx5_4) { Remove-Item -Recurse -Force frames_rtx5_4 }
mkdir frames_rtx5_4 -Force | Out-Null
ffmpeg -i .\rtx5_actionsheet4.mp4 -fps_mode vfr frames_rtx5_4/out_%04d.jpg
echo "Done"
