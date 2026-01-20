import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { executeQuery, executeMutation } from '@/services/graphql-client';
import { LIST_RECURSOS_ACTIVOS_FIJOS_QUERY } from '@/graphql/queries/recursos.queries';
import { getSimpleAutoSyncService } from '@/services/simple-auto-sync.service';
import { getRecursosFromIndexedDB } from '@/lib/db';
import toast from 'react-hot-toast';

export interface RecursosActivosFijosFilters {
  page?: number;
  itemsPage?: number;
  searchTerm?: string;
  estado_activo_fijo?: string;
}

export interface RecursoActivoFijo {
  id: string;
  recurso_id: string;
  codigo?: string;
  nombre: string;
  descripcion?: string;
  activo_fijo: boolean;
  unidad?: {
    nombre?: string;
  };
  tipo_recurso?: {
    nombre?: string;
  };
}

export interface RecursosPaginationInfo {
  page: number;
  pages: number;
  itemsPage: number;
  total: number;
}

export interface RecursosPaginationResult {
  info: RecursosPaginationInfo;
  status: boolean;
  message: string;
  recursos: RecursoActivoFijo[];
}

/**
 * Hook para listar recursos activos fijos con paginación y búsqueda
 */
export function useRecursosActivosFijos(input?: RecursosActivosFijosFilters) {
  return useQuery<RecursosPaginationResult>({
    queryKey: ['recursos-activos-fijos', input],
    queryFn: async () => {
      // Verificar sincronización automática
      const syncService = getSimpleAutoSyncService();
      await syncService.checkAndSyncIfNeeded();

      const variables = {
        input: {
          page: input?.page || 1,
          itemsPage: input?.itemsPage || 50, // Más elementos para select search
          searchTerm: input?.searchTerm || '',
          estado_activo_fijo: input?.estado_activo_fijo || ''
        }
      };

      const response = await executeQuery<{
        listRecursosActivosFijos: RecursosPaginationResult;
      }>(LIST_RECURSOS_ACTIVOS_FIJOS_QUERY, variables);

      return response.listRecursosActivosFijos;
    },
    staleTime: 60000, // 1 minuto - estos datos cambian menos frecuentemente
    refetchOnWindowFocus: false,
    retry: 2,
  });
}

/**
 * Hook para obtener opciones iniciales para SelectSearch (patrón híbrido)
 * Carga primeros recursos activos fijos para mostrar inicialmente
 */
export function useRecursosActivosFijosOptions() {
  const { data, isLoading, error } = useRecursosActivosFijos({
    page: 1,
    itemsPage: 100, // Primeros 100 recursos para SelectSearch inicial
    searchTerm: undefined, // Sin búsqueda inicial
  });

  const options = data?.recursos?.map((recurso) => ({
    value: recurso.id,
    label: `${recurso.codigo || recurso.recurso_id} - ${recurso.nombre}`,
    data: recurso, // Información completa del recurso
  })) || [];

  return {
    options,
    isLoading,
    error,
    hasMore: data ? data.info.page < data.info.pages : false,
    total: data?.info?.total || 0,
  };
}

/**
 * Función para buscar recursos activos fijos (para usar con SelectSearch onSearch)
 */
export async function searchRecursosActivosFijos(searchTerm: string): Promise<any[]> {
  // Esta función se puede usar con el onSearch del SelectSearch
  // Por ahora, como tenemos el hook, devolveremos un array vacío
  // El SelectSearch hará el filtrado local con las opciones del hook
  return [];
}

