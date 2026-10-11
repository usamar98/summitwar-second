import type {CSSProperties} from 'react';
import type {Entry} from './types';
export const ENTRANT_COLORS=['#a9d887','#83c9ef','#ebc477','#eb99af','#bbaceb','#78d6bb','#e9a07d','#80d2dc'] as const;
export function entrantColor(entry?:Entry,slot?:number|null){const place=entry?.registration_slot||entry?.priority||slot||1;return {'--entrant-color':ENTRANT_COLORS[(place-1)%8]} as CSSProperties;}
