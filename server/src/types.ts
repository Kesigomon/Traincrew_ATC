import {SignalType} from '@prisma/client';


export type ElapsedData = {
  signalName: string;
  signalPhase: SignalPhase;
}

export interface ServerToClientEvents {
  elapsed: (data: ElapsedData) => void;
}

export const SignalPhaseList = ['R', 'YY', 'Y', 'YG', 'G'] as const;
export type SignalPhase = typeof SignalPhaseList[number];

export type CommonData = {
  diaName: string;
  signalName: string;
}

export type StopLimitation = {
  closureName: string;
  stopLimit: number;
}

export interface ClientToServerEvents {
  // 行路情報取得
  getRoute: (diaName: string) => void;
  // 在線
  enterClosure: (data: CommonData) => void;
  // 離線
  leaveClosure: (data: CommonData) => void;
  // 進入完了
  enteringComplete: (data: CommonData) => void;
  // 進路開通
  routeOpen: (signalName: string) => void;
  // フレーム処理
  elapse: (data: CommonData) => void;
}

export interface InterServerEvents {
}

export interface SocketData {
}