export type AdminMemberKind = 'member';
export type AdminAccountType = 'member' | 'admin';
export type AdminMemberRole = 'user' | 'ctv' | 'admin';
export type AdminMemberStatus = 'active' | 'suspended';

export interface AdminMember {
  kind: AdminMemberKind;
  accountType: AdminAccountType;
  id: string;
  name: string;
  email: string | null;
  username: string | null;
  role: AdminMemberRole;
  status: AdminMemberStatus;
  suspendedAt: string | null;
  avatarUrl: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  isSelf: boolean;
}

export interface MemberDialogSubmission {
  body: Record<string, string | null>;
  confirmation: string | null;
}
