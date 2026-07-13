#!/system/bin/sh
OUT=/sdcard/rtx5_expo_all_options_final_30s.mp4
rm -f "$OUT"
screenrecord --size 360x820 --bit-rate 1200000 --time-limit 30 "$OUT" >/sdcard/rtx5_record.log 2>&1 &
sleep 1
input tap 73 128
sleep 1
input tap 150 476
sleep 1
input tap 73 128
sleep 0.3
input tap 150 560
sleep 1
input tap 73 128
sleep 0.3
input tap 150 644
sleep 1
input tap 73 128
sleep 0.3
input tap 150 729
sleep 1
input tap 73 128
sleep 0.3
input tap 150 812
sleep 1
input tap 73 128
sleep 0.3
input tap 150 897
sleep 1
input tap 73 128
sleep 0.3
input tap 150 981
sleep 1
input tap 73 128
sleep 0.3
input tap 150 1065
sleep 1
input tap 73 128
