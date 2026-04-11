import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';

@Injectable()
export class ParseBigIntPipe implements PipeTransform<string, bigint> {
  transform(value: string): bigint {
    if (value == null || !/^\d+$/.test(String(value))) {
      throw new BadRequestException('id must be a positive integer');
    }
    return BigInt(value);
  }
}
