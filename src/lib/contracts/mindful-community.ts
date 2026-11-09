export const MINDFUL_POST_KINDS = ['repentance', 'good_deed'] as const;
export type MindfulPostKind = typeof MINDFUL_POST_KINDS[number];

export const MINDFUL_REACTION_TEMPLATES = {
  repentance: [
    { id: 'tam-bao', text: 'Nam Mô A Di Đà Phật. Nguyện hồng ân Tam Bảo gia hộ cho đạo hữu nghiệp chướng tiêu trừ, thân tâm an lạc.' },
    { id: 'bo-de', text: 'Tùy hỷ tâm phát lồ sám hối thanh tịnh của bạn. Nguyện lỗi xưa dứt sạch, bồ đề tâm kiên cố.' },
    { id: 'quan-am', text: 'Nam Mô Đại Bi Quán Thế Âm Bồ Tát gia hộ cho đạo hữu phước huệ tăng trưởng, từ nay không tái phạm.' },
  ],
  good_deed: [
    { id: 'hoan-hy', text: 'Nam Mô Hoan Hỷ Tạng Bồ Tát, tùy hỷ công đức lành của đạo hữu.' },
    { id: 'thien-can', text: 'Nguyện phước báu viên mãn, thiện căn tăng trưởng.' },
  ],
} as const;

export interface MindfulPost {
  id: string;
  kind: MindfulPostKind;
  nickname: string;
  content: string;
  createdAt: string;
  reactionCount: number;
  viewerReacted: boolean;
  isOwn: boolean;
  status: 'published' | 'hidden' | 'removed';
}

export interface MindfulPostDraft {
  clientPostId: string;
  kind: MindfulPostKind;
  nickname: string;
  content: string;
}

export interface MindfulPostPage {
  enabled: boolean;
  items: MindfulPost[];
  nextCursor: string | null;
}

export interface MindfulReaction {
  nickname: string;
  templateId: string;
  text: string;
  createdAt: string;
}

export interface MindfulReactionPage {
  items: MindfulReaction[];
  nextCursor: string | null;
}

export interface MindfulReactionResult {
  postId: string;
  reactionCount: number;
  viewerReacted: true;
  templateId: string;
}
