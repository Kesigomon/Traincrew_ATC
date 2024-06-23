using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Google.Apis.Auth.OAuth2;
using Google.Apis.Services;
using Google.Apis.Sheets.v4;
using Google.Apis.Sheets.v4.Data;
using Microsoft.AspNetCore.Mvc;

namespace Server2.Controllers;

public class TrainData
{
    public string DiaName { get; set; } = "";
    public string CurrentBlock { get; set; } = "";
    public float CurrentBlockDistance { get; set; }
    public string NextBlock { get; set; } = "";
    public string NextBlockPhase { get; set; } = "";
}

public partial class WebSocketController : ControllerBase
{
    private SheetsService sheetsService;

    public WebSocketController()
    {
        const string path = "session.json";
        var fileStream = new FileStream(path, FileMode.Open, FileAccess.Read);
        var credential = GoogleCredential.FromStream(fileStream).CreateScoped(SheetsService.Scope.Spreadsheets);
        // 上記の認証情報を使って、スプレッドシートにアクセスするためのサービスを作成
        sheetsService = new SheetsService(new BaseClientService.Initializer { HttpClientInitializer = credential });
    }

    [Route("/train")]
    public async Task Get()
    {
        if (!HttpContext.WebSockets.IsWebSocketRequest)
        {
            HttpContext.Response.StatusCode = StatusCodes.Status400BadRequest;
            return;
        }

        using var webSocket = await HttpContext.WebSockets.AcceptWebSocketAsync();
        while (webSocket.State == WebSocketState.Open)
        {
            await ProcessRequest(webSocket);
        }

        await webSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Closing", default);
    }

    private async Task ProcessRequest(WebSocket webSocket)
    {
        var buffer = new byte[1024];
        var result = await webSocket.ReceiveAsync(buffer, default);
        var request = Encoding.UTF8.GetString(buffer, 0, result.Count);
        var trainData = JsonSerializer.Deserialize<TrainData>(request);
        /*
        var trainData = new TrainData
        {
            DiaName = "770",
            CurrentBlock = "館浜上り出発5A",
            CurrentBlockDistance = 0,
            NextBlock = "上り閉塞6",
            NextBlockPhase = "G"
        };
        */
        var response = await ProcessTrainData(trainData);
        // var response = "G";
        await webSocket.SendAsync(Encoding.UTF8.GetBytes(response), WebSocketMessageType.Text, true, default);
    }

    private async Task<string> ProcessTrainData(TrainData? trainData)
    {
        const string sheetId = "1VVlFMBwA_WyQ7Zl4FLnIcprnPKjFj8GLEIIvsWK3zDQ";
        const string sheetName = "信号連動盤(早見表)";
        if (trainData == null || trainData.CurrentBlock == "")
        {
            return "";
        }

        //　対象となるセルを取得
        // Todo: 上り下りでセルが違うので、上り下りを判定してセルを取得する
        var values = await sheetsService.Spreadsheets.Values.Get(sheetId, $"{sheetName}!C1:E73").ExecuteAsync();
        var index = -1;

        if (trainData.CurrentBlock != "")
        {
            // シート上の信号名に変換
            var signalName = parseSignalName(trainData.CurrentBlock);

            // 現在閉塞と一致する行を探す
            for (index = 0; index < values.Values.Count; index++)
            {
                if (values.Values[index].All(value => value.ToString() != signalName)) continue;
                break;
            }

            if (index == values.Values.Count)
            {
                index = -1;
            }
            else
            {
                // 現在閉塞のセルを見て、在線になってなければ在線にする
                // ただし、停車場 かつ 本線にいない場合、出発信号機に応じて在線にするかどうか決定する
                // 出発信号機が停止現示の場合は在線にしない、それ以外は在線にする
                var request = sheetsService.Spreadsheets.Values.Update(
                    new ValueRange { Values = new List<IList<object>> { new List<object> { trainData.DiaName } } },
                    sheetId,
                    $"{sheetName}!E{index + 2}");
                request.ValueInputOption = SpreadsheetsResource.ValuesResource.UpdateRequest.ValueInputOptionEnum.RAW;
                await request.ExecuteAsync();
                // Todo: 現在閉塞の1つ手前のセルを見て、通過してなければ在線に、通過していれば在線を解除する
                if (index >= 2
                    && values.Values[index - 1].Any(v => v.ToString() == trainData.DiaName)
                    && trainData.CurrentBlockDistance >= 140
                   )
                {
                    request = sheetsService.Spreadsheets.Values.Update(
                        new ValueRange
                            { Values = new List<IList<object>> { new List<object>() } },
                        sheetId,
                        $"{sheetName}!E{index}");
                    request.ValueInputOption =
                        SpreadsheetsResource.ValuesResource.UpdateRequest.ValueInputOptionEnum.RAW;
                    await request.ExecuteAsync();
                }
            }
        }

        // 次閉塞の信号のセルを見て、その信号の値を返す
        // 現在閉塞が分かる場合は、次の閉塞の信号を返す
        if (index >= 0)
        {
            index += 2;
        }
        // 現在閉塞が分からない場合は、次の閉塞の信号を探す
        else if (trainData.NextBlock != "")
        {
            var signalName = parseSignalName(trainData.NextBlock);
            for (index = 0; index < values.Values.Count; index++)
            {
                if (values.Values[index].All(value => value.ToString() != signalName)) continue;
                break;
            }
        }
        // それでも分からなければとりあえず停止信号を送っておく
        else
        {
            return "R";
        }

        values = await sheetsService.Spreadsheets.Values.Get(sheetId, $"{sheetName}!D{index + 1}").ExecuteAsync();
        return values.Values[0][0].ToString() ?? "R";
    }

    private static string parseSignalName(string rawSignalName)
    {
        if (rawSignalName.Contains("場内"))
        {
            // 後ろの英字をすべて消す
            return Alphabetic().Replace(rawSignalName, "");
        }

        if (rawSignalName.Contains("出発"))
        {
            // 後ろの英数字をすべて消す
            return AlphaNumeric().Replace(rawSignalName, "");
        }

        return rawSignalName;
    }

    [GeneratedRegex("[a-zA-Z]")]
    private static partial Regex Alphabetic();

    [GeneratedRegex("[a-zA-Z0-9]+$")]
    private static partial Regex AlphaNumeric();
}