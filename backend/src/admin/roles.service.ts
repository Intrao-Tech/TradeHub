import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CreateRoleDto,
  SetRolePermissionsDto,
  UpdateRoleDto,
} from './dto/role-dto';

const ROLE_INCLUDE = {
  role_permissions: {
    include: { permission: true },
  },
  _count: { select: { staff_member_roles: true } },
} satisfies Prisma.StaffRoleInclude;

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ─── Listing ────────────────────────────────────────────────

  async listRoles() {
    const rows = await this.prisma.staffRole.findMany({
      orderBy: [{ is_system: 'desc' }, { name: 'asc' }],
      include: ROLE_INCLUDE,
    });
    return rows.map((r) => this.serializeRole(r));
  }

  async listPermissions() {
    const perms = await this.prisma.permission.findMany({
      orderBy: [{ category: 'asc' }, { key: 'asc' }],
    });
    const byCategory: Record<
      string,
      { key: string; description: string; is_system: boolean }[]
    > = {};
    for (const p of perms) {
      (byCategory[p.category] ??= []).push({
        key: p.key,
        description: p.description,
        is_system: p.is_system,
      });
    }
    return {
      total: perms.length,
      categories: Object.entries(byCategory).map(([category, items]) => ({
        category,
        items,
      })),
    };
  }

  async getRole(id: number) {
    const role = await this.prisma.staffRole.findUnique({
      where: { id },
      include: ROLE_INCLUDE,
    });
    if (!role) throw new NotFoundException({ code: 'ROLE_NOT_FOUND' });
    return this.serializeRole(role);
  }

  // ─── Create / update / delete ───────────────────────────────

  async createRole(dto: CreateRoleDto, byStaffId: bigint, ip?: string) {
    const name = dto.name.trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9_]{1,39}$/.test(name)) {
      throw new BadRequestException({
        code: 'INVALID_ROLE_NAME',
        message:
          'Role name must be UPPER_SNAKE_CASE (A-Z, 0-9, _), starting with a letter.',
      });
    }
    const existing = await this.prisma.staffRole.findUnique({
      where: { name },
    });
    if (existing) {
      throw new ConflictException({
        code: 'ROLE_EXISTS',
        message: `A role named "${name}" already exists.`,
      });
    }

    const role = await this.prisma.$transaction(async (tx) => {
      const created = await tx.staffRole.create({
        data: {
          name,
          description: dto.description?.trim() || null,
          is_system: false,
        },
      });
      if (dto.permission_keys?.length) {
        await this.applyPermissionSet(
          tx,
          created.id,
          dto.permission_keys,
          byStaffId,
        );
      }
      return created;
    });

    await this.audit.log(
      byStaffId,
      'admin.role.created',
      'staff_role',
      BigInt(role.id),
      { name, permission_count: dto.permission_keys?.length ?? 0 },
      ip,
    );
    return this.getRole(role.id);
  }

  async updateRole(
    id: number,
    dto: UpdateRoleDto,
    byStaffId: bigint,
    ip?: string,
  ) {
    const role = await this.prisma.staffRole.findUnique({ where: { id } });
    if (!role) throw new NotFoundException({ code: 'ROLE_NOT_FOUND' });
    if (role.is_system && dto.name && dto.name !== role.name) {
      throw new ForbiddenException({
        code: 'CANNOT_RENAME_SYSTEM_ROLE',
        message: `${role.name} is a system role and cannot be renamed.`,
      });
    }
    const data: Prisma.StaffRoleUpdateInput = {};
    if (dto.name !== undefined) {
      const newName = dto.name.trim().toUpperCase();
      if (!/^[A-Z][A-Z0-9_]{1,39}$/.test(newName)) {
        throw new BadRequestException({
          code: 'INVALID_ROLE_NAME',
          message: 'Role name must be UPPER_SNAKE_CASE.',
        });
      }
      if (newName !== role.name) {
        const clash = await this.prisma.staffRole.findUnique({
          where: { name: newName },
        });
        if (clash) {
          throw new ConflictException({
            code: 'ROLE_EXISTS',
            message: `A role named "${newName}" already exists.`,
          });
        }
        data.name = newName;
      }
    }
    if (dto.description !== undefined) {
      data.description = dto.description.trim() || null;
    }
    if (Object.keys(data).length === 0) {
      return this.getRole(id);
    }
    await this.prisma.staffRole.update({ where: { id }, data });
    await this.audit.log(
      byStaffId,
      'admin.role.updated',
      'staff_role',
      BigInt(id),
      { changed: Object.keys(data) },
      ip,
    );
    return this.getRole(id);
  }

  async deleteRole(id: number, byStaffId: bigint, ip?: string) {
    const role = await this.prisma.staffRole.findUnique({
      where: { id },
      include: { _count: { select: { staff_member_roles: true } } },
    });
    if (!role) throw new NotFoundException({ code: 'ROLE_NOT_FOUND' });
    if (role.is_system) {
      throw new ForbiddenException({
        code: 'CANNOT_DELETE_SYSTEM_ROLE',
        message: `${role.name} is a system role and cannot be deleted.`,
      });
    }
    if (role._count.staff_member_roles > 0) {
      throw new ConflictException({
        code: 'ROLE_IN_USE',
        message: `Cannot delete role "${role.name}" — ${role._count.staff_member_roles} staff member(s) still hold it. Reassign them first.`,
      });
    }
    await this.prisma.staffRole.delete({ where: { id } });
    await this.audit.log(
      byStaffId,
      'admin.role.deleted',
      'staff_role',
      BigInt(id),
      { name: role.name },
      ip,
    );
    return { ok: true };
  }

  // ─── Permission grants ──────────────────────────────────────

  async setRolePermissions(
    id: number,
    dto: SetRolePermissionsDto,
    byStaffId: bigint,
    ip?: string,
  ) {
    const role = await this.prisma.staffRole.findUnique({ where: { id } });
    if (!role) throw new NotFoundException({ code: 'ROLE_NOT_FOUND' });
    if (role.name === 'ADMIN') {
      throw new ForbiddenException({
        code: 'CANNOT_EDIT_ADMIN_PERMISSIONS',
        message:
          'ADMIN implicitly has every permission and cannot be edited. Demote staff to a different role if you need to limit them.',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { staff_role_id: id } });
      await this.applyPermissionSet(tx, id, dto.permission_keys, byStaffId);
    });

    await this.audit.log(
      byStaffId,
      'admin.role.permissions_set',
      'staff_role',
      BigInt(id),
      { name: role.name, count: dto.permission_keys.length },
      ip,
    );
    return this.getRole(id);
  }

  // ─── Internals ──────────────────────────────────────────────

  private async applyPermissionSet(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    roleId: number,
    keys: string[],
    byStaffId: bigint,
  ) {
    if (keys.length === 0) return;
    const perms = await tx.permission.findMany({
      where: { key: { in: keys } },
    });
    if (perms.length !== keys.length) {
      const found = new Set(perms.map((p) => p.key));
      const missing = keys.filter((k) => !found.has(k));
      throw new BadRequestException({
        code: 'UNKNOWN_PERMISSIONS',
        message: `Unknown permission key(s): ${missing.join(', ')}`,
        missing,
      });
    }
    await tx.rolePermission.createMany({
      data: perms.map((p) => ({
        staff_role_id: roleId,
        permission_id: p.id,
        granted_by_staff_id: byStaffId,
      })),
      skipDuplicates: true,
    });
  }

  private serializeRole(role: {
    id: number;
    name: string;
    description: string | null;
    is_system: boolean;
    created_at: Date;
    role_permissions: { permission: { key: string; category: string } }[];
    _count: { staff_member_roles: number };
  }) {
    return {
      id: role.id,
      name: role.name,
      description: role.description,
      is_system: role.is_system,
      created_at: role.created_at,
      member_count: role._count.staff_member_roles,
      permission_keys: role.role_permissions.map((rp) => rp.permission.key),
      // ADMIN has all perms implicitly — flag for the UI to show "All".
      has_all_permissions: role.name === 'ADMIN',
    };
  }
}
