/**
 * ServiceListSkeleton — legacy wrapper around the shared skeleton grid.
 */
import React from "react";

import { ServiceGridSkeleton } from "./ui/Skeleton";

export default function ServiceListSkeleton({ count = 3 }: { count?: number }) {
  return <ServiceGridSkeleton count={count} />;
}
