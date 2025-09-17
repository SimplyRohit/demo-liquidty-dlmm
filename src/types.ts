import { Context } from "telegraf";

export interface MySession {
  markets?: string[];
  lastFetchedAt?: number;
  currentPage?: number;
}

export interface MyContext extends Context {
  session?: MySession;
}
