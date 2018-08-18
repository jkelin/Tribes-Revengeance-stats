export interface IMatchResultFull {

}

export interface IFullReportPlayer {
}

export interface IFullReport {
    players: IFullReportPlayer[];
}

export interface ITribesServerQueryResponse {
    ip: string;
    teamone: string;
    teamtwo: string;
    teamonescore: number;
    teamtwoscore: number;
    hostname: string;
    gametype: string;
    adminname?: string;
    adminemail?: string;
    mapname?: string;
    mapnamefull?: string;
    ping: number;
    maxplayers: number;
    numplayers: number;
    hostport: number;
    players: Record<string, string | number>[]; // TODO
}

export interface IChatSay {
    usr: string;
    server: string;
    message: string;
}

export interface IChatMessage {
    when: Date;
    id: string;
    user: string;
    message: string;
    messageFriendly: string;
    server: string;
}

export interface INews {
    message: string;
    url: string;
    date: Date;
}

export interface IUploadedPlayer {
    ip?: string;
    name: string;
    score: number;
    kills: number;
    deaths: number;
    offense: number;
    defense: number;
    style: number;

    isUntracked?: boolean;
}

export interface IUploadedData {
    players: IUploadedPlayer[];
    port: number;
}
