import { Module } from '@nestjs/common';
import { SpecialisationController } from './specialisation.controller';
import { SpecialisationService } from './specialisation.service';

@Module({
  controllers: [SpecialisationController],
  providers: [SpecialisationService],
  exports: [SpecialisationService],
})
export class SpecialisationModule {}
