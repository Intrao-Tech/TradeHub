import { lazy } from 'react';
import { authGatedPage } from '@/lib/authGatedPage';

export default authGatedPage(
  lazy(() => import('./PublicJobBoardPage')),
  lazy(() => import('./AuthJobBoardPage')),
);
