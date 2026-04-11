/** Internal payload for creating a moderation queue item (not exposed via HTTP). */
export class CreateModerationItemDto {
  document_id?: bigint;
  entity_type!: string;
  entity_id!: bigint;
  queue_type!: string;
  priority?: number;
}
