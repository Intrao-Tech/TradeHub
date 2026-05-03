import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateAccountDto } from './dto/update-account.dto';

@Injectable()
export class AccountService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(accountId: bigint) {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      include: {
        client_profile: {
          include: {
            worker_profile: true,
            employer_profile: true,
          },
        },
        staff_member: true,
      },
    });
    if (!account) throw new NotFoundException('Account not found');
    return account;
  }

  async updateAccount(accountId: bigint, dto: UpdateAccountDto) {
    const data: { phone?: string; phone_verified?: boolean } = {};
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.phone_verified !== undefined)
      data.phone_verified = dto.phone_verified;

    try {
      return await this.prisma.account.update({
        where: { id: accountId },
        data,
        include: {
          client_profile: {
            include: {
              worker_profile: true,
              employer_profile: true,
            },
          },
          staff_member: true,
        },
      });
    } catch {
      throw new NotFoundException('Account not found');
    }
  }

  async deactivateAccount(accountId: bigint) {
    try {
      return await this.prisma.account.update({
        where: { id: accountId },
        data: { status: 'DEACTIVATED' },
        include: {
          client_profile: {
            include: {
              worker_profile: true,
              employer_profile: true,
            },
          },
          staff_member: true,
        },
      });
    } catch {
      throw new NotFoundException('Account not found');
    }
  }
}
