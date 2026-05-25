import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';

function convertBigInts(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return Number(obj);
  if (Array.isArray(obj)) return obj.map(convertBigInts);
  if (obj instanceof Date) return obj;
  if (typeof obj === 'object') {
    // Objects that own a toJSON (Prisma.Decimal, Buffer, …) must be left
    // intact so JSON.stringify can call their serialiser; cloning their
    // enumerable fields drops the method and corrupts the wire format.
    if (typeof (obj as { toJSON?: unknown }).toJSON === 'function') return obj;
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = convertBigInts(value);
    }
    return result;
  }
  return obj;
}

@Injectable()
export class BigIntSerializationInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(map(convertBigInts));
  }
}
