import { useCallback, useEffect, useRef, useState } from 'react';
import type { FocusEventRecord } from '../types/ielts';
import {
  isBlockedNavigationShortcut,
  notifyFocusViolation,
  readCurrentNotificationPermission,
  releaseStrictDeviceFocusLock,
  requestStrictDeviceFocusLock,
  type DeviceLockStatus,
} from '../utils/focusLock';

interface UseScreenLockOptions {
  initialEnabled: boolean;
  lockPromptCopy?: boolean;
}

export function useScreenLock({
  initialEnabled,
  lockPromptCopy = true,
}: UseScreenLockOptions) {
  const [isStrictEnabled, setIsStrictEnabled] = useState<boolean>(initialEnabled);
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [lockReason, setLockReason] = useState<FocusEventRecord['type'] | null>(null);
  const [focusEvents, setFocusEvents] = useState<FocusEventRecord[]>([]);
  const [lockStatus, setLockStatus] = useState<DeviceLockStatus>(() => ({
    fullscreenActive: typeof document !== 'undefined' ? Boolean(document.fullscreenElement) : false,
    keyboardLocked: false,
    wakeLockActive: false,
    orientationLocked: false,
    notificationPermission: readCurrentNotificationPermission(),
  }));

  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const engageScreenLock = useCallback(async () => {
    setIsStrictEnabled(true);
    const { status, wakeLockSentinel } = await requestStrictDeviceFocusLock({
      requestNotifications: true,
      existingWakeLock: wakeLockRef.current,
    });
    wakeLockRef.current = wakeLockSentinel;
    setLockStatus(status);

    if (status.fullscreenActive) {
      setIsLocked(false);
      setLockReason(null);
    } else {
      setLockReason('fullscreen_exit');
      setIsLocked(true);
    }
    return status;
  }, []);

  const releaseScreenLock = useCallback((exitFullscreenIfActive = true) => {
    setIsStrictEnabled(false);
    setIsLocked(false);
    setLockReason(null);
    releaseStrictDeviceFocusLock(wakeLockRef.current, exitFullscreenIfActive);
    wakeLockRef.current = null;
    setLockStatus((prev) => ({
      ...prev,
      fullscreenActive: exitFullscreenIfActive
        ? false
        : typeof document !== 'undefined'
        ? Boolean(document.fullscreenElement)
        : false,
      keyboardLocked: false,
      wakeLockActive: false,
      orientationLocked: false,
    }));
  }, []);

  useEffect(() => {
    if (!isStrictEnabled) {
      releaseStrictDeviceFocusLock(wakeLockRef.current, false);
      wakeLockRef.current = null;
      return;
    }

    let cancelled = false;

    const acquireLocksIfFullscreen = async () => {
      if (!document.fullscreenElement) return;
      const { status, wakeLockSentinel } = await requestStrictDeviceFocusLock({
        existingWakeLock: wakeLockRef.current,
      });
      if (cancelled) return;
      wakeLockRef.current = wakeLockSentinel;
      setLockStatus(status);

      if (wakeLockSentinel) {
        wakeLockSentinel.onrelease = () => {
          if (!cancelled) {
            setLockStatus((prev) => ({ ...prev, wakeLockActive: false }));
          }
        };
      }
    };

    void acquireLocksIfFullscreen();

    const triggerViolation = (type: FocusEventRecord['type']) => {
      setLockReason(type);
      setFocusEvents((prev) => [...prev, { type, at: new Date().toISOString() }]);
      setIsLocked((alreadyLocked) => {
        if (!alreadyLocked) {
          notifyFocusViolation();
        }
        return true;
      });
    };

    const onFullscreenChange = () => {
      const fsActive = Boolean(document.fullscreenElement);
      setLockStatus((prev) => ({ ...prev, fullscreenActive: fsActive }));
      if (!fsActive) {
        triggerViolation('fullscreen_exit');
      } else {
        setIsLocked(false);
        setLockReason(null);
        void acquireLocksIfFullscreen();
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        triggerViolation('tab_hidden');
      } else if (document.fullscreenElement) {
        // Screen Wake Lock is released by browser when hidden; re-acquire on return
        void acquireLocksIfFullscreen();
      }
    };

    const onWindowBlur = () => {
      if (!document.hasFocus()) {
        triggerViolation('window_blur');
      }
    };

    const onPageHide = () => {
      triggerViolation('tab_hidden');
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isBlockedNavigationShortcut(e)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    const onCopyOrCut = (e: ClipboardEvent) => {
      if (!lockPromptCopy) return;
      const target = e.target as HTMLElement | null;
      const isEditable =
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLInputElement ||
        Boolean(target?.isContentEditable);
      if (!isEditable) {
        e.preventDefault();
      }
    };

    const onDragStart = (e: DragEvent) => {
      if (lockPromptCopy) {
        e.preventDefault();
      }
    };

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onWindowBlur);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('copy', onCopyOrCut);
    window.addEventListener('cut', onCopyOrCut);
    window.addEventListener('dragstart', onDragStart);
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      cancelled = true;
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', onWindowBlur);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('copy', onCopyOrCut);
      window.removeEventListener('cut', onCopyOrCut);
      window.removeEventListener('dragstart', onDragStart);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [isStrictEnabled, lockPromptCopy]);

  useEffect(() => {
    return () => {
      releaseStrictDeviceFocusLock(wakeLockRef.current, false);
    };
  }, []);

  return {
    isStrictEnabled,
    isLocked,
    lockReason,
    focusEvents,
    lockStatus,
    engageScreenLock,
    releaseScreenLock,
  };
}
