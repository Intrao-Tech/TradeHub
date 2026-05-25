import { IsIn } from 'class-validator';
import {
  CONTRACT_END_REASON,
  type ContractEndReason,
} from '../contract.constants';

export class EndContractDto {
  @IsIn([
    CONTRACT_END_REASON.COMPLETED,
    CONTRACT_END_REASON.CANCELED,
    CONTRACT_END_REASON.ABANDONED,
  ])
  end_reason!: Exclude<ContractEndReason, 'DISPUTED_LOST'>;
}
