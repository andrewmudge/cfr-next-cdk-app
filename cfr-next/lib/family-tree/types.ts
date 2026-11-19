// Public, contact-free shape of the family tree (built from public/FamilyTree.html).
export interface TreePerson {
  id: string; // Family Echo ID, e.g. "P2ZQI" (sign-ups use "ft_" + id)
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
}

export interface TreeData {
  rootId: string; // the reunion's patriarch (Patrick Churchwell)
  people: TreePerson[];
}

export const ROOT_ID = 'P2ZQI';
