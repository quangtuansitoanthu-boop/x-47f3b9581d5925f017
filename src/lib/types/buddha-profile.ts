export interface BuddhaProfileSection {
  id: string;
  title: string;
  paragraphs: string[];
  notes: string[];
}

export interface BuddhaProfile {
  id: string;
  name: string;
  summary: string;
  sections: BuddhaProfileSection[];
  references: string[];
}
