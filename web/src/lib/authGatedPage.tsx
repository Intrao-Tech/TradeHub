import {
  Suspense,
  type ComponentType,
  type LazyExoticComponent,
} from 'react';
import { getToken } from '@/api';
import { Skeleton } from '@/components/ui/skeleton';

function Fallback() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

export function authGatedPage(
  Public: LazyExoticComponent<ComponentType>,
  Auth: LazyExoticComponent<ComponentType>,
) {
  return function AuthGatedPage() {
    const loggedIn = !!getToken();
    return (
      <Suspense fallback={<Fallback />}>
        {loggedIn ? <Auth /> : <Public />}
      </Suspense>
    );
  };
}
