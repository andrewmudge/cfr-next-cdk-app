// Public, contact-free shape of the family tree (built from public/FamilyTree.html).
export interface TreePerson {
  id: string; // FamilyMembers personId, e.g. "ft_P2ZQI" (same IDs as sign-ups)
  given: string;
  family: string;
  nickname?: string;
  gender?: 'M' | 'F';
  deceased: boolean;
  /** Only present for deceased people. */
  born?: number;
  died?: number;
  motherId?: string;
  fatherId?: string;
  /** Current partner first, then ex/extra partners. */
  partnerIds: string[];
  friendIds: string[];
}

export interface TreeData {
  rootId: string; // the reunion's patriarch (Patrick Churchwell)
  people: TreePerson[];
}

export const ROOT_ID = 'ft_P2ZQI';
