import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private connected = false;

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.connected = true;
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async readinessCheck(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      this.connected = true;
      return true;
    } catch {
      this.connected = false;
      return false;
    }
  }
}
