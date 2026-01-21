'use client';

import React, { useState, useEffect } from 'react';
import { RefreshCw, FileText, Eye, Package, User, Calendar, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getDB, getReporteOfflineById, updateReporteOfflineSyncStatus } from '@/lib/db';
import { executeMutationWithFiles } from '@/services/graphql-client';
import { CREATE_REPORTE_ACTIVO_FIJO_MUTATION } from '@/graphql/mutations';
import { toast } from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { useOnline } from '@/hooks';
import ReporteOfflineView from './components/reporte-view';

// Función para formatear fecha
const formatDate = (timestamp: number) => {
  try {
    const date = new Date(timestamp);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const hour = date.getHours().toString().padStart(2, '0');
    const minute = date.getMinutes().toString().padStart(2, '0');

    return `${day}/${month}/${year} ${hour}:${minute}`;
  } catch {
    return 'Fecha inválida';
  }
};

// Función para obtener el nombre del activo(s)
const getNombreActivos = (recursos: any[]) => {
  if (!recursos || recursos.length === 0) return 'Sin activos';

  if (recursos.length === 1) {
    return recursos[0].nombre_recurso;
  }

  if (recursos.length <= 3) {
    return recursos.map(r => r.nombre_recurso).join(', ');
  }

  return `${recursos[0].nombre_recurso} y ${recursos.length - 1} más`;
};

// Función para cargar reportes offline desde IndexedDB
const loadOfflineReports = async (): Promise<any[]> => {
  try {
    const db = await getDB();
    const reportes = await db.getAll('reportesOffline');
    return reportes || [];
  } catch (error) {
    console.error('Error al cargar reportes offline:', error);
    return [];
  }
};

export default function GestionReportesOfflinePage() {
  const queryClient = useQueryClient();
  const { status: onlineStatus } = useOnline();
  const isOnline = onlineStatus === 'online';
  const [reportesOffline, setReportesOffline] = useState<any[]>([]);
  const [loadingReportes, setLoadingReportes] = useState(false);
  const [selectedReporte, setSelectedReporte] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [syncingReportes, setSyncingReportes] = useState<Set<string>>(new Set());


  // Cargar reportes offline
  const cargarReportesOffline = async () => {
    setLoadingReportes(true);
    try {
      const reportes = await loadOfflineReports();
      // Ordenar por fecha de creación (más recientes primero)
      const reportesOrdenados = reportes.sort((a, b) => b.fecha_creacion - a.fecha_creacion);
      setReportesOffline(reportesOrdenados);
    } catch (error) {
      console.error('Error al cargar reportes offline:', error);
    } finally {
      setLoadingReportes(false);
    }
  };

  // Función para ver detalles del reporte
  const verDetalleReporte = async (reporteId: string) => {
    try {
      const reporte = await getReporteOfflineById(reporteId);
      if (reporte) {
        setSelectedReporte(reporte);
        setIsModalOpen(true);
      }
    } catch (error) {
      console.error('Error al cargar detalles del reporte:', error);
    }
  };

  // Función para sincronizar un reporte individual
  const sincronizarReporte = async (reporteId: string) => {
    // Validar conexión antes de sincronizar
    if (!isOnline) {
      toast.error('Se requiere conexión a internet para sincronizar', {
        icon: <WifiOff className="w-5 h-5" />,
        duration: 3000,
      });
      return;
    }

    if (syncingReportes.has(reporteId)) return;

    setSyncingReportes(prev => new Set(prev).add(reporteId));

    try {
      const reporte = await getReporteOfflineById(reporteId);
      if (!reporte) {
        toast.error('Reporte no encontrado');
        return;
      }

      // Convertir datos offline al formato online
      const fechaCreacion = new Date(reporte.fecha_creacion);
      const datosOnline = {
        titulo: reporte.titulo,
        usuario_id: reporte.usuario_id,
        usuario_nombre: reporte.usuario_nombres,
        recursos: reporte.recursos.map((r: any) => ({
          id_recurso: r.id_recurso,
          codigo_recurso: r.codigo_recurso,
          nombre_recurso: r.nombre_recurso,
          marca: r.marca,
          estado: r.estado,
          descripcion: r.descripcion,
          evidencia_urls: r.evidencia_urls || [],
          evidence_files: r.evidence_files || [] // Incluir fotos guardadas offline
        })),
        notas_generales: reporte.notas_generales,
        esSincronizacionOffline: true, // Indica que viene de sincronización
        fecha_creacion: fechaCreacion.toISOString() // Mantener fecha original del offline
      };

      // Crear reporte en backend usando executeMutationWithFiles directamente
      const response = await executeMutationWithFiles<{ addReporteActivoFijo: any }>(
        CREATE_REPORTE_ACTIVO_FIJO_MUTATION,
        datosOnline
      );

      if (!response || !response.addReporteActivoFijo) {
        throw new Error(`Error en sincronización: respuesta inválida del servidor. Response: ${JSON.stringify(response)}`);
      }

      const reporteCreado = response.addReporteActivoFijo;

      // Actualizar estado en IndexedDB con fecha de sincronización
      const fechaSincronizacion = Date.now();
      await updateReporteOfflineSyncStatus(reporteId, 'synced');

      // Actualizar registro en IndexedDB con fecha_sincronizacion
      const db = await getDB();
      const reporteExistente = await db.get('reportesOffline', reporteId);
      if (reporteExistente) {
        await db.put('reportesOffline', {
          ...reporteExistente,
          sync_status: 'synced',
          fecha_sincronizacion: fechaSincronizacion
        });
      }

      // Actualizar lista local
      setReportesOffline(prev => prev.map(r =>
        r.id === reporteId ? {
          ...r,
          sync_status: 'synced',
          fecha_sincronizacion: fechaSincronizacion
        } : r
      ));

      toast.success('Reporte sincronizado exitosamente');

      // Invalidar queries relacionadas (igual que cuando se crea un reporte online)
      queryClient.invalidateQueries({ queryKey: ['reportes-activos-fijos'] });
      queryClient.invalidateQueries({ queryKey: ['reportes-paginados'] });
      queryClient.invalidateQueries({ queryKey: ['reportes-by-usuario'] });
      queryClient.invalidateQueries({ queryKey: ['estadisticas-reportes'] });
      // Invalidar TODAS las queries relacionadas con activos fijos
      queryClient.invalidateQueries({ queryKey: ['activos-fijos'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['recursos-activos-fijos'], exact: false });

    } catch (error: any) {
      console.error('Error sincronizando reporte:', error);

      // Marcar como error en IndexedDB
      await updateReporteOfflineSyncStatus(reporteId, 'error', error.message);

      // Actualizar lista local
      setReportesOffline(prev => prev.map(r =>
        r.id === reporteId ? { ...r, sync_status: 'error' } : r
      ));

      toast.error(`Error al sincronizar: ${error.message}`);
    } finally {
      setSyncingReportes(prev => {
        const newSet = new Set(prev);
        newSet.delete(reporteId);
        return newSet;
      });
    }
  };

  // Función para cerrar el modal
  const cerrarModal = () => {
    setIsModalOpen(false);
    setSelectedReporte(null);
  };

  // Cargar reportes al montar el componente
  useEffect(() => {
    cargarReportesOffline();
  }, []);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">
            Gestión de Reportes
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Reportes de activos fijos guardados offline pendientes de sincronización
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={cargarReportesOffline}
            disabled={loadingReportes}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-xs text-blue-600 dark:text-blue-400 shadow-sm hover:shadow transition-all duration-200 disabled:opacity-50"
          >
            <RefreshCw className={cn("h-4 w-4", loadingReportes && "animate-spin")} />
            Refrescar
          </button>
          <span className="text-xs text-[var(--text-secondary)]">
            {reportesOffline.length} reporte{reportesOffline.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Contenido principal */}
      <div className="bg-[var(--background)] backdrop-blur-sm rounded-lg card-shadow overflow-hidden">
        {loadingReportes ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-3">
              <RefreshCw className="h-6 w-6 animate-spin text-[var(--text-secondary)]" />
              <p className="text-sm text-[var(--text-secondary)]">Cargando reportes...</p>
            </div>
          </div>
        ) : reportesOffline.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[var(--surface)] border-b border-[var(--border)]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-secondary)] uppercase">
                    Fecha
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-secondary)] uppercase">
                    Recursos
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-secondary)] uppercase">
                    Usuario
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-secondary)] uppercase">
                    Cantidad
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-secondary)] uppercase">
                    Estado
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-secondary)] uppercase">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {reportesOffline.map((reporte) => (
                  <tr key={reporte.id} className="hover:bg-[var(--hover)]">
                    <td className="px-4 py-3 text-xs">
                      <div className="flex flex-col gap-0.5">
                        {reporte.sync_status === 'synced' && reporte.fecha_sincronizacion ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[11px] text-[var(--text-secondary)]">
                              Sync: {formatDate(reporte.fecha_sincronizacion)}
                            </span>
                            <span className="text-[11px] text-[var(--text-secondary)]">
                              Creado: {formatDate(reporte.fecha_creacion)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[var(--text-primary)] font-medium">
                            {formatDate(reporte.fecha_creacion)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--text-primary)] max-w-48">
                      <div className="line-clamp-2">
                        {getNombreActivos(reporte.recursos)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--text-primary)]">
                      <div className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {reporte.usuario_nombres || 'Usuario'}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--text-primary)]">
                      <div className="flex items-center gap-1">
                        <Package className="h-3 w-3" />
                        {reporte.total_recursos || reporte.recursos?.length || 0}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span className={cn(
                        'px-2 py-0.5 rounded-full text-[10px] font-medium',
                        reporte.sync_status === 'pending'
                          ? 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'
                          : reporte.sync_status === 'error'
                          ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                          : 'bg-green-500/10 text-green-600 dark:text-green-400'
                      )}>
                        {reporte.sync_status === 'pending' ? 'Pendiente' :
                         reporte.sync_status === 'error' ? 'Error' : 'Sincronizado'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="flex gap-1">
                        <button
                          onClick={() => verDetalleReporte(reporte.id)}
                          className="p-1 rounded hover:bg-[var(--hover)] text-blue-600 dark:text-blue-400 transition-colors"
                          title="Ver detalles"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => sincronizarReporte(reporte.id)}
                          disabled={syncingReportes.has(reporte.id) || reporte.sync_status === 'synced'}
                          className="p-1 rounded hover:bg-[var(--hover)] text-green-600 dark:text-green-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title={
                            reporte.sync_status === 'synced' 
                              ? 'Ya sincronizado' 
                              : 'Sincronizar'
                          }
                        >
                          <RefreshCw className={cn(
                            "h-4 w-4",
                            syncingReportes.has(reporte.id) && "animate-spin"
                          )} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <FileText className="mx-auto h-12 w-12 text-[var(--text-secondary)]" />
              <h3 className="mt-2 text-sm font-medium text-[var(--text-primary)]">
                No hay reportes offline
              </h3>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                Crea un reporte en la sección "Reportes" para verlo aquí
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Modal de detalles del reporte */}
      <ReporteOfflineView
        isOpen={isModalOpen}
        onClose={cerrarModal}
        reporte={selectedReporte}
      />
    </div>
  );
}
