import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AI_PROVIDER } from './ai-provider.interface';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { GeminiAiProvider } from './providers/gemini-ai.provider';
import { LocalAiProvider } from './providers/local-ai.provider';

@Module({
  imports: [AuthModule, PrismaModule, DashboardModule],
  controllers: [AiController],
  providers: [
    AiService,
    {
      provide: AI_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const aiEnabled = config.get<string>('AI_ENABLED') !== 'false';
        const provider = config.get<string>('AI_PROVIDER') ?? 'gemini';
        const geminiApiKey = config.get<string>('GEMINI_API_KEY');

        if (!aiEnabled || provider === 'local' || !geminiApiKey) {
          return new LocalAiProvider();
        }

        return new GeminiAiProvider(geminiApiKey);
      },
    },
  ],
})
export class AiModule {}
