import express, { Request, Response, NextFunction } from 'express';
import taskRoutes from '../../routes/tasks';

export function makeApp() {
  const app = express();
  app.use(express.json());

  // Bypass auth and workspace guards — inject test identity
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = { id: 'user-1' };
    (req as any).workspaceId = 'ws-1';
    next();
  });

  app.use('/api/tasks', taskRoutes);
  return app;
}
