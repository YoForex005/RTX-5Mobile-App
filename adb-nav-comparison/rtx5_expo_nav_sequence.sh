#!/system/bin/sh

VIDEO=/sdcard/rtx5_expo_all_options_30s.mp4
LOG=/sdcard/rtx5_expo_nav_taps.log

rm -f "$VIDEO" "$LOG"
screenrecord --size 720x1640 --bit-rate 4000000 --time-limit 30 "$VIDEO" &
REC_PID=$!

mark() {
  echo "$1 $(date +%s)" >> "$LOG"
}

return_to_quotes_and_open_drawer() {
  input tap 72 1515
  sleep 0.6
  input tap 73 128
  sleep 0.4
}

pop_to_quotes_and_open_drawer() {
  input keyevent 4
  sleep 0.6
  input tap 73 128
  sleep 0.4
}

sleep 0.7

mark trade
input tap 150 436
sleep 1.2
return_to_quotes_and_open_drawer

mark journal
input tap 150 520
sleep 1.2
pop_to_quotes_and_open_drawer

mark settings
input tap 150 604
sleep 1.2
return_to_quotes_and_open_drawer

mark economic_calendar
input tap 150 688
sleep 1.2
pop_to_quotes_and_open_drawer

mark user_guide
input tap 150 771
sleep 1.2
pop_to_quotes_and_open_drawer

mark support_email
input tap 150 856
sleep 1.5
mark support_email_back
input keyevent 4
sleep 0.8
input tap 73 128
sleep 0.4

mark help
input tap 150 939
sleep 1.2
pop_to_quotes_and_open_drawer

mark about
input tap 150 1023
sleep 1.2
input keyevent 4

wait "$REC_PID"
mark recording_complete
