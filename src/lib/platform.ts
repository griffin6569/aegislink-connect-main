import { Capacitor } from '@capacitor/core';

export function isNativeApp() {
  return Capacitor.isNativePlatform();
}

export function currentPlatform() {
  return Capacitor.getPlatform();
}
