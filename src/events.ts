import { Subject } from 'rxjs/Rx';
import { v4 } from 'uuid';
import { IChatMessage, IChatSay, IPlayerCountChangeMessage } from './types';

export interface IEventSay {
  type: 'say';
  data: IChatSay;
}
export interface IEventChatMessage {
  type: 'chat-message';
  data: IChatMessage;
}
export interface IEventReceivedMessage {
  type: 'received-message';
  data: IChatMessage;
}
export interface IPlayerCountChange {
  type: 'player-count-change';
  data: IPlayerCountChangeMessage;
}
export type EventAggregate = IEventChatMessage | IEventReceivedMessage | IEventSay | IPlayerCountChange;
export default new Subject<EventAggregate>();

export const selfEventId = v4();
