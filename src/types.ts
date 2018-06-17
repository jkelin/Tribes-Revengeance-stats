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
    port: string;
}
