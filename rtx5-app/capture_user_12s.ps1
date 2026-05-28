$ErrorActionPreference = 'Stop'
echo "Starting screen recording for 12 seconds..."
echo "USER: PLEASE RELOAD THE APP AND TAP THE SYMBOL NOW!"
Start-Process adb -ArgumentList "shell screenrecord --time-limit 12 --size 720x1280 --bit-rate 4000000 /sdcard/actionsheet_bug.mp4" -Wait -NoNewWindow
echo "Pulling video..."
adb pull /sdcard/actionsheet_bug.mp4 .\actionsheet_bug.mp4
echo "Extracting frames at high framerate..."
if (Test-Path frames) { Remove-Item -Recurse -Force frames }
mkdir frames -Force | Out-Null
ffmpeg -i .\actionsheet_bug.mp4 -fps_mode vfr frames/out_%04d.jpg
echo "Done"
