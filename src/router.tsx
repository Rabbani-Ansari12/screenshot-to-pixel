import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { AppError } from "@/services/supabase/errors";

const PERMANENT: AppError["status"][] = ["not_found", "forbidden", "invalid", "conflict"];

export const getRouter = () => {
  // One client per request: a module-level QueryClient leaks cached data between SSR requests.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Retry only what can fix itself (network / unknown). "Not found", "no permission" and
        // invalid input show their message at once instead of a long spinner.
        retry: (count, error) =>
          count < 2 && !(error instanceof AppError && PERMANENT.includes(error.status)),
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Lets Query own freshness; set caching defaults on the QueryClient, not the router.
    defaultPreloadStaleTime: 0,
  });

  return router;
};
