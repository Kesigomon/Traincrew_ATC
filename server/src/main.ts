import {createServer} from 'http';
import {Server} from 'socket.io';
import {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
  SignalPhase, SignalPhaseList
} from './types';
import {NextSignal, PrismaClient, Signal, SignalType, StationStatus} from '@prisma/client';
import {instrument} from '@socket.io/admin-ui';

const httpServer = createServer();
const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(httpServer, {});
const prisma = new PrismaClient();


const calcSignalPhase = async (signalName: string, diaName: string): Promise<SignalPhase | null> => {
  const nextClosureLength = 6;

  const targetSignal = await prisma.signal.findUnique({
    where: {name: signalName}
  });
  if (targetSignal === null) {
    return null;
  }

  const signalsArray = await prisma.signal.findMany({
    where: {
      direction: targetSignal.direction,
      order: {gte: targetSignal.order, lte: targetSignal.order + nextClosureLength}
    },
    orderBy: {order: 'asc'},
    include: {
      nextSignal: true
    }
  });
  signalsArray[0].nextSignal
  const signals = new Map(signalsArray.map(signal => [signal.name, signal]));
  return calcOneSignalPhase(signalName, diaName, signals);
}

const calcOneSignalPhase = (
    signalName: string,
    diaName: string,
    signals: Map<string, Signal & { nextSignal: NextSignal[] }>
): SignalPhase => {
  const R: SignalPhase = 'R';
  const targetSignal = signals.get(signalName);
  // 信号情報がない(つまり、再起しきった) or 自分以外の在線がいる場合は停止信号
  if (targetSignal === undefined || targetSignal.diaName !== null && targetSignal.diaName !== diaName) {
    return 'R'
  }
  // 閉塞信号機以外(場内、出発、入換)の場合の処理
  // 進路が開通していない場合は停止信号
  if (!targetSignal.isClosure && !calcStationSignal(targetSignal, diaName)) {
    return 'R'
  }
  // 再帰的に次の信号の現示を計算
  const nextSignalMaxPhase = targetSignal.nextSignal.reduce<SignalPhase>((acc, next) => {
    const nextSignalPhase = calcOneSignalPhase(next.nextSignalName, diaName, signals);
    const accIndex = SignalPhaseList.indexOf(acc)
    const nextIndex = SignalPhaseList.indexOf(nextSignalPhase)
    return SignalPhaseList[Math.max(accIndex, nextIndex)];
  }, R);
  return upperSignalPhase(nextSignalMaxPhase, targetSignal.type);
}

const calcStationSignal = (signal: Signal, diaName: string): boolean => {
  // 別な列車が進入中の場合は停止信号(まずないはず)
  if (signal.diaName !== null && signal.diaName !== diaName) {
    return false;
  }
  // 自分自身が進入中なら、正しいステータスになってるか確認
  if (signal.diaName === diaName) {
    return (
        signal.stationStatus === StationStatus.ROUTE_ENTERING
        || signal.stationStatus === StationStatus.ROUTE_ENTERED
    );
  }
  // それ以外なら、進路が開通しているか確認
  return signal.stationStatus === StationStatus.ROUTE_OPENED;
}

const openSignal = async (signalName: string): Promise<string> => {
  const signal = await prisma.signal.findUnique({
    where: {name: signalName},
    include: {
      nextEnterSignal: {
        include: {
          nextSignal: true
        }
      }

    }
  });
  if (signal === null) {
    return '信号情報が見つかりませんでした';
  }
  // 開通できないステータスの場合開通しない
  if (signal.stationStatus !== StationStatus.ROUTE_CLOSED) {
    return `該当信号のステータスが未開通ではありません: ${signal.stationStatus}`;
  }
  for (const enterSignal of signal.nextEnterSignal) {
    const stationStatus = enterSignal.nextSignal.stationStatus;
    if (stationStatus !== StationStatus.ROUTE_CLOSED && stationStatus !== StationStatus.ROUTE_ENTERED) {
      return `${enterSignal.nextSignalName}のステータスが未開通または進入完了ではありません: ${stationStatus}`;
    }
  }
  // 進路開通
  await prisma.signal.update({
    data: {stationStatus: StationStatus.ROUTE_OPENED},
    where: {name: signalName}
  })
  return '';
}

const upperSignalPhase = (phase: SignalPhase, signalType: SignalType) => {
  let phases: SignalPhase[];
  if (signalType === 'TWO_A') {
    phases = ['R', 'Y']
  } else if (signalType === 'TWO_B') {
    phases = ['R', 'G']
  } else if (signalType === 'THREE_A') {
    phases = ['R', 'YY', 'Y']
  } else if (signalType === 'THREE_B') {
    phases = ['R', 'Y', 'G']
  } else if (signalType === 'FOUR_A') {
    phases = ['R', 'YY', 'Y', 'G']
  } else if (signalType === 'FOUR_B') {
    phases = ['R', 'Y', 'YG', 'G']
  } else if (signalType === 'FIVE') {
    phases = ['R', 'YY', 'Y', 'YG', 'G']
  } else {
    return 'R'
  }
  const upperIndex = phases.indexOf(phase) + 1;
  return phases[Math.min(upperIndex, phases.length - 1)];
}

io.on('connection', (socket) => {
  socket.on('getRoute', async (diaName) => {
    // Todo: 列車番号を受け取り、その列車の経路を返す
    // Todo: 信号の種類を返す
  });
  socket.on('enterClosure', async ({diaName, signalName}) => {
    await prisma.signal.updateMany({
      where: {name: signalName},
      data: {diaName: diaName, stationStatus: StationStatus.ROUTE_ENTERING}
    });
  });
  socket.on('leaveClosure', async ({diaName, signalName}) => {
    await prisma.signal.updateMany({
      where: {name: signalName, diaName: diaName},
      data: {diaName: null, stationStatus: StationStatus.ROUTE_CLOSED}
    });
  });
  socket.on('enteringComplete', async ({diaName, signalName}) => {
    await prisma.signal.updateMany({
      where: {name: signalName, diaName: diaName},
      data: {stationStatus: StationStatus.ROUTE_ENTERED}
    });
  });
  socket.on('routeOpen', async (signalName) => {
    await openSignal(signalName);
  });
  socket.on('elapse', async ({diaName, signalName}) => {
    const signalPhase = await calcSignalPhase(signalName, diaName);
    if (signalPhase === null) {
      return;
    }
    socket.emit('elapsed', {signalName, signalPhase});
  });
});


instrument(io, {
  auth: false,
  mode: 'development',
});

httpServer.listen(3000);