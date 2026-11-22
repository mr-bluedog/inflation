/** Hooks TanStack Query : un hook par route, clé de cache = [route, ...paramètres]. */
import { useQueries, useQuery } from '@tanstack/react-query';
import { fetchEnvelope, requests, type Request, type ResponseTypes } from './client';
import { GEOS, type Envelope, type Geo, type HeadlineRow, type Item } from './types';

/** Headline des 5 pays (tableau de la vue d'ensemble). data = null tant qu'un pays manque. */
export function useHeadlineAll() {
  return useQueries({
    queries: GEOS.map((geo) => ({
      queryKey: ['headline', geo],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        fetchEnvelope<HeadlineRow[]>(requests.headline(geo), signal),
    })),
    combine: (res) => ({
      isPending: res.some((r) => r.isPending),
      error: res.find((r) => r.error)?.error ?? null,
      data: res.every((r) => r.data)
        ? (Object.fromEntries(GEOS.map((g, i) => [g, res[i]!.data!.data])) as Record<Geo, HeadlineRow[]>)
        : null,
    }),
  });
}

function useEnvelope<T>(key: readonly unknown[], req: Request, enabled = true) {
  return useQuery<Envelope<T>>({
    queryKey: key,
    queryFn: ({ signal }) => fetchEnvelope<T>(req, signal),
    enabled,
  });
}

type R = ResponseTypes;

export const useMeta = () => useEnvelope<R['meta']>(['meta'], requests.meta());
export const useHeadline = (geo: Geo) =>
  useEnvelope<R['headline']>(['headline', geo], requests.headline(geo));
export const useHistory = (geo: Geo, item: Item, from?: string) =>
  useEnvelope<R['history']>(['history', geo, item, from], requests.history(geo, item, from));
export const useComponents = (geo: Geo) =>
  useEnvelope<R['components']>(['components', geo], requests.components(geo));
export const useSensitivities = (geo: Geo, shock?: string, item?: Item) =>
  useEnvelope<R['sensitivities']>(
    ['sensitivities', geo, shock, item],
    requests.sensitivities(geo, shock, item),
  );
export const usePassthrough = (geo: Geo, item: Item, shock?: string) =>
  useEnvelope<R['passthrough']>(['passthrough', geo, item, shock], requests.passthrough(geo, item, shock));
export const useElasticities = () =>
  useEnvelope<R['elasticities']>(['elasticities'], requests.elasticities());
export const useEquationIndex = () =>
  useEnvelope<R['equationIndex']>(['equationIndex'], requests.equationIndex());
export const useEquation = (geo: string, item: string) =>
  useEnvelope<R['equation']>(['equation', geo, item], requests.equation(geo, item), !!geo && !!item);
export const useScenarios = (geo: Geo) =>
  useEnvelope<R['scenarios']>(['scenarios', geo], requests.scenarios(geo));
export const useBacktest = () => useEnvelope<R['backtest']>(['backtest'], requests.backtest());
export const useBacktestErrors = (geo: Geo, h?: number, model?: string) =>
  useEnvelope<R['backtestErrors']>(['backtestErrors', geo, h, model], requests.backtestErrors(geo, h, model));
export const useMarketInputs = () =>
  useEnvelope<R['marketInputs']>(['marketInputs'], requests.marketInputs());
export const useSeriesCatalog = () =>
  useEnvelope<R['seriesCatalog']>(['seriesCatalog'], requests.seriesCatalog());
export const useSeries = (code: string) =>
  useEnvelope<R['series']>(['series', code], requests.series(code), !!code);
export const useMethodology = () => useEnvelope<R['methodology']>(['methodology'], requests.methodology());
