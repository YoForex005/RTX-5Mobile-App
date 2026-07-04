type RegisterScreenReadyListener = () => void;

const registerScreenReadyListeners = new Set<RegisterScreenReadyListener>();

export function subscribeRegisterScreenReady(listener: RegisterScreenReadyListener) {
  registerScreenReadyListeners.add(listener);

  return () => {
    registerScreenReadyListeners.delete(listener);
  };
}

export function notifyRegisterScreenReady() {
  registerScreenReadyListeners.forEach((listener) => {
    listener();
  });
}
