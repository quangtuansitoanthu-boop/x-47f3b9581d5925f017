import type { SessionRole } from '../auth/types';
import { ServerInputError } from '../errors';

export type AdminMemberStatus = 'active' | 'suspended';

export interface AdminMemberUpdate {
  assignments: string[];
  values: unknown[];
  role?: SessionRole;
  status?: AdminMemberStatus;
}

export function buildMemberUpdate(input: Record<string, unknown>): AdminMemberUpdate {
  const assignments: string[] = [];
  const values: unknown[] = [];
  let role: SessionRole | undefined;
  let status: AdminMemberStatus | undefined;
  if (Object.hasOwn(input, 'name')) push(assignments, values, 'display_name', readOptionalText(input.name, 'Tên hiển thị', 200, false));
  if (Object.hasOwn(input, 'email')) {
    throw new ServerInputError(400, 'immutable_email', 'Email tài khoản không thể thay đổi trong khu vực quản trị.');
  }
  if (Object.hasOwn(input, 'role')) {
    role = readMemberRole(input.role);
    push(assignments, values, 'role', role);
  }
  if (Object.hasOwn(input, 'status')) {
    status = readMemberStatus(input.status);
    push(assignments, values, 'status', status);
    push(assignments, values, 'suspended_at', status === 'suspended' ? new Date().toISOString() : null);
  }
  return { assignments, values, role, status };
}

function readOptionalText(value: unknown, name: string, max: number, nullable: boolean): string | null {
  if (value == null && nullable) return null;
  if (typeof value !== 'string') throw new ServerInputError(400, 'invalid_field', `${name} không hợp lệ.`);
  const clean = value.trim();
  if (!clean && nullable) return null;
  if (!clean || clean.length > max) throw new ServerInputError(400, 'invalid_field', `${name} không hợp lệ.`);
  return clean;
}

function readMemberRole(value: unknown): SessionRole {
  if (value === 'user' || value === 'ctv' || value === 'admin') return value;
  throw new ServerInputError(400, 'invalid_role', 'Vai trò không hợp lệ.');
}

function readMemberStatus(value: unknown): AdminMemberStatus {
  if (value === 'active' || value === 'suspended') return value;
  throw new ServerInputError(400, 'invalid_status', 'Trạng thái tài khoản không hợp lệ.');
}

function push(assignments: string[], values: unknown[], column: string, value: unknown): void {
  assignments.push(`${column} = ?`);
  values.push(value);
}
