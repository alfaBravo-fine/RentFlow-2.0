import { generateUUID } from './uuid';

const DEVICE_KEY = 'rentflow_device_id';

let memoryDeviceId: string | null = null;

export function getDeviceId(): string {
  if (typeof localStorage === 'undefined') {
    if (!memoryDeviceId) {
      memoryDeviceId = `dev_${generateUUID()}`;
    }
    return memoryDeviceId;
  }

  let deviceId = localStorage.getItem(DEVICE_KEY);
  if (!deviceId) {
    deviceId = `dev_${generateUUID()}`;
    localStorage.setItem(DEVICE_KEY, deviceId);
  }
  return deviceId;
}

export function getDeviceInfo() {
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown OS';
  let os = 'Desktop / Browser';
  if (userAgent.includes('Mac')) os = 'macOS';
  else if (userAgent.includes('Win')) os = 'Windows';
  else if (userAgent.includes('Linux')) os = 'Linux';

  return {
    deviceId: getDeviceId(),
    deviceName: `${os} Web Node`,
    os,
  };
}
