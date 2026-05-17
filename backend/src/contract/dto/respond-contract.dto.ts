import { IsBoolean } from 'class-validator';

export class RespondContractDto {
  @IsBoolean()
  accept!: boolean;
}
