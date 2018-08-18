declare module "octonode" {
    interface Commit {
        html_url: string;
        commit: {
            message: string;
            author: {
                date: string;
            }
        }
    }

    interface Client {
        repo(name: string): Repo;
    }

    interface Repo {
        commits(cb: (err: Error, commits: Commit[]) => void): void;
    }

    function client(): Client;
}

declare module "timespan" {
    class TimeSpan {
        addMinutes(min: number): void;
        days: number;
        hours: number;
        minutes: number;
    }
}

declare module "sha1-file" {
    function sha1(path: string): string;
    export default sha1;
}
