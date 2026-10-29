export interface Room {
  room: string;
  label: string;
  capacity: number | null;
  seating: string | null;
  writing: string | null;
  /** A lab or departmental room LSM doesn't list, known only from classes held there. */
  dept?: boolean;
}

export interface Building {
  code: string;
  name: string;
  address: string | null;
  rooms: Room[];
}

/**
 * [building, room ("" if unknown), day 1-7 (Mon=1), startMin, endMin, "COURSE SECTION", reported?]
 * reported = 1: a class students reported (and a maintainer checked) that our sources don't list.
 */
export type Meeting = [string, string, number, number, number, string, 1?];

export interface Calendar {
  classesStart: string;
  classesEnd: string;
  noClasses: { start: string; end: string; label: string }[];
}

export interface CampusData {
  generatedAt: string;
  session: string;
  termLabel: string;
  demo?: boolean;
  calendar?: Calendar | null;
  buildings: Building[];
  meetings: Meeting[];
}
