import {createServer} from 'http';
import {Server} from 'socket.io';
import {ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData, StopLimitation} from './types';
import {PrismaClient} from '@prisma/client';
import {instrument} from '@socket.io/admin-ui';

const httpServer = createServer();
const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(httpServer, {});
const prisma = new PrismaClient();

const calcStopLimitation = async (closureName: string, diaName: string): Promise<StopLimitation | null> => {
  // Todo: 大道寺や館浜の終端駅の処理に対応する
  // Todo: 上り下り判断処理を追加する
  const nextClosureLength = 6;
  const stopLimitationMargin = 50;
  const currentClosure = await prisma.closure.findUnique({
    where: {name: closureName},
  });
  if (currentClosure === null) {
    return null;
  }
  // 同じ閉塞に2列車いる場合はおかしいので、即刻停止の意味を込めて0を返す
  if (currentClosure.diaName !== null && currentClosure.diaName !== diaName) {
    return {closureName: currentClosure.name, stopLimit: 0};
  }
  // nextClosureLength分の閉塞を取得
  const nextClosures = await prisma.closure.findMany({
    where: {
      direction: 1,
      order: {gte: currentClosure.order + 1, lte: currentClosure.order + nextClosureLength}
    },
    orderBy: {order: 'asc'}
  });
  // 次の閉塞の中で、最初に在線している閉塞を取得
  let nextTrainClosureIndex = nextClosures
      .findIndex(closure => closure.diaName !== null && closure.diaName !== diaName);
  if (nextTrainClosureIndex === -1) {
    nextTrainClosureIndex = nextClosures.length;
  }
  const stopLimitation = nextClosures
      .slice(0, nextTrainClosureIndex)
      .reduce((acum, value) => acum + value.distance, 0) - stopLimitationMargin + currentClosure.distance;
  return {stopLimit: Math.max(stopLimitation, 0), closureName: currentClosure.name};
}

const normalizeClosureName = (closureName: string): string => {
  if (closureName.includes('場内')) {
    const c = closureName[closureName.length - 1];
    if (c === 'A' || c === 'B') {
      return closureName.substring(0, closureName.length - 1);
    }
  }
  return closureName
};

io.on('connection', (socket) => {
  socket.on('enterClosure', async ({diaName, closureName}) => {
    const name = normalizeClosureName(closureName);
    await prisma.closure.updateMany({
      where: {name: name},
      data: {diaName: diaName}
    });
  });
  socket.on('leaveClosure', async ({diaName, closureName}) => {
    const name = normalizeClosureName(closureName);
    await prisma.closure.updateMany({
      where: {name: name, diaName: diaName},
      data: {diaName: null}
    });
  });
  socket.on('disableMainLineProtection', async ({diaName}) => {
    await prisma.closure.updateMany({
      where: {diaName: diaName},
      data: {diaName: null}
    });
  });
  socket.on('elapse', async ({closureName, diaName}) => {
    const stopLimitation = await calcStopLimitation(normalizeClosureName(closureName), diaName);
    if (stopLimitation === null) {
      return;
    }
    socket.emit('updateStopLimit', stopLimitation);
  });
});


instrument(io, {
  auth: false,
  mode: 'development',
});

httpServer.listen(3000);