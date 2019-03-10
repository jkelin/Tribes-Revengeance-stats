import * as Rx from 'rxjs/Rx';
import { IChatMessage, IChatSay, IPlayerCountChangeMessage } from './types';
import { v4 } from 'uuid';

export type EventSay = { type: 'say'; data: IChatSay };
export type EventChatMessage = { type: 'chat-message'; data: IChatMessage };
export type EventReceivedMessage = { type: 'received-message'; data: IChatMessage };
export type PlayerCountChange = { type: 'player-count-change'; data: IPlayerCountChangeMessage };
export type EventAggregate = EventChatMessage | EventReceivedMessage | EventSay | PlayerCountChange;
export default new Rx.Subject<EventAggregate>();

export const selfEventId = v4();
