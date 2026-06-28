using System.Globalization;
using System.Text;
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

class TimeUntilBlockConfig
{
    /// <summary> The number of regular events to send to the client in each update. </summary>
    public int NumberOfEvents { get; set; } = 3;

    /// <summary> The number of all-day events to send to the client in each update. </summary>
    public int NumberOfAllDayEvents { get; set; } = 3;

    /// <summary> Optionally add a sleep timer to the list of events. </summary>
    public double? SleepTime { get; set; }

    /// <summary> An array of calendars to read from, as long as the authorized user has permission to access them. </summary>
    public string[] CalendarKeys { get; set; }

    /// <summary> Directory to save Google Authorization tokens to.</summary>
    public string AuthStoreDirectory { get; set; } = ".\\TimeUntilToken";

    /// <summary> This is optional, if you wish to create your own App via Google Console - otherwise it will use mine (hard coded). </summary>
    public string AppCredentialsPath { get; set; }

    /// <summary> A list of special / annual events. These will be shown each year with a counting number (eg. 10th anniversary). </summary>
    public TimeUntilSpecialEvent[] SpecialAnnualEvents { get; set; } = new TimeUntilSpecialEvent[0];

    /// <summary> The number of days in advance special events should appear on your calendar. </summary>
    public int SpecialAnnualDefaultLeadTimeDays { get; set; } = 14;
}

internal class TimeUntilBlockServer : SimpleBlockServerBase<TimeUntilBlockDto>
{
    private static readonly string[] Scopes = { CalendarService.Scope.CalendarReadonly };
    private static readonly string ApplicationName = "TimeUntilBlockServer";
    private static readonly string DefaultCredentialsJson = "{\"installed\":{\"client_id\":\"130261896764-m7jl26tiob0gdrjqrmgjm0fcqqg0nkh2.apps.googleusercontent.com\",\"project_id\":\"titanium-cacao-318415\",\"auth_uri\":\"https://accounts.google.com/o/oauth2/auth\",\"token_uri\":\"https://oauth2.googleapis.com/token\",\"auth_provider_x509_cert_url\":\"https://www.googleapis.com/oauth2/v1/certs\",\"client_secret\":\"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\",\"redirect_uris\":[\"urn:ietf:wg:oauth:2.0:oob\",\"http://localhost\"]}}";

    private readonly TimeUntilBlockConfig _config;
    private readonly ILogger<TimeUntilBlockServer> _log;
    private CalendarService _svc;

    public TimeUntilBlockServer(IServiceProvider sp, ILogger<TimeUntilBlockServer> log, TimeUntilBlockConfig config)
        : base(sp, TimeSpan.FromMinutes(1))
    {
        this._config = config;
        this._log = log;
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

    private List<Event> FetchEvents(int desiredRegularCount, int desiredAllDayCount)
    {
        List<Event> allEvents = new List<Event>();
        int windowSize = 30; // Search 30 days at a time
        int currentOffset = 0; // Start from now
        int maxDaysAhead = 365; // Maximum 1 year ahead

        while (currentOffset < maxDaysAhead)
        {
            foreach (var c in _config.CalendarKeys.Distinct())
            {
                EventsResource.ListRequest request = _svc.Events.List(c);
                request.TimeMinDateTimeOffset = DateTimeOffset.Now.AddDays(currentOffset);
                request.TimeMaxDateTimeOffset = DateTimeOffset.Now.AddDays(currentOffset + windowSize);
                request.ShowDeleted = false;
                request.SingleEvents = true;
                request.MaxResults = (desiredRegularCount + desiredAllDayCount) * 3; // Fetch extra to allow for filtering
                request.OrderBy = EventsResource.ListRequest.OrderByEnum.StartTime;

                var items = request.Execute().Items;
                allEvents.AddRange(items);
            }

            // Check if we have enough of both types
            int regularCount = allEvents.Count(e => e.Start?.DateTimeDateTimeOffset != null);
            int allDayCount = allEvents.Count(e => e.Start?.DateTimeDateTimeOffset == null);

            if (regularCount >= desiredRegularCount && allDayCount >= desiredAllDayCount)
                break;

            currentOffset += windowSize; // Shift the window forward
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
        List<Event> events = FetchEvents(_config.NumberOfEvents, _config.NumberOfAllDayEvents);

        // Process all events with a single LINQ query
        var allCandidates = events
            .Where(i => i.EventType == "default") // filter out OOO
            .Where(checkSelfRsvpNotDeclined) // filter out declined events
            .Where(i => !string.IsNullOrWhiteSpace(i.Summary)) // no title?
            .DistinctBy(i => i.RecurringEventId ?? i.Id)
            .Select(i => new CalendarEvent()
            {
                Id = i.Id,
                DisplayName = i.Summary,
                StartTimeUtc = i.Start?.DateTimeDateTimeOffset?.UtcDateTime
                    ?? DateTime.ParseExact(i.Start.Date, "yyyy-MM-dd", CultureInfo.CurrentCulture.DateTimeFormat),
                EndTimeUtc = i.End?.DateTimeDateTimeOffset?.UtcDateTime
                    ?? DateTime.ParseExact(i.End.Date, "yyyy-MM-dd", CultureInfo.CurrentCulture.DateTimeFormat),
                IsRecurring = i.RecurringEventId != null,
                IsAllDay = i.Start?.DateTimeDateTimeOffset == null,
            })
            .OrderBy(i => i.StartTimeUtc)
            .Distinct()
            .ToList();

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

                allCandidates.Add(new CalendarEvent { Id = "{special_" + i + "}", DisplayName = eventName, StartTimeUtc = nextDate, IsAllDay = true, SpecialEvent = true });
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
                var binevent = new CalendarEvent { DisplayName = name + " Collection", IsAllDay = true, StartTimeUtc = bindays[0].StartTimeUtc };
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
