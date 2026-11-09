import type { MindfulPost, MindfulPostKind } from './mindful-community';

export interface MindfulNotification {
  id: string;
  postId: string;
  kind: MindfulPostKind;
  nickname: string;
  templateId: string;
  text: string;
  createdAt: string;
}

export interface MindfulNotificationPage {
  enabled: boolean;
  items: MindfulNotification[];
  nextCursor: string | null;
}

export interface MindfulPostContext {
  post: MindfulPost;
  notification?: MindfulNotification | null;
}
