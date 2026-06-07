import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = (queryClient?: QueryClient) => {
  const qc = queryClient ?? new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient: qc },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
