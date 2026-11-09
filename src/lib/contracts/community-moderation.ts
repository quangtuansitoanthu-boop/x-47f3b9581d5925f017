export const COMMUNITY_REPORT_REASONS = ['offensive', 'harassment', 'spam', 'other'] as const;
export type CommunityReportReason = typeof COMMUNITY_REPORT_REASONS[number];
export type CommunityModerationStatus = 'pending' | 'approved' | 'rejected';
export interface CommunityReportInput {
  targetType: 'comment' | 'profile';
  targetId: string;
  reason: CommunityReportReason;
  details?: string;
}
export interface CommunityAuthor {
  authorId?: string | null;
  isOwnProfile?: boolean;
}
export interface ModeratedComment extends CommunityAuthor {
  id: number;
  bai_viet_id: string;
  parent_id: number | null;
  ten: string;
  noi_dung: string;
  tao_luc: string;
  role: 'admin' | 'ctv' | 'user' | null;
  moderationStatus: CommunityModerationStatus;
  moderationReason?: string | null;
  email?: string;
  dien_thoai?: string;
}
export interface CommunityIdentitySnapshot {
  displayName: string;
  avatarUrl: string;
}
export interface OwnCommunityProfile {
  authorId: string;
  submitted: CommunityIdentitySnapshot;
  approved: CommunityIdentitySnapshot | null;
  moderationStatus: CommunityModerationStatus;
  moderationReason: string | null;
  revision: number;
  submittedAt: string;
}
export const COMMUNITY_BLOCKS_CHANGED_EVENT = 'quangtu:community-blocks-changed';
export interface CommunityBlocksChangedDetail {
  principalId: string;
  authorId: string;
  blocked: boolean;
}
export interface CommunityBlockedProfile {
  authorId: string;
  displayName: string;
  avatarUrl: string;
  blockedAt: string;
}
export type ModerationQueueKind = 'comments' | 'profiles' | 'reports';
export interface ModerationMember {
  id: string;
  name: string;
  role: 'admin' | 'ctv' | 'user';
  status: 'active' | 'suspended';
  isSelf: boolean;
}
export interface ModerationTarget {
  kind: 'comments' | 'profiles';
  id: string;
  revision: number;
  moderationStatus: CommunityModerationStatus;
  displayName: string;
  avatarUrl: string;
  content: string;
  articleId: string | null;
  articleTitle?: string | null;
  parentId?: number | null;
  parentContent?: string | null;
  member: ModerationMember | null;
}
export interface ModerationQueueItem {
  id: string;
  kind: ModerationQueueKind;
  revision: number;
  submittedAt: string;
  displayName: string;
  avatarUrl: string;
  content: string;
  articleId: string | null;
  articleTitle?: string | null;
  parentId?: number | null;
  parentContent?: string | null;
  member: ModerationMember | null;
  moderationStatus?: CommunityModerationStatus;
  approvedIdentity?: CommunityIdentitySnapshot | null;
  reportReason?: CommunityReportReason;
  target?: ModerationTarget | null;
}
export interface ModerationQueuePage {
  items: ModerationQueueItem[];
  nextCursor: string | null;
}
export interface ModerationDecision {
  action: 'approve' | 'reject' | 'hide' | 'resolve';
  revision: number;
  reason?: string | null;
}
