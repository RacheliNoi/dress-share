import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const authorization = request.headers.authorization;

    if (!authorization) {
      throw new UnauthorizedException('נדרש להתחבר');
    }

    const [type, token] = authorization.split(' ');

    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException('Token לא תקין');
    }

    try {
      const payload = await this.jwtService.verifyAsync(token);

      // Rejects a token issued before the user's last "log out everywhere"
      // or password change - see User.tokenVersion's comment. One extra
      // indexed-by-primary-key lookup per authenticated request is the
      // unavoidable cost of a stateless JWT actually being revocable at
      // all; there's no way to invalidate a self-contained token without
      // checking something server-side on each use.
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { tokenVersion: true },
      });

      if (!user || user.tokenVersion !== payload.tokenVersion) {
        throw new UnauthorizedException('Token לא תקין או שפג תוקפו');
      }

      request.user = payload;

      return true;
    } catch {
      throw new UnauthorizedException('Token לא תקין או שפג תוקפו');
    }
  }
}