$ErrorActionPreference = 'Stop'
echo "Restarting Expo Go..."
adb shell am force-stop host.exp.exponent
adb shell monkey -p host.exp.exponent -c android.intent.category.LAUNCHER 1
echo "Waiting 12 seconds for app to fully load..."
Start-Sleep -Seconds 12

echo "Starting screen recording for 6 seconds..."
Start-Process adb -ArgumentList "shell screenrecord --time-limit 6 --size 720x1280 --bit-rate 4000000 /sdcard/actionsheet_bug.mp4" -NoNewWindow
Start-Sleep -Seconds 1

echo "Tapping symbol EURUSD..."
adb shell input tap 300 450
Start-Sleep -Seconds 6

echo "Pulling video..."
adb pull /sdcard/actionsheet_bug.mp4 .\actionsheet_bug.mp4
echo "Extracting frames at high framerate..."
if (Test-Path frames) { Remove-Item -Recurse -Force frames }
mkdir frames -Force | Out-Null
ffmpeg -i .\actionsheet_bug.mp4 -vf "select='between(t,0.5,3.5)'" -fps_mode vfr frames/out_%04d.jpg
echo "Done"
