import { IoAdapter } from '@nestjs/platform-socket.io';
import { INestApplication, Logger } from '@nestjs/common';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { ServerOptions } from 'socket.io';

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter> | null = null;
  private readonly logger = new Logger(RedisIoAdapter.name);

  constructor(app: INestApplication) {
    super(app);
  }

  async connectToRedis(redisUrl: string): Promise<void> {
    try {
      const pubClient = new Redis(redisUrl);
      const subClient = pubClient.duplicate();

      await Promise.all([
        new Promise<void>((res, rej) => {
          pubClient.on('ready', res);
          pubClient.on('error', rej);
        }),
        new Promise<void>((res, rej) => {
          subClient.on('ready', res);
          subClient.on('error', rej);
        }),
      ]);

      this.adapterConstructor = createAdapter(pubClient, subClient);
      this.logger.log('Redis adapter connected — multi-instance WS ready');
    } catch (err) {
      this.logger.warn(
        `Redis not available (${(err as Error).message}). Using in-memory adapter — single instance only.`,
      );
      this.adapterConstructor = null;
    }
  }

  createIOServer(port: number, options?: Partial<ServerOptions>) {
    const server = super.createIOServer(port, {
      ...options,
      cors: { origin: '*' },
    });
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }
}
