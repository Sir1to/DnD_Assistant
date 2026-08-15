import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { BoardAccessService } from './board-access.service';
import { BoardEventsService } from './board-events.service';
import { BoardsController } from './boards.controller';
import { BoardsGateway } from './boards.gateway';
import { BoardsService } from './boards.service';
import { WidgetRegistryService } from './widget-registry.service';
import { WidgetCommandsService } from './widget-commands.service';

@Module({
  imports: [AuthModule],
  controllers: [BoardsController],
  providers: [
    BoardAccessService,
    BoardEventsService,
    BoardsGateway,
    BoardsService,
    WidgetCommandsService,
    WidgetRegistryService,
  ],
})
export class BoardsModule {}
