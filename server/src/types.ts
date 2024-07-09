export interface ServerToClientEvents {
  updateStopLimit: (limitation: StopLimitation) => void;
}

export type CommonData = {
  diaName: string;
  closureName: string;
}

export type StopLimitation = {
  closureName: string;
  stopLimit: number;
}

export interface ClientToServerEvents {
  // 在線
  enterClosure: (data: CommonData) => void;
  // 離線
  leaveClosure: (data: CommonData) => void;
  // 本線防護から外す
  disableMainLineProtection: (data: CommonData) => void;
  // フレーム処理
  elapse: (data: CommonData) => void;
}

export interface InterServerEvents {
}

export interface SocketData {
}