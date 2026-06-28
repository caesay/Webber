using System.Security.Cryptography;
using System.Xml.Linq;
using RT.Util;
using RT.Util.ExtensionMethods;
using Webber.Client.Models;

namespace Webber.Server.Blocks;

class RemilkBlockConfig
{
    public string ApiKey { get; set; }
    public string ApiSecret { get; set; }
    public string ApiFrob { get; set; }
    public string ApiToken { get; set; }
    public string ListId { get; set; }
    public string Filter { get; set; }
}

public record RemilkBlockDto : BaseDto
{
    public RemilkTask[] Tasks { get; set; }
}

public record RemilkTask
{
    public string Id { get; set; }
    public DateOnly? DueDate { get; set; }
    public DateTime? DueUtc { get; set; }
    public int Priority { get; set; }
    public string Description { get; set; }
    public string[] Tags { get; set; }

    public RemilkTask(XElement series)
    {
        Id = series.Attribute("id").Value;
        Description = series.Attribute("name").Value;
        Tags = series.Element("tags").Elements("tag").Select(e => e.Value).ToArray();
        var oldest = series.Elements("task").OrderBy(e => e.Attribute("due").Value).First();
        var priority = oldest.Attribute("priority").Value;
        Priority = priority switch { "1" => 1, "2" => 2, "3" => 3, "N" => 4, _ => throw new Exception("unknown priority") };
        // task with only a due date has eg due="2026-06-01T23:00:00Z"
        if (oldest.Attribute("due").Value != "")
        {
            var due = DateTime.Parse(oldest.Attribute("due").Value).ToUniversalTime();
            if (oldest.Attribute("has_due_time").Value != "1")
                DueDate = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(due, TimeZoneInfo.FindSystemTimeZoneById("GMT Standard Time")));
            else
                DueUtc = due;
        }
    }
}

class RemilkBlockServer : SimpleBlockServerBase<RemilkBlockDto>
{
    private RemilkBlockConfig _config;

    public override Type ConfigType => typeof(RemilkBlockConfig);
    public override void UpdateConfig(object newConfig) => _config = (RemilkBlockConfig)newConfig;

    public RemilkBlockServer(IServiceProvider sp, RemilkBlockConfig config)
        : base(sp, TimeSpan.FromSeconds(60))
    {
        _config = config;
    }

    private HttpClient _httpClient = new();

    protected override bool ShouldTick() => true;

    protected override RemilkBlockDto Tick()
    {
        var url = rtmUrl("https://api.rememberthemilk.com/services/rest/", ("method", "rtm.tasks.getList"), ("api_key", _config.ApiKey), ("auth_token", _config.ApiToken), ("list_id", _config.ListId), ("filter", _config.Filter));
        var str = _httpClient.GetStringAsync(url).GetAwaiter().GetResult();
        var xml = XDocument.Parse(str);
        var elements = xml.Element("rsp").Element("tasks").Element("list").Elements("taskseries").ToList();
        var tasks = elements.Select(e => new RemilkTask(e)).ToArray();
        return new RemilkBlockDto { Tasks = tasks, ValidUntilUtc = DateTime.UtcNow.AddMinutes(3) };

        //callRtm("https://api.rememberthemilk.com/services/auth/", ("api_key", _apiKey), ("perms", "read"));
        //callRtm("https://api.rememberthemilk.com/services/rest/", ("method", "rtm.auth.getToken"), ("api_key", _apiKey), ("frob", _apiFrob));
        //callRtm("https://api.rememberthemilk.com/services/rest/", ("method", "rtm.tasks.getList"), ("api_key", _apiKey), ("auth_token", _apiToken));
        //callRtm("https://api.rememberthemilk.com/services/rest/", ("method", "rtm.lists.getList"), ("api_key", _apiKey), ("auth_token", _apiToken));
        //callRtm("https://api.rememberthemilk.com/services/rest/", ("method", "rtm.tasks.getList"), ("api_key", _apiKey), ("auth_token", _apiToken), ("list_id", "FIXME"), ("filter", "status:incomplete not tag:should not tag:could not tag:goal not tag:notes"));
        //callRtm("https://api.rememberthemilk.com/services/rest/", ("method", "rtm.tasks.getList"), ("api_key", _apiKey), ("auth_token", _apiToken), ("list_id", "FIXME"), ("filter", "status:incomplete"));
    }

    private string rtmUrl(string url, params (string, string)[] args)
    {
        args = args.OrderBy(a => a.Item1).ToArray();
        var combined = args.Select(a => $"{a.Item1}{a.Item2.HtmlEscape()}").JoinString();
        combined = _config.ApiSecret + combined;
        var sig = MD5.Create().ComputeHash(combined.ToUtf8()).ToHex();
        return url + "?" + (args.Select(a => $"&{a.Item1}={a.Item2.HtmlEscape()}").JoinString() + $"&api_sig={sig}").TrimStart('&');
    }
}
