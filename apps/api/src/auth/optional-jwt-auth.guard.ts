import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';

// For a route that's open to the public but should still attribute the
// submission to a logged-in caller when possible (e.g. anonymous
// feedback) - unlike JwtAuthGuard, this NEVER blocks the request. It only
// ever sets request.user when a genuinely valid, non-revoked token is
// present; anything else (no header, malformed, expired, revoked via
// tokenVersion) just leaves request.user null rather than throwing, so
// @CurrentUser() reads null for an anonymous caller instead of erroring.
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    request.user = null;

    const authorization = request.headers.authorization;

    if (!authorization) {
      return true;
    }

    const [type, token] = authorization.split(' ');

    if (type !== 'Bearer' || !token) {
      return true;
    }

    try {
      const payload = await this.jwtService.verifyAsync(token);

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { tokenVersion: true },
      });

      if (user && user.tokenVersion === payload.tokenVersion) {
        request.user = payload;
      }
    } catch {
      // Invalid/expired token on an optional-auth route - treat exactly
      // like no token at all, not an error.
    }

    return true;
  }
}
