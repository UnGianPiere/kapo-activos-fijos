/**
 * Servicio de Sincronización Automática Ultra-Simple
 *
 * Lógica: "24h + internet = sync automático"
 * - Sin timers constantes (eficiente)
 * - Solo eventos de conexión
 * - IndexedDB vacío = sync inmediato
 * - 24h + conexión = sync automático
 */

import { getDB, saveRecursosToIndexedDB, getRecursosFromIndexedDB } from '@/lib/db';
import { executeQuery } from '@/services/graphql-client';
import { LIST_ALL_RECURSOS_QUERY } from '@/graphql/queries/recursos.queries';

export class SimpleAutoSyncService {
  private lastSyncTimestamp: number = 0;
  private readonly SYNC_KEY = 'last_auto_sync';
  private isInitialized: boolean = false;

  constructor() {
    this.initializeService();
  }

  /**
   * Inicialización del servicio
   */
  private async initializeService(): Promise<void> {
    if (this.isInitialized) return;

    await this.loadLastSync();
    this.setupConnectionListener();
    this.isInitialized = true;

    console.log('[SimpleAutoSync] Service initialized');
  }

  /**
   * Configurar listener de conexión
   */
  private setupConnectionListener(): void {
    window.addEventListener('online', () => {
      console.log('[SimpleAutoSync] 🌐 ¡CONEXIÓN DETECTADA! Verificando necesidad de sync...');
      this.checkAndSyncIfNeeded();
    });

    // Verificar inmediatamente al inicializar (por si ya está online)
    console.log('[SimpleAutoSync] 🚀 Inicializando servicio de sync automático...');
    this.checkAndSyncIfNeeded();
  }

  /**
   * Verificar si necesita sincronización (método público)
   */
  async checkAndSyncIfNeeded(): Promise<void> {
    if (!navigator.onLine) {
      console.log('[SimpleAutoSync] 🚫 OFFLINE - skipping sync check');
      return;
    }

    const hoursSinceLastSync = (Date.now() - this.lastSyncTimestamp) / (1000 * 60 * 60);
    const lastSyncText = this.lastSyncTimestamp === 0 ? 'nunca' :
      `${hoursSinceLastSync.toFixed(1)}h atrás (${new Date(this.lastSyncTimestamp).toLocaleTimeString()})`;

    console.log(`[SimpleAutoSync] 🔍 Checking sync need: last sync ${lastSyncText}`);

    // Verificar si IndexedDB está vacío (usuario nuevo)
    const localRecursos = await getRecursosFromIndexedDB();

    if (localRecursos.length === 0) {
      console.log('[SimpleAutoSync] 🆕 IndexedDB VACÍO - Usuario nuevo detectado!');
      console.log('[SimpleAutoSync] 🚀 Iniciando CREACIÓN inicial de datos...');
      await this.syncAllData();
      return;
    }

    // Verificar si pasaron 24 horas
    if (hoursSinceLastSync >= 24) {
      console.log(`[SimpleAutoSync] ⏰ Han pasado ${hoursSinceLastSync.toFixed(1)}h (>= 24h)`);
      console.log('[SimpleAutoSync] 🔄 Iniciando ACTUALIZACIÓN automática...');
      await this.syncAllData();
    } else {
      console.log(`[SimpleAutoSync] ✅ Solo ${hoursSinceLastSync.toFixed(1)}h (< 24h) - no sync needed yet`);
    }
  }

  /**
   * Sincronizar todos los datos
   */
  private async syncAllData(): Promise<void> {
    try {
      console.log('[SimpleAutoSync] Starting data sync...');

      // Verificar IndexedDB para decidir tipo de sync
      const localRecursos = await getRecursosFromIndexedDB();

      if (localRecursos.length === 0) {
        await this.fullSync();
      } else {
        await this.incrementalSync();
      }

      // Actualizar timestamp
      this.lastSyncTimestamp = Date.now();
      await this.saveLastSync();

      console.log(`[SimpleAutoSync] ✅ Sync COMPLETADO exitosamente!`);
      console.log(`[SimpleAutoSync] 📅 Próxima sync automática: ${new Date(this.lastSyncTimestamp + 24 * 60 * 60 * 1000).toLocaleString()}`);

    } catch (error) {
      console.error('[SimpleAutoSync] Sync failed:', error);
      // No lanzar error para no romper la app
    }
  }

  /**
   * Sincronización completa (primer uso)
   */
  private async fullSync(): Promise<void> {
    console.log('[SimpleAutoSync] 🔄 Performing FULL SYNC (IndexedDB was empty)...');

    const response = await executeQuery<{ listAllRecursos: any[] }>(
      LIST_ALL_RECURSOS_QUERY,
      {
        activoFijo: true, // Solo recursos activos fijos
        searchTerm: '' // Sin filtro de búsqueda
      }
    );

    const recursos = response.listAllRecursos || [];
    console.log(`[SimpleAutoSync] 📥 Downloaded ${recursos.length} recursos from backend`);

    // Verificar estado antes de guardar
    const recursosAntes = await getRecursosFromIndexedDB();
    console.log(`[SimpleAutoSync] 📊 IndexedDB antes: ${recursosAntes.length} recursos`);

    await saveRecursosToIndexedDB(recursos);

    // Verificar estado después
    const recursosDespues = await getRecursosFromIndexedDB();
    console.log(`[SimpleAutoSync] ✅ IndexedDB después: ${recursosDespues.length} recursos`);
    console.log(`[SimpleAutoSync] 🎉 CREATED: ${recursos.length} recursos por primera vez!`);
  }

  /**
   * Sincronización incremental (después de 24h)
   */
  private async incrementalSync(): Promise<void> {
    console.log('[SimpleAutoSync] 🔄 Performing INCREMENTAL SYNC (updating existing data)...');

    // Obtener estado antes de la sincronización
    const recursosAntes = await getRecursosFromIndexedDB();
    const idsAntes = new Set(recursosAntes.map(r => r.id_recurso));
    console.log(`[SimpleAutoSync] 📊 IndexedDB antes: ${recursosAntes.length} recursos`);

    // Descargar datos frescos del backend
    const response = await executeQuery<{ listAllRecursos: any[] }>(
      LIST_ALL_RECURSOS_QUERY,
      {
        activoFijo: true, // Solo recursos activos fijos
        searchTerm: '' // Sin filtro de búsqueda
      }
    );

    const recursosNuevos = response.listAllRecursos || [];
    console.log(`[SimpleAutoSync] 📥 Downloaded ${recursosNuevos.length} recursos from backend`);

    // Calcular diferencias
    const idsNuevos = new Set(recursosNuevos.map(r => r.id_recurso));
    const nuevosRecursos = recursosNuevos.filter(r => !idsAntes.has(r.id_recurso));
    const recursosActualizados = recursosNuevos.filter(r => idsAntes.has(r.id_recurso));

    console.log(`[SimpleAutoSync] ➕ ${nuevosRecursos.length} recursos NUEVOS para agregar`);
    console.log(`[SimpleAutoSync] 🔄 ${recursosActualizados.length} recursos existentes para ACTUALIZAR`);

    // Guardar en IndexedDB (reemplaza todo por simplicidad)
    await saveRecursosToIndexedDB(recursosNuevos);

    // Verificar resultado
    const recursosDespues = await getRecursosFromIndexedDB();
    console.log(`[SimpleAutoSync] ✅ IndexedDB después: ${recursosDespues.length} recursos`);
    console.log(`[SimpleAutoSync] 🎉 UPDATED: ${recursosNuevos.length} recursos sincronizados!`);
  }

  /**
   * Cargar último timestamp de sincronización
   */
  private async loadLastSync(): Promise<void> {
    try {
      const db = await getDB();
      const config = await db.get('appConfig', this.SYNC_KEY);
      this.lastSyncTimestamp = config?.value || 0;

      if (this.lastSyncTimestamp === 0) {
        console.log('[SimpleAutoSync] No previous sync timestamp found');
      } else {
        console.log(`[SimpleAutoSync] Last sync: ${new Date(this.lastSyncTimestamp).toLocaleString()}`);
      }
    } catch (error) {
      console.warn('[SimpleAutoSync] Error loading sync timestamp:', error);
      this.lastSyncTimestamp = 0;
    }
  }

  /**
   * Guardar timestamp de sincronización
   */
  private async saveLastSync(): Promise<void> {
    try {
      const db = await getDB();
      await db.put('appConfig', {
        key: this.SYNC_KEY,
        value: this.lastSyncTimestamp,
        updatedAt: Date.now()
      });

      console.log(`[SimpleAutoSync] Sync timestamp saved: ${new Date(this.lastSyncTimestamp).toLocaleString()}`);
    } catch (error) {
      console.error('[SimpleAutoSync] Error saving sync timestamp:', error);
    }
  }

  /**
   * Obtener estado del servicio
   */
  getStatus() {
    const hoursSinceLastSync = (Date.now() - this.lastSyncTimestamp) / (1000 * 60 * 60);
    return {
      lastSync: this.lastSyncTimestamp,
      lastSyncDate: this.lastSyncTimestamp ? new Date(this.lastSyncTimestamp).toLocaleString() : 'Nunca',
      hoursSinceLastSync,
      needsSync: hoursSinceLastSync >= 24,
      isOnline: navigator.onLine,
      isInitialized: this.isInitialized
    };
  }

  /**
   * Forzar sincronización manual
   */
  async forceSync(): Promise<void> {
    console.log('[SimpleAutoSync] Manual sync requested');
    await this.syncAllData();
  }
}

// Singleton simple
let simpleAutoSyncService: SimpleAutoSyncService | null = null;

/**
 * Obtener instancia del servicio
 */
export function getSimpleAutoSyncService(): SimpleAutoSyncService {
  if (!simpleAutoSyncService) {
    simpleAutoSyncService = new SimpleAutoSyncService();
  }
  return simpleAutoSyncService;
}
