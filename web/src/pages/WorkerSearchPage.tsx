import { lazy } from 'react';
import { authGatedPage } from '@/lib/authGatedPage';

export default authGatedPage(
  lazy(() => import('./PublicWorkerSearchPage')),
  lazy(() => import('./AuthWorkerSearchPage')),
);
