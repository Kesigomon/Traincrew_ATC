import {createServer} from 'http';
import {Server} from 'socket.io';
import {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
  SignalPhase, SignalPhaseList, TrackCircuitInfo, SignalPhaseExtra
} from './types';
import {NextSignal, PrismaClient, Signal, SignalType, StationStatus} from '@prisma/client';
import * as fs from 'node:fs';

process.on('unhandledRejection', (e) => {
  console.trace(e)
});

const httpServer = createServer();
const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(httpServer, {});
const prisma = new PrismaClient();


const calcSignalPhase = async (signalName: string, diaName: string): Promise<[SignalPhaseExtra, SignalType] | null> => {
  const nextClosureLength = 6;

  const targetSignal = await prisma.signal.findUnique({
    where: {name: signalName}
  });
  if (targetSignal === null) {
    return null
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
  const signals = new Map(signalsArray.map(signal => [signal.name, signal]));
  let signalPhase: SignalPhaseExtra = calcOneSignalPhase(signalName, diaName, signals);
  if (targetSignal.name.includes('入換') && signalPhase === 'G') {
    signalPhase = 'SwitchG'
  }
  return [signalPhase, targetSignal.type];
}

const calcAllSignalPhase = async () => {
  const signalsArray = await prisma.signal.findMany({
    orderBy: [{direction: 'asc'}, {order: 'asc'}],
    include: {
      nextSignal: true
    }
  });
  const signals = new Map(signalsArray.map(signal => [signal.name, signal]));
  const cache = new Map<string, SignalPhase>();
  return signalsArray.map(signal => {
    const signalPhase = calcOneSignalPhase(signal.name, 'hoge', signals, cache);
    return {
      signalName: signal.name,
      signalPhase,
      signalType: signal.type,
      diaName: signal.diaName
    }
  });
}

const calcOneSignalPhase = (
    signalName: string,
    diaName: string,
    signals: Map<string, Signal & { nextSignal: NextSignal[] }>,
    cache: Map<string, SignalPhase> = new Map<string, SignalPhase>()
): SignalPhase => {
  const R: SignalPhase = 'R';
  const cachedValue = cache.get(signalName);
  if (cachedValue) {
    return cachedValue;
  }
  const targetSignal = signals.get(signalName);
  if (
      // 信号情報がない(つまり、再起しきった)
      targetSignal === undefined
      // 自分以外の在線がいる場合
      || targetSignal.diaName !== null && targetSignal.diaName !== diaName
      // 場内、出発、入換信号機の場合に、進路が開通していない場合
      || (!targetSignal.isClosure && !calcStationSignal(targetSignal, diaName))
  ) {
    cache.set(signalName, R);
    return 'R'
  }
  // 再帰的に次の信号の現示を計算
  const nextSignalMaxPhase = targetSignal.nextSignal.reduce<SignalPhase>((acc, next) => {
    const nextSignalPhase = calcOneSignalPhase(next.nextSignalName, diaName, signals, cache);
    cache.set(next.nextSignalName, nextSignalPhase);
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

const closeSignal = async (signalName: string): Promise<string> => {
  const signal = await prisma.signal.findUnique({
    where: {name: signalName},
  });
  if (signal === null) {
    return '信号情報が見つかりませんでした';
  }
  // 閉鎖できないステータスの場合閉鎖しない
  if (signal.stationStatus !== StationStatus.ROUTE_OPENED) {
    return `該当信号のステータスが開通済みではありません: ${signal.stationStatus}`;
  }
  // 進路閉鎖
  await prisma.signal.update({
    data: {stationStatus: StationStatus.ROUTE_CLOSED},
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

const convertSignalType = (signalType: SignalType) => {
  if (signalType === 'ONE') {
    return ''
  }
  if (signalType === 'TWO_A') {
    return 'MAIN_2Y'
  }
  if (signalType === 'TWO_B') {
    return 'Switch_2'
  }
  if (signalType === 'THREE_A') {
    return 'Main_4yyng'
  }
  if (signalType === 'THREE_B') {
    return 'Main_3nb'
  }
  if (signalType === 'FOUR_A') {
    return 'Main_4yy'
  }
  if (signalType === 'FOUR_B') {
    return 'Main_4yg'
  }
  if (signalType === 'FIVE') {
    return 'Main_5'
  }
}

const getRoute = async (diaName: string) => {
  // 正しい列車番号か確認(なんでもOKにすると任意パス取れるのでその対策)
  const pattern = /^[回臨]?\d{3,4}[A-Z]?$/
  if (!pattern.test(diaName)) {
    return '列車番号が不正です';
  }
  const content = await fs.promises.readFile(`${__dirname}/../routes/${diaName}.csv`, 'utf-8');
  const routes = content.split('\n')
      .slice(1)
      .map(row => {
        const cells = row.split(',');
        const result: TrackCircuitInfo = {
          name: cells[1],
          startMeter: parseFloat(cells[2]),
          endMeter: parseFloat(cells[3]),
        }
        return result;
      });
  const names = routes.map(route => route.name);
  const singals = await prisma.signal.findMany({
    where: {name: {in: names}},
    select: {name: true, type: true}
  });
  const signalMap = new Map(singals.map(signal => [signal.name, signal.type]));
  for (const route of routes) {
    const signalType = signalMap.get(route.name);
    if (signalType !== undefined) {
      route.signalType = convertSignalType(signalType);
    }
  }
  return routes;
}

io.on('connection', (socket) => {
  console.log(`ip: ${socket.handshake.address} connected`);
  socket.on('getRoute', async (diaName) => {
    const result = await getRoute(diaName);
    if (typeof result === 'string') {
      console.error(result);
      return;
    }
    socket.emit('getRouteResult', result);
  });
  socket.on('enterSignal', async ({diaName, signalName}) => {
    await prisma.signal.updateMany({
      where: {name: signalName},
      data: {diaName: diaName, stationStatus: StationStatus.ROUTE_ENTERING}
    });
  });
  socket.on('leaveSignal', async ({diaName, signalName}) => {
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
    const result = await openSignal(signalName);
    socket.emit('routeOpenResult', result);
  });
  socket.on('routeClose', async (signalName) => {
    const result = await closeSignal(signalName);
    socket.emit('routeCloseResult', result);
  });
  socket.on('getAllSignal', async () => {
    const result = (await calcAllSignalPhase())
        .map(r => ({
          ...r,
          signalType: convertSignalType(r.signalType) ?? ''
        }));
    socket.emit('getAllSignalResult', result);
  });
  socket.on('elapse', async ({diaName, signalName}) => {
    const result = await calcSignalPhase(signalName, diaName);
    const [signalPhase, signalType] = result ?? ['N', ''];
    let signalTypeStr = '';
    if (signalType !== '') {
      signalTypeStr = convertSignalType(signalType) ?? '';
    }
    socket.emit('elapsed', {signalName, signalType: signalTypeStr, signalPhase});
  });
});


httpServer.listen(3000);