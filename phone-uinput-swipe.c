// Minimal /dev/uinput swipe injector for the MIUI test phone (INJECT_EVENTS
// blocked for adb shell `input`). Creates a temporary virtual touch device,
// emits down -> stepped moves -> up, then destroys the device.
// Usage: phone-uinput-swipe <x1> <y1> <x2> <y2> [duration_ms]
#include <fcntl.h>
#include <linux/uinput.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

static void emit(int fd, int type, int code, int value) {
  struct input_event ev;
  memset(&ev, 0, sizeof(ev));
  ev.type = type;
  ev.code = code;
  ev.value = value;
  write(fd, &ev, sizeof(ev));
}

int main(int argc, char **argv) {
  int x1 = 540, y1 = 1600, x2 = 540, y2 = 800, dur = 300;
  if (argc >= 5) {
    x1 = atoi(argv[1]);
    y1 = atoi(argv[2]);
    x2 = atoi(argv[3]);
    y2 = atoi(argv[4]);
  }
  if (argc >= 6) dur = atoi(argv[5]);

  int fd = open("/dev/uinput", O_WRONLY | O_NONBLOCK);
  if (fd < 0) {
    perror("open /dev/uinput");
    return 1;
  }

  ioctl(fd, UI_SET_EVBIT, EV_KEY);
  ioctl(fd, UI_SET_KEYBIT, BTN_TOUCH);
  ioctl(fd, UI_SET_EVBIT, EV_ABS);
  ioctl(fd, UI_SET_ABSBIT, ABS_X);
  ioctl(fd, UI_SET_ABSBIT, ABS_Y);
  ioctl(fd, UI_SET_ABSBIT, ABS_MT_POSITION_X);
  ioctl(fd, UI_SET_ABSBIT, ABS_MT_POSITION_Y);
  ioctl(fd, UI_SET_ABSBIT, ABS_MT_TRACKING_ID);
  ioctl(fd, UI_SET_ABSBIT, ABS_MT_SLOT);
  ioctl(fd, UI_SET_EVBIT, EV_SYN);
  ioctl(fd, UI_SET_PROPBIT, INPUT_PROP_DIRECT);

  struct uinput_user_dev ud;
  memset(&ud, 0, sizeof(ud));
  snprintf(ud.name, sizeof(ud.name), "claude-virt-swipe");
  ud.id.bustype = BUS_VIRTUAL;
  ud.absmin[ABS_X] = 0; ud.absmax[ABS_X] = 1079;
  ud.absmin[ABS_Y] = 0; ud.absmax[ABS_Y] = 2339;
  ud.absmin[ABS_MT_POSITION_X] = 0; ud.absmax[ABS_MT_POSITION_X] = 1079;
  ud.absmin[ABS_MT_POSITION_Y] = 0; ud.absmax[ABS_MT_POSITION_Y] = 2339;
  ud.absmin[ABS_MT_TRACKING_ID] = 0; ud.absmax[ABS_MT_TRACKING_ID] = 65535;
  ud.absmin[ABS_MT_SLOT] = 0; ud.absmax[ABS_MT_SLOT] = 9;
  write(fd, &ud, sizeof(ud));
  if (ioctl(fd, UI_DEV_CREATE) < 0) {
    perror("UI_DEV_CREATE");
    return 1;
  }

  // Give the input pipeline time to enumerate the new device.
  usleep(400000);

  int steps = dur / 10;
  if (steps < 8) steps = 8;

  emit(fd, EV_ABS, ABS_MT_SLOT, 0);
  emit(fd, EV_ABS, ABS_MT_TRACKING_ID, 1);
  emit(fd, EV_KEY, BTN_TOUCH, 1);
  emit(fd, EV_ABS, ABS_MT_POSITION_X, x1);
  emit(fd, EV_ABS, ABS_MT_POSITION_Y, y1);
  emit(fd, EV_ABS, ABS_X, x1);
  emit(fd, EV_ABS, ABS_Y, y1);
  emit(fd, EV_SYN, SYN_REPORT, 0);

  for (int i = 1; i <= steps; i++) {
    int x = x1 + (x2 - x1) * i / steps;
    int y = y1 + (y2 - y1) * i / steps;
    emit(fd, EV_ABS, ABS_MT_POSITION_X, x);
    emit(fd, EV_ABS, ABS_MT_POSITION_Y, y);
    emit(fd, EV_ABS, ABS_X, x);
    emit(fd, EV_ABS, ABS_Y, y);
    emit(fd, EV_SYN, SYN_REPORT, 0);
    usleep(1000L * dur / steps);
  }

  emit(fd, EV_ABS, ABS_MT_TRACKING_ID, -1);
  emit(fd, EV_KEY, BTN_TOUCH, 0);
  emit(fd, EV_SYN, SYN_REPORT, 0);

  usleep(150000);
  ioctl(fd, UI_DEV_DESTROY);
  close(fd);
  printf("temporary virtual swipe emitted %d,%d -> %d,%d in %dms\n", x1, y1, x2, y2, dur);
  return 0;
}
