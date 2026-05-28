$ErrorActionPreference = 'Stop'
echo "Starting screen recording for 4 seconds..."
Start-Process adb -ArgumentList "shell screenrecord --time-limit 4 --size 720x1280 --bit-rate 4000000 /sdcard/actionsheet_bug.mp4" -NoNewWindow
Start-Sleep -Seconds 1
echo "Tapping symbol EURUSD on Quotes screen..."
adb shell input tap 300 450
Start-Sleep -Seconds 4
echo "Pulling video..."
adb pull /sdcard/actionsheet_bug.mp4 .\actionsheet_bug.mp4
echo "Extracting frames at high framerate..."
if (Test-Path frames) { Remove-Item -Recurse -Force frames }
mkdir frames -Force | Out-Null
ffmpeg -i .\actionsheet_bug.mp4 -vf "select='between(t,0.5,2.5)'" -fps_mode vfr frames/out_%04d.jpg
echo "Done"
