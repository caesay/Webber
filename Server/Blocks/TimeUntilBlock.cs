using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using Google.Apis.Auth.OAuth2;
using Google.Apis.Calendar.v3;
using Google.Apis.Calendar.v3.Data;
using Google.Apis.Services;
using Google.Apis.Util.Store;
using TimeZoneConverter;
using Webber.Client.Models;

namespace Webber.Server.Blocks;

class TimeUntilSpecialEvent
{
    public DateTime Date { get; set; }

    public string Title { get; set; }

    public int LeadDays { get; set; }
}

class CalendarKeyConfig
{
    public string Id { get; set; }
    public string Color { get; set; }
}

class TimeUntilBlockConfig
{
    /// <summary> The number of regular events to send to the client in each update. </summary>
    public int NumberOfEvents { get; set; } = 3;

    /// <summary> The number of all-day events to send to the client in each update. </summary>
    public int NumberOfAllDayEvents { get; set; } = 3;

    /// <summary> Optionally add a sleep timer to the list of events. </summary>
    public double? SleepTime { get; set; }

    /// <summary> Default color dot for events from calendars without a color set, and for synthetic events (sleep, special). </summary>
    public string DefaultColor { get; set; }

    /// <summary> An array of calendars to read from, as long as the authorized user has permission to access them. </summary>
    public CalendarKeyConfig[] CalendarKeys { get; set; }

    /// <summary> Directory to save Google Authorization tokens to.</summary>
    public string AuthStoreDirectory { get; set; } = ".\\TimeUntilToken";

    /// <summary> This is optional, if you wish to create your own App via Google Console - otherwise it will use mine (hard coded). </summary>
    public string AppCredentialsPath { get; set; }

    /// <summary> A list of special / annual events. These will be shown each year with a counting number (eg. 10th anniversary). </summary>
    public TimeUntilSpecialEvent[] SpecialAnnualEvents { get; set; } = new TimeUntilSpecialEvent[0];

    /// <summary> The number of days in advance special events should appear on your calendar. </summary>
    public int SpecialAnnualDefaultLeadTimeDays { get; set; } = 14;

    /// <summary> A list of regex patterns. Events whose summary matches any pattern will be excluded. </summary>
    public string[] ExcludeEventPatterns { get; set; } = Array.Empty<string>();
}

internal class TimeUntilBlockServer : SimpleBlockServerBase<TimeUntilBlockDto>
{
    private static readonly string[] Scopes = { CalendarService.Scope.CalendarReadonly };
    private static readonly string ApplicationName = "TimeUntilBlockServer";
    private static readonly string DefaultCredentialsJson = "{\"installed\":{\"client_id\":\"130261896764-m7jl26tiob0gdrjqrmgjm0fcqqg0nkh2.apps.googleusercontent.com\",\"project_id\":\"titanium-cacao-318415\",\"auth_uri\":\"https://accounts.google.com/o/oauth2/auth\",\"token_uri\":\"https://oauth2.googleapis.com/token\",\"auth_provider_x509_cert_url\":\"https://www.googleapis.com/oauth2/v1/certs\",\"client_secret\":\"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\",\"redirect_uris\":[\"urn:ietf:wg:oauth:2.0:oob\",\"http://localhost\"]}}";

    private TimeUntilBlockConfig _config;
    private readonly ILogger<TimeUntilBlockServer> _log;
    private Lazy<Regex[]> _excludePatterns;
    private CalendarService _svc;
    private bool _hasInitialized;

    public override Type ConfigType => typeof(TimeUntilBlockConfig);
    public override void UpdateConfig(object newConfig)
    {
        _config = (TimeUntilBlockConfig)newConfig;
        _excludePatterns = new Lazy<Regex[]>(() =>
            _config.ExcludeEventPatterns
                .Select(p => new Regex(p, RegexOptions.IgnoreCase | RegexOptions.Compiled))
                .ToArray());
    }

    public TimeUntilBlockServer(IServiceProvider sp, ILogger<TimeUntilBlockServer> log, TimeUntilBlockConfig config)
        : base(sp, TimeSpan.FromMinutes(1))
    {
        this._config = config;
        this._log = log;
        this._excludePatterns = new Lazy<Regex[]>(() =>
            config.ExcludeEventPatterns
                .Select(p => new Regex(p, RegexOptions.IgnoreCase | RegexOptions.Compiled))
                .ToArray());
    }

    private async Task<UserCredential> DoGoogleAuth()
    {
        using Stream stream = string.IsNullOrWhiteSpace(_config.AppCredentialsPath)
            ? new MemoryStream(Encoding.UTF8.GetBytes(DefaultCredentialsJson))
            : File.OpenRead(_config.AppCredentialsPath);

        using var cts = new CancellationTokenSource();
        cts.CancelAfter(TimeSpan.FromMinutes(5));

        _log.LogDebug("AuthorizeAsync starting");
        var credential = await GoogleWebAuthorizationBroker.AuthorizeAsync(
            GoogleClientSecrets.FromStream(stream).Secrets,
            Scopes,
            "user",
            cts.Token,
            new FileDataStore(Path.GetFullPath(_config.AuthStoreDirectory), true)
        );
        _log.LogDebug("AuthorizeAsync completed.");

        return credential;
    }

    public override void Start(CancellationToken cancellationToken = default)
    {
        if (_hasInitialized)
        {
            base.Start(cancellationToken);
            return;
        }

        _hasInitialized = true;
        DoGoogleAuth().ContinueWith(t =>
        {
            if (t.IsFaulted)
            {
                _log.LogError(t.Exception?.InnerExceptions?.FirstOrDefault()?.Message ?? t.Exception?.Message);
                return;
            }

            _svc = new CalendarService(new BaseClientService.Initializer()
            {
                HttpClientInitializer = t.Result,
                ApplicationName = ApplicationName,
            });

            // the Tick loop will not be started unless authorization is completed
            _log.LogDebug("GoogleAuth completed.");
            base.Start(cancellationToken);
        });
    }

    private List<(Event Event, string Color)> FetchEvents(int desiredRegularCount, int desiredAllDayCount)
    {
        var allEvents = new List<(Event Event, string Color)>();
        int windowSize = 30;
        int currentOffset = 0;
        int maxDaysAhead = 365;

        var calConfigs = _config.CalendarKeys
            .GroupBy(c => c.Id)
            .Select(g => g.First())
            .ToList();

        while (currentOffset < maxDaysAhead)
        {
            foreach (var c in calConfigs)
            {
                EventsResource.ListRequest request = _svc.Events.List(c.Id);
                request.TimeMinDateTimeOffset = DateTimeOffset.Now.AddDays(currentOffset);
                request.TimeMaxDateTimeOffset = DateTimeOffset.Now.AddDays(currentOffset + windowSize);
                request.ShowDeleted = false;
                request.SingleEvents = true;
                request.MaxResults = (desiredRegularCount + desiredAllDayCount) * 3;
                request.OrderBy = EventsResource.ListRequest.OrderByEnum.StartTime;

                var items = request.Execute().Items;
                foreach (var item in items)
                    allEvents.Add((item, c.Color));
            }

            int regularCount = allEvents.Count(e => e.Event.Start?.DateTimeDateTimeOffset != null);
            int allDayCount = allEvents.Count(e => e.Event.Start?.DateTimeDateTimeOffset == null);

            if (regularCount >= desiredRegularCount && allDayCount >= desiredAllDayCount)
                break;

            currentOffset += windowSize;
        }

        _log.LogDebug($"Fetched {allEvents.Count} events.");
        return allEvents;
    }

    protected override TimeUntilBlockDto Tick()
    {
        // Helper functions
        bool checkSelfRsvpNotDeclined(Event i)
        {
            if (i == null || i.Attendees == null) return true;
            var me = i.Attendees.FirstOrDefault(a => a.Self == true);
            if (me == null) return true;
            return me.ResponseStatus != "declined";
        }

        string getNumberWithOrdinal(int n)
        {
            var s = new[] { "th", "st", "nd", "rd" };
            var v = n % 100;
            var i = (v - 20) % 10;
            if (i is < 0 or > 3) i = v;
            if (i is < 0 or > 3) i = 0;
            return n + s[i];
        }

        // Fetch all events
        var events = FetchEvents(_config.NumberOfEvents, _config.NumberOfAllDayEvents);

        // Process all events with a single LINQ query
        var allCandidates = events
            .Where(i => i.Event.EventType == "default")
            .Where(i => checkSelfRsvpNotDeclined(i.Event))
            .Where(i => !string.IsNullOrWhiteSpace(i.Event.Summary))
            .DistinctBy(i => i.Event.RecurringEventId ?? i.Event.Id)
            .Select(i => new CalendarEvent()
            {
                Id = i.Event.Id,
                DisplayName = i.Event.Summary,
                StartTimeUtc = i.Event.Start?.DateTimeDateTimeOffset?.UtcDateTime
                    ?? DateTime.ParseExact(i.Event.Start.Date, "yyyy-MM-dd", CultureInfo.CurrentCulture.DateTimeFormat),
                EndTimeUtc = i.Event.End?.DateTimeDateTimeOffset?.UtcDateTime
                    ?? DateTime.ParseExact(i.Event.End.Date, "yyyy-MM-dd", CultureInfo.CurrentCulture.DateTimeFormat),
                IsRecurring = i.Event.RecurringEventId != null,
                IsAllDay = i.Event.Start?.DateTimeDateTimeOffset == null,
                Color = i.Color ?? _config.DefaultColor,
            })
            .OrderBy(i => i.StartTimeUtc)
            .Distinct()
            .ToList();

        // Filter out events matching exclude patterns
        if (_excludePatterns.Value.Length > 0)
            allCandidates.RemoveAll(e => _excludePatterns.Value.Any(r => r.IsMatch(e.DisplayName)));

        // Add sleep synthetic event
        if (_config.SleepTime.HasValue)
        {
            var offset = TZConvert.GetTimeZoneInfo(AppConfig.LocalTimezoneName).GetUtcOffset(DateTimeOffset.UtcNow);
            var sleepTimeStart = DateTime.UtcNow
                .Add(offset).Date.Subtract(offset)
                .AddHours(_config.SleepTime.Value);

            allCandidates.Add(new CalendarEvent()
            {
                Id = "{sleep}",
                DisplayName = "Sleep!",
                StartTimeUtc = sleepTimeStart,
                IsAllDay = false,
                Color = _config.DefaultColor,
            });
        }

        // Add special annual events
        for (int i = 0; i < _config.SpecialAnnualEvents.Length; i++)
        {
            TimeUntilSpecialEvent v = _config.SpecialAnnualEvents[i];
            var nowDate = DateTime.UtcNow;
            nowDate = new DateTime(nowDate.Year, nowDate.Month, nowDate.Day, 0, 0, 0, 0, DateTimeKind.Utc);

            var evtDate = v.Date.Date;
            evtDate = new DateTime(evtDate.Year, evtDate.Month, evtDate.Day, 0, 0, 0, 0, DateTimeKind.Utc);

            var nextDate = new DateTime(nowDate.Year, evtDate.Month, evtDate.Day, 0, 0, 0, 0, DateTimeKind.Utc);
            if (nextDate < nowDate)
                nextDate = nextDate.AddYears(1);

            var timeUntil = nextDate - nowDate;
            if (timeUntil.TotalDays < _config.SpecialAnnualDefaultLeadTimeDays)
            {
                var years = (int)Math.Round((nextDate - evtDate).TotalDays / 365);
                var ordinalYears = getNumberWithOrdinal(years);
                var eventName = ordinalYears + " " + v.Title;
                if (v.Title.EndsWith("Birthday", StringComparison.OrdinalIgnoreCase))
                {
                    var idx = v.Title.IndexOf("Birthday", StringComparison.OrdinalIgnoreCase);
                    eventName = v.Title.Substring(0, idx) + ordinalYears + " " + v.Title.Substring(idx);
                }

                allCandidates.Add(new CalendarEvent { Id = "{special_" + i + "}", DisplayName = eventName, StartTimeUtc = nextDate, IsAllDay = true, SpecialEvent = true, Color = _config.DefaultColor });
            }
        }

        // Re-sort after adding synthetic events
        allCandidates = allCandidates.OrderBy(i => i.StartTimeUtc).ToList();

        // Separate into regular and all-day events
        var regularCandidates = allCandidates.Where(e => !e.IsAllDay).ToList();
        var allDayCandidates = allCandidates.Where(e => e.IsAllDay).ToList();

        // Consolidate bin collection events in all-day list
        var alldaygroup = allDayCandidates.GroupBy(d => d.StartTimeUtc);
        foreach (var c in alldaygroup)
        {
            var binsearch = "Bin Collection";
            var bindays = c.Where(v => v.DisplayName.EndsWith(binsearch)).ToArray();
            if (bindays.Length > 1)
            {
                foreach (var bv in bindays)
                    allDayCandidates.Remove(bv);

                var name = string.Join(" & ", bindays.Select(v => v.DisplayName.Substring(0, v.DisplayName.Length - binsearch.Length)));
                var binevent = new CalendarEvent { DisplayName = name + " Collection", IsAllDay = true, StartTimeUtc = bindays[0].StartTimeUtc, Color = bindays[0].Color ?? _config.DefaultColor };
                allDayCandidates.Add(binevent);
            }
        }
        allDayCandidates = allDayCandidates.OrderBy(i => i.StartTimeUtc).ToList();

        // Calculate HasStarted and IsNextUp for regular events
        DateTime time = DateTime.UtcNow;
        foreach (var c in regularCandidates.Where(e => !e.SpecialEvent))
        {
            if (c.StartTimeUtc.AddMinutes(5) < time)
            {
                c.HasStarted = true;
                continue;
            }

            if (c.StartTimeUtc.Date == DateTime.Now.Date)
                c.IsNextUp = true;

            break;
        }

        // Trim regular events to exact count, preserving special events
        int targetRegularCount = _config.NumberOfEvents;
        for (int i = regularCandidates.Count - 1; i >= 0 && regularCandidates.Count > targetRegularCount; i--)
            if (!regularCandidates[i].SpecialEvent)
                regularCandidates.RemoveAt(i);

        // Trim all-day events: keep ALL special events, fill remaining slots with regular all-day events
        int targetAllDayCount = _config.NumberOfAllDayEvents;
        var specialAllDayEvents = allDayCandidates.Where(e => e.SpecialEvent).ToList();
        var regularAllDayEvents = allDayCandidates.Where(e => !e.SpecialEvent).ToList();

        // Calculate remaining slots after including all special events
        int remainingSlots = Math.Max(0, targetAllDayCount - specialAllDayEvents.Count);
        var finalAllDayEvents = specialAllDayEvents.Concat(regularAllDayEvents.Take(remainingSlots)).ToList();

        return new TimeUntilBlockDto()
        {
            ValidUntilUtc = DateTime.UtcNow.AddMinutes(3),
            RegularEvents = regularCandidates.Take(targetRegularCount).ToArray(),
            AllDayEvents = finalAllDayEvents.ToArray(),
        };
    }
}
