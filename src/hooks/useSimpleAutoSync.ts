/**
 * Hook para usar el servicio de sincronización automática simple
 */

import { useState, useEffect } from 'react';
import { getSimpleAutoSyncService } from '@/services/simple-auto-sync.service';

export function useSimpleAutoSync() {
  const [status, setStatus] = useState<any>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const service = getSimpleAutoSyncService();

  useEffect(() => {
    const updateStatus = () => setStatus(service.getStatus());
    updateStatus();

    // Actualizar cada 30 segundos (sin ser invasivo)
    const interval = setInterval(updateStatus, 30000);

    return () => clearInterval(interval);
  }, [service]);

  const forceSync = async () => {
    setIsSyncing(true);
    try {
      await service.forceSync();
      setStatus(service.getStatus());
    } finally {
      setIsSyncing(false);
    }
  };

  return {
    status,
    isSyncing,
    forceSync,
    service
  };
}
