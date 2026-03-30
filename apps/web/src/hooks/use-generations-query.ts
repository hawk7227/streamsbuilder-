import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listGenerations, type GenerationRecord } from "@/lib/generations";

interface UseGenerationsQueryOptions {
    type?: "video" | "image" | "script" | "voice";
    limit?: number;
}

/**
 * Cached wrapper around listGenerations using React Query.
 * Cache key: ['generations', type] – each type has its own cache bucket.
 * staleTime: 2 minutes – navigating back to a page shows data instantly.
 */
export function useGenerationsQuery({ type, limit = 12 }: UseGenerationsQueryOptions = {}) {
    const queryClient = useQueryClient();
    const queryKey = ["generations", type ?? "all"];

    const { data = [], isLoading, isFetching, error } = useQuery<GenerationRecord[]>({
        queryKey,
        queryFn: async () => {
            const serverData = await listGenerations({ type, limit });
            const oldData = queryClient.getQueryData<GenerationRecord[]>(queryKey) || [];
            const optimisticItems = oldData.filter(item => item.id.startsWith("temp-"));

            // Keep optimistic items at the front, then add server data
            return [...optimisticItems, ...serverData];
        },
        staleTime: 2 * 60 * 1000, // 2 minutes
        gcTime: 5 * 60 * 1000,    // keep in memory 5 minutes after last use
    });

    return {
        historyItems: data,
        // `isLoading` only covers the initial load. We also want skeletons during refetches
        // (e.g. cache hit + background network request).
        historyLoading: isLoading || isFetching,
        historyError: error instanceof Error ? error.message : "",
        queryKey,
    };
}

/**
 * Returns a helper to optimistically prepend a new generation into the
 * React Query cache for a given type, so the UI updates immediately.
 */
export function usePrependGeneration() {
    const queryClient = useQueryClient();

    return function prependGeneration(item: GenerationRecord) {
        const type = item.type;
        const queryKey = ["generations", type];
        const allKey = ["generations", "all"];

        // Prepend into the type-specific cache
        queryClient.setQueryData<GenerationRecord[]>(queryKey, (old = []) => [item, ...old]);
        // Also prepend into the "all" cache (used by video page which shows all types)
        queryClient.setQueryData<GenerationRecord[]>(allKey, (old = []) => [item, ...old]);
    };
}
