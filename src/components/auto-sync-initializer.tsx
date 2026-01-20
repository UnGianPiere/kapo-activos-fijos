/**
 * Inicializador del servicio de sincronización automática
 * Se ejecuta una sola vez al cargar la aplicación
 */

'use client';

import { useEffect } from 'react';
import { getSimpleAutoSyncService } from '@/services/simple-auto-sync.service';

export function AutoSyncInitializer() {
  useEffect(() => {
    // Inicializar servicio de sincronización automática
    const syncService = getSimpleAutoSyncService();
    console.log('[AutoSync] Service initialized at app startup');

    // Cleanup (no necesario pero buena práctica)
    return () => {
      console.log('[AutoSync] App unloading');
    };
  }, []);

  // Componente invisible que solo inicializa
  return null;
}
