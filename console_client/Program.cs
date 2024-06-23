using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using TrainCrew;

namespace console_client;
public class TrainData 
{
    public string DiaName { get; set; } = "";
    public string CurrentBlock { get; set; } = "";
    public float CurrentBlockDistance { get; set; }
    public string NextBlock { get; set; } = "";
    public string NextBlockPhase { get; set; } = "";
}
class Program
{
    const string UNKNOWN = "不明";

    static async Task Main(string[] args)
    {
        // 起動時初期化 
        TrainCrewInput.Init();
        Uri uri = new("ws://localhost:3030/train");
        using ClientWebSocket ws = new();
        await ws.ConnectAsync(uri, default);        
         
        // ダイヤロード後初期化
        var previousTotalLength = 0f;
        var currentBlock = "";  // 信号通過後 = 現在の閉塞
        var currentBlockDistance = 0f;
        var nextBlock = UNKNOWN;
        TrainCrewInput.RequestData(DataRequest.Signal);
        TrainCrewInput.RequestStaData();
        try
        {
            while (true)
            {
                var nextSignalPhase = "R";
                var timer = Task.Delay(100);
                var state = TrainCrewInput.GetTrainState();
                currentBlockDistance += state.TotalLength - previousTotalLength;
                var sIndex = TrainCrewInput.signals.FindIndex(signal => signal.name == nextBlock);
                if (sIndex == -1)
                {
                    // 信号通過後
                    // 通過直後
                    if (currentBlock != nextBlock && nextBlock != UNKNOWN)
                    {
                        currentBlock = nextBlock;
                        currentBlockDistance = 0f;
                    }
                    // 次の閉塞情報があれば更新する
                    if (TrainCrewInput.signals.Count > 0)
                    {
                        // Todo: 進路に合わせて次の信号を選択する
                        sIndex = 0;
                    }
                    else
                    {
                        nextBlock = UNKNOWN;
                    }
                }
                // 次の信号があれば次の閉塞を取得する
                if (sIndex >= 0)
                {
                    var nextSignal = TrainCrewInput.signals[sIndex];
                    nextBlock = nextSignal.name;
                    nextSignalPhase = nextSignal.phase;
                }
                var trainData = new TrainData
                {
                    DiaName = state.diaName,
                    CurrentBlock = currentBlock,
                    CurrentBlockDistance = currentBlockDistance,
                    NextBlock = nextBlock,
                    NextBlockPhase = nextSignalPhase
                };
                var body = JsonSerializer.SerializeToUtf8Bytes(trainData);
                await ws.SendAsync(new ArraySegment<byte>(body), WebSocketMessageType.Text, true, default);
                
                previousTotalLength = state.TotalLength;
                await timer;
            }
        }
        finally
        {
            TrainCrewInput.Dispose();
        }
    }
}