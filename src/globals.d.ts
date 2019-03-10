declare module 'octonode' {
  interface ICommit {
    html_url: string;
    commit: {
      message: string;
      author: {
        date: string;
      };
    };
  }

  interface IClient {
    repo(name: string): IRepo;
  }

  interface IRepo {
    commits(cb: (err: Error, commits: ICommit[]) => void): void;
  }

  function client(): IClient;
}

declare module 'timespan' {
  class TimeSpan {
    public days: number;
    public hours: number;
    public minutes: number;
    public addMinutes(min: number): void;
  }
}

declare module 'sha1-file' {
  function sha1(path: string): string;
  export default sha1;
}
