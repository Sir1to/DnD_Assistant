import { Module, type MiddlewareConsumer, type NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';

import { AuthModule } from './auth/auth.module';
import { BoardsModule } from './boards/boards.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { CharactersModule } from './characters/characters.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { OriginMiddleware } from './common/origin.middleware';
import { RequestIdMiddleware } from './common/request-id.middleware';
import { validateEnvironment } from './config/environment';
import { DatabaseModule } from './database/database.module';
import { DirectMessagesModule } from './direct-messages/direct-messages.module';
import { HealthModule } from './health/health.module';
import { RulesetsModule } from './rulesets/rulesets.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      validate: validateEnvironment,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const environment = config.get<string>('NODE_ENV');
        return {
          pinoHttp: {
            level:
              environment === 'test' ? 'silent' : environment === 'production' ? 'info' : 'debug',
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'req.body.password',
                'req.body.body',
                'res.headers["set-cookie"]',
                '*.password',
                '*.token',
              ],
              censor: '[REDACTED]',
            },
            genReqId: (request, response) => {
              const requestId = request.headers['x-request-id']?.toString().slice(0, 128);
              const id = requestId || globalThis.crypto.randomUUID();
              response.setHeader('x-request-id', id);
              return id;
            },
          },
        };
      },
    }),
    DatabaseModule,
    HealthModule,
    AuthModule,
    CampaignsModule,
    CharactersModule,
    RulesetsModule,
    BoardsModule,
    DirectMessagesModule,
  ],
  providers: [
    RequestIdMiddleware,
    OriginMiddleware,
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule implements NestModule {
  public configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestIdMiddleware, OriginMiddleware)
      .forRoutes({ path: '*splat', method: RequestMethod.ALL });
  }
}
