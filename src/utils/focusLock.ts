export interface DeviceLockCapabilities {
  fullscreenSupported: boolean;
  keyboardLockSupported: boolean;
  wakeLockSupported: boolean;
  orientationLockSupported: boolean;
  notificationsSupported: boolean;
}

export interface DeviceLockStatus {
  fullscreenActive: boolean;
  keyboardLocked: boolean;
  wakeLockActive: boolean;
  orientationLocked: boolean;
  notificationPermission: NotificationPermission | 'unsupported';
}

interface KeyboardNavigator extends Navigator {
  keyboard?: {
    lock?: (keyCodes?: string[]) => Promise<void>;
    unlock?: () => void;
  };
}

interface LockableScreenOrientation {
  type?: string;
  lock?: (orientation: 'portrait' | 'landscape') => Promise<void>;
  unlock?: () => void;
}

export const LOCKED_KEYS = [
  'Escape',
  'Tab',
  'AltLeft',
  'AltRight',
  'MetaLeft',
  'MetaRight',
  'ControlLeft',
  'ControlRight',
  'F1',
  'F3',
  'F5',
  'F6',
  'F11',
  'F12',
  'PrintScreen',
  'ContextMenu',
  'BrowserBack',
  'BrowserForward',
  'BrowserRefresh',
];

export function getDeviceLockCapabilities(): DeviceLockCapabilities {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return {
      fullscreenSupported: false,
      keyboardLockSupported: false,
      wakeLockSupported: false,
      orientationLockSupported: false,
      notificationsSupported: false,
    };
  }
  const nav = navigator as KeyboardNavigator;
  const orientation = (screen?.orientation ?? undefined) as LockableScreenOrientation | undefined;
  return {
    fullscreenSupported: Boolean(document.documentElement?.requestFullscreen),
    keyboardLockSupported: Boolean(nav.keyboard?.lock),
    wakeLockSupported: Boolean('wakeLock' in navigator && navigator.wakeLock?.request),
    orientationLockSupported: Boolean(orientation?.lock),
    notificationsSupported: typeof Notification !== 'undefined',
  };
}

export function readCurrentNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

export async function requestStrictDeviceFocusLock(options?: {
  requestNotifications?: boolean;
  existingWakeLock?: WakeLockSentinel | null;
}): Promise<{
  status: DeviceLockStatus;
  wakeLockSentinel: WakeLockSentinel | null;
}> {
  let fullscreenActive = Boolean(document.fullscreenElement);
  let keyboardLocked = false;
  let orientationLocked = false;
  let wakeLockSentinel: WakeLockSentinel | null =
    options?.existingWakeLock && !options.existingWakeLock.released
      ? options.existingWakeLock
      : null;

  // 1. Fullscreen API with navigationUI hidden
  if (!fullscreenActive && document.documentElement?.requestFullscreen) {
    try {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      fullscreenActive = Boolean(document.fullscreenElement);
    } catch {
      try {
        await document.documentElement.requestFullscreen();
        fullscreenActive = Boolean(document.fullscreenElement);
      } catch {
        fullscreenActive = false;
      }
    }
  }

  // 2. Keyboard Lock API (locks Escape, Tab, Alt/Meta/Ctrl/Fn shortcuts in Fullscreen)
  const nav = navigator as KeyboardNavigator;
  if (fullscreenActive && nav.keyboard?.lock) {
    try {
      await nav.keyboard.lock(LOCKED_KEYS);
      keyboardLocked = true;
    } catch {
      try {
        await nav.keyboard.lock();
        keyboardLocked = true;
      } catch {
        keyboardLocked = false;
      }
    }
  }

  // 3. Screen Wake Lock API (keeps display awake and prevents lock-screen interruption)
  if (!wakeLockSentinel && 'wakeLock' in navigator && navigator.wakeLock?.request) {
    try {
      wakeLockSentinel = await navigator.wakeLock.request('screen');
    } catch {
      wakeLockSentinel = null;
    }
  }

  // 4. Screen Orientation Lock API (best-effort when in fullscreen on touch/tablet devices)
  const orientation = (screen?.orientation ?? undefined) as LockableScreenOrientation | undefined;
  if (fullscreenActive && orientation?.lock && orientation.type) {
    try {
      const target = orientation.type.startsWith('portrait') ? 'portrait' : 'landscape';
      await orientation.lock(target);
      orientationLocked = true;
    } catch {
      orientationLocked = false;
    }
  }

  // 5. Notification permission for immediate out-of-window focus-loss alert
  if (
    options?.requestNotifications &&
    typeof Notification !== 'undefined' &&
    Notification.permission === 'default'
  ) {
    try {
      await Notification.requestPermission();
    } catch {
      // ignore if user dismisses
    }
  }

  return {
    status: {
      fullscreenActive,
      keyboardLocked,
      wakeLockActive: Boolean(wakeLockSentinel && !wakeLockSentinel.released),
      orientationLocked,
      notificationPermission: readCurrentNotificationPermission(),
    },
    wakeLockSentinel,
  };
}

export function releaseStrictDeviceFocusLock(
  wakeLockSentinel: WakeLockSentinel | null,
  exitFullscreenIfActive = false
): void {
  const nav = navigator as KeyboardNavigator;
  try {
    nav.keyboard?.unlock?.();
  } catch {
    // ignore
  }
  try {
    const orientation = (screen?.orientation ?? undefined) as LockableScreenOrientation | undefined;
    orientation?.unlock?.();
  } catch {
    // ignore
  }
  if (wakeLockSentinel && !wakeLockSentinel.released) {
    wakeLockSentinel.release().catch(() => {});
  }
  if (exitFullscreenIfActive && typeof document !== 'undefined' && document.fullscreenElement) {
    document.exitFullscreen?.().catch(() => {});
  }
}

export function isBlockedNavigationShortcut(e: KeyboardEvent): boolean {
  const key = e.key.toLowerCase();
  const ctrlOrMeta = e.ctrlKey || e.metaKey;

  if (
    key === 'escape' ||
    key === 'f1' ||
    key === 'f3' ||
    key === 'f5' ||
    key === 'f6' ||
    key === 'f11' ||
    key === 'f12' ||
    key === 'printscreen'
  ) {
    return true;
  }
  if (e.altKey && (key === 'arrowleft' || key === 'arrowright' || key === 'home' || key === 'tab')) {
    return true;
  }
  if (ctrlOrMeta) {
    if (['t', 'n', 'w', 'r', 'l', 'p', 'u', 'tab', 'pageup', 'pagedown'].includes(key)) {
      return true;
    }
    if (e.shiftKey && ['i', 'j', 'c', 'n', 't', 'w'].includes(key)) {
      return true;
    }
  }
  return false;
}

export function notifyFocusViolation(): void {
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      new Notification('Режим фокуса приостановлен', {
        body: 'Вернитесь в полноэкранное окно экзамена IELTS, чтобы разблокировать рабочую область.',
        tag: 'ielts-focus-lock',
      });
    } catch {
      // ignore
    }
  }
}
