import { queryOptions } from "@tanstack/react-query";
import { loadAppData } from "@/services/app-service";

export const appDataOptions = () => queryOptions({ queryKey: ["app-data"], queryFn: loadAppData, staleTime: 60_000 });
