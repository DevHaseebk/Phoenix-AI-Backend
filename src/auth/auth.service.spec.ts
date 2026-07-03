import { ConflictException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const findUnique = jest.fn();
  const create = jest.fn();
  const prisma = {
    user: {
      findUnique,
      create,
    },
  } as unknown as PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a user with normalized email and hashed password', async () => {
    create.mockResolvedValue({
      id: 'user-id',
      fullName: 'Haseeb',
      email: 'haseeb@example.com',
      status: 'ACTIVE',
    });
    findUnique.mockResolvedValue(null);

    const service = new AuthService(prisma);
    const response = await service.signup({
      fullName: ' Haseeb ',
      email: ' HASEEB@example.com ',
      password: 'StrongPassword123',
    });

    expect(findUnique).toHaveBeenCalledWith({
      where: { email: 'haseeb@example.com' },
      select: { id: true },
    });
    expect(create).toHaveBeenCalledWith({
      data: {
        email: 'haseeb@example.com',
        fullName: 'Haseeb',
        passwordHash: expect.any(String) as string,
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        status: true,
      },
    });

    const createCalls = create.mock.calls as Array<
      [{ data: { passwordHash: string } }]
    >;
    const createArgs = createCalls[0][0];

    expect(createArgs.data.passwordHash).not.toBe('StrongPassword123');
    await expect(
      argon2.verify(createArgs.data.passwordHash, 'StrongPassword123'),
    ).resolves.toBe(true);
    expect(response.user).toEqual({
      id: 'user-id',
      fullName: 'Haseeb',
      email: 'haseeb@example.com',
      status: 'ACTIVE',
    });
  });

  it('rejects duplicate email registration', async () => {
    findUnique.mockResolvedValue({ id: 'existing-user-id' });

    const service = new AuthService(prisma);

    await expect(
      service.signup({
        fullName: 'Haseeb',
        email: 'haseeb@example.com',
        password: 'StrongPassword123',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(create).not.toHaveBeenCalled();
  });
});
