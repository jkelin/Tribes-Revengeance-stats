import * as Rx from "rxjs/Rx";
import { IChatMessage, IChatSay } from "./types";

export type EventSay = { type: 'say', data: IChatSay };
export type EventChatMessage = { type: 'chat-message', data: IChatMessage };
export type PlayerCountChange = { type: 'player-count-change', data: { server: string, players: number } };
export type EventAggregate = EventChatMessage | EventSay | PlayerCountChange;
export default new Rx.Subject<EventAggregate>();
