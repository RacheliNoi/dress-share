import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(data: {
    email: string;
    password: string;
    name?: string;
  }) {
    const existingUser = await this.prisma.user.findUnique({
      where: {
        email: data.email,
      },
    });

    if (existingUser) {
      throw new ConflictException('משתמש עם האימייל הזה כבר קיים');
    }

    const passwordHash = await bcrypt.hash(data.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        passwordHash,
      },
    });

    const accessToken = this.createAccessToken(user);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  async login(data: {
    email: string;
    password: string;
  }) {
    const user = await this.prisma.user.findUnique({
      where: {
        email: data.email,
      },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('אימייל או סיסמה שגויים');
    }

    const passwordMatches = await bcrypt.compare(
      data.password,
      user.passwordHash,
    );

    if (!passwordMatches) {
      throw new UnauthorizedException('אימייל או סיסמה שגויים');
    }

    const accessToken = this.createAccessToken(user);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  private createAccessToken(user: {
    id: number;
    email: string;
    role: string;
  }) {
    return this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
  }
}