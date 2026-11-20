import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { AIApiConnectionState, AIHealthStatus } from '../types/ielts';

export interface ActiveAIProcessingTask {
  label: string;
  percent?: number;
  stage?: string;
  startedAt: number;
}

interface AIStatusContextValue {
  health: AIHealthStatus | null;
  isChecking: boolean;
  activeTask: ActiveAIProcessingTask | null;
  effectiveStatus: AIApiConnectionState;
  refreshHealth: (force?: boolean) => Promise<void>;
  beginProcessing: (label: string, percent?: number) => void;
  updateProcessing: (percent?: number, stage?: string) => void;
  endProcessing: () => void;
}

const AIStatusContext = createContext<AIStatusContextValue | null>(null);

export const AIStatusProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [health, setHealth] = useState<AIHealthStatus | null>(null);
  const [isChecking, setIsChecking] = useState<boolean>(true);
  const [activeTask, setActiveTask] = useState<ActiveAIProcessingTask | null>(null);
  const mountedRef = useRef(true);

  const refreshHealth = useCallback(async (force = false) => {
    setIsChecking(true);
    try {
      const res = await fetch(`/api/ai/health${force ? '?force=1' : ''}`);
      if (!res.ok) {
        throw new Error('HTTP ' + res.status);
      }
      const data = (await res.json()) as AIHealthStatus;
      if (mountedRef.current) {
        setHealth(data);
      }
    } catch {
      if (mountedRef.current) {
        setHealth((prev) => ({
          status: 'offline',
          configured: prev?.configured ?? false,
          model: prev?.model ?? 'gemini-4-hydrogen',
          activeRequests: 0,
          latencyMs: null,
          checkedAt: new Date().toISOString(),
          lastSuccessAt: prev?.lastSuccessAt ?? null,
          message: 'Нет связи с сервером проверки ИИ.',
        }));
      }
    } finally {
      if (mountedRef.current) {
        setIsChecking(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refreshHealth(true);
    const intervalId = window.setInterval(() => {
      void refreshHealth(false);
    }, 30_000);
    return () => {
      mountedRef.current = false;
      window.clearInterval(intervalId);
    };
  }, [refreshHealth]);

  const beginProcessing = useCallback((label: string, percent?: number) => {
    setActiveTask({
      label,
      percent,
      startedAt: Date.now(),
    });
  }, []);

  const updateProcessing = useCallback((percent?: number, stage?: string) => {
    setActiveTask((prev) =>
      prev
        ? {
            ...prev,
            percent: percent ?? prev.percent,
            stage: stage ?? prev.stage,
          }
        : null
    );
  }, []);

  const endProcessing = useCallback(() => {
    setActiveTask(null);
    void refreshHealth(false);
  }, [refreshHealth]);

  const effectiveStatus: AIApiConnectionState = useMemo(() => {
    if (activeTask || health?.status === 'processing') return 'processing';
    if (!health) return isChecking ? 'checking' : 'offline';
    return health.status;
  }, [activeTask, health, isChecking]);

  const value = useMemo<AIStatusContextValue>(
    () => ({
      health,
      isChecking,
      activeTask,
      effectiveStatus,
      refreshHealth,
      beginProcessing,
      updateProcessing,
      endProcessing,
    }),
    [
      health,
      isChecking,
      activeTask,
      effectiveStatus,
      refreshHealth,
      beginProcessing,
      updateProcessing,
      endProcessing,
    ]
  );

  return <AIStatusContext.Provider value={value}>{children}</AIStatusContext.Provider>;
};

export function useAIStatus(): AIStatusContextValue {
  const ctx = useContext(AIStatusContext);
  if (!ctx) {
    throw new Error('useAIStatus must be used within AIStatusProvider');
  }
  return ctx;
}
