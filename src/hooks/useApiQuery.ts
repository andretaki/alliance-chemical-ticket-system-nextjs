'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import { ApiResponseSchema, type ApiError, type ApiResponse } from '@/lib/contracts';

interface UseApiQueryOptions<T> {
  init?: RequestInit;
  schema?: z.ZodType<T>;
  enabled?: boolean;
}

export function useApiQuery<T>(url: string | null, options: UseApiQueryOptions<T> = {}) {
  const { init, schema, enabled = true } = options;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const responseSchema = useMemo(() => ApiResponseSchema(schema ?? z.unknown()), [schema]);

  const fetchData = useCallback(
    async (overrideInit?: RequestInit) => {
      if (!url) return null;
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(url, { ...init, ...overrideInit });
        const json = await response.json();
        const parsed = responseSchema.safeParse(json);
        if (!parsed.success) {
          throw new Error('Invalid API response');
        }

        const envelope = parsed.data as ApiResponse<T>;
        if (!envelope.success) {
          setError(envelope.error);
          return null;
        }

        const payload = schema ? schema.parse(envelope.data) : (envelope.data as T);
        setData(payload);
        return payload;
      } catch (err) {
        setError({
          code: 'client_error',
          message: err instanceof Error ? err.message : 'Request failed',
        });
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [url, init, responseSchema, schema]
  );

  useEffect(() => {
    if (enabled) {
      void fetchData();
    }
  }, [enabled, fetchData]);

  return {
    data,
    error,
    isLoading,
    refetch: fetchData,
    setData,
  };
}
