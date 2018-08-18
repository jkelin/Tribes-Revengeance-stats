import Rx from "rxjs/Rx";
import { IChatMessage, IChatSay } from "./types";

export type EventSay = { type: 'say', data: IChatSay };
export type EventChatMessage = { type: 'chat-message', data: IChatMessage };
export type EventAggregate = EventChatMessage | EventSay;
export default new Rx.Subject<EventAggregate>();
