import {StationStatus} from '@prisma/client';

export type ElapsedData = {
  signalName: string;
  signalPhase: SignalPhaseExtra;
  signalType: string;
}

export interface ServerToClientEvents {
  elapsed: (data: ElapsedData) => void;
  getRouteResult: (data: TrackCircuitInfo[]) => void;
  routeOpenResult: (data: string) => void;
  routeCancelResult: (data: string) => void;
  getAllSignalResult: (data: SignalInfo[]) => void;
}

export const SignalPhaseList = ['R', 'YY', 'Y', 'YG', 'G'] as const;
export type SignalPhase = typeof SignalPhaseList[number];
export type SignalPhaseExtra = SignalPhase | 'SwitchG' | 'N'

export type CommonData = {
  diaName: string;
  signalName: string;
}

export type TrackCircuitInfo = {
  name: string,
  startMeter: number,
  endMeter: number,
  signalType?: string,
}

export type SignalInfo = ElapsedData & {
  diaName: string | null;
  isClosure: boolean;
  stationStatus: StationStatus
}

export interface ClientToServerEvents {
  // 行路情報取得
  getRoute: (diaName: string) => void;
  // 在線
  enterSignal: (data: CommonData) => void;
  // 離線
  leaveSignal: (data: CommonData) => void;
  // 進入完了
  enteringComplete: (data: CommonData) => void;
  // 進路開通
  routeOpen: (signalName: string) => void;
  // 進路閉鎖
  routeCancel: (signalName: string) => void;
  // フレーム処理
  elapse: (data: CommonData) => void;
  // 全信号機情報取得
  getAllSignal: () => void;
}

export interface InterServerEvents {
}

export interface SocketData {
}