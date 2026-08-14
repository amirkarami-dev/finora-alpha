import { QueryClient } from '@tanstack/react-query';

/**
 * The one query cache, in its own module so that signing in and out can empty it.
 *
 * <p>
 * It used to be created inside <c>App.tsx</c>, which put it out of reach of the auth store —
 * so a session change swapped the underlying dataset and left every cached answer in place. That
 * was survivable only because the answers were derived in the browser from the store that had
 * just been replaced, so the next render recomputed them from the new data. It stops being
 * survivable the moment a cached answer is a response from the server: then it is the previous
 * role's numbers, held for a minute of <c>staleTime</c>, shown to whoever signs in next on this
 * browser.
 * </p>
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

/**
 * Throws away every cached answer, because the person asking has changed.
 *
 * <p>
 * `clear`, not `invalidateQueries`: invalidating marks an entry stale but keeps serving it while
 * the refetch is in flight, which is exactly the window where the wrong person sees the previous
 * one's data. Clearing removes it, and the screens show their loading state instead.
 * </p>
 */
export function clearQueryCache(): void {
  queryClient.clear();
}
