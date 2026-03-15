namespace Webber.Client.Models;

public record WeatherForecastBlockDto : BaseDto
{
    public WeatherForecastDayDto[] Days { get; set; }
    public WeatherForecastHourDto[] Hours { get; set; }
}

public record WeatherForecastDayDto
{
    public string Date { get; set; } // local date
    public int TempMinC { get; set; }
    public int TempMaxC { get; set; }
    public int RainProbability { get; set; }
    public int WindMph { get; set; }
    public int GustMph { get; set; }
    public WeatherForecastKindDte WeatherKind { get; set; }
    public bool Night { get; set; }
}

public record WeatherForecastHourDto
{
    public DateTime DateTime { get; set; } // local date/time; during DST can have duplicate or missing hours
    public int RainProbability { get; set; }
}

public enum WeatherForecastKindDte
{
    Sun = 1, // "sunny-day", sun
    SunIntervals = 3, // "sunny-intervals-day", cloud-sun
    CloudLight = 7, // "white-cloud-day", cloud (outline)
    CloudThick = 8, // "thick-cloud-day", cloud (solid)

    Drizzle = 11, // "drizzle-day", cloud-drizzle
    RainLightSun = 10, // "light-rain-shower-day", cloud-sun-rain
    RainLight = 12, // "light-rain-day", cloud-rain
    RainHeavySun = 14, // "heavy-rain-shower-day"
    RainHeavy = 15, // "heavy-rain-day", cloud-showers-heavy

    SnowRainSun = 17, // "sleet-shower-day", cloud-sleet + sun
    SnowRain = 18, // "sleet-day", cloud-sleet

    SnowLightSun = 23, // "light-snow-shower-day",
    SnowLight = 24, // "light-snow-day", cloud-snow
    SnowHeavySun = 26, // "heavy-snow-shower-day",
    SnowHeavy = 27, // "heavy-snow-day", cloud-snow (solid)

    HailSun = 20, // "hail-shower-day", cloud-hail + sun
    Hail = 21, // "hail-day", cloud-hail

    ThunderstormSun = 29, // "thunderstorm-shower-day", cloud-bolt-sun
    Thunderstorm = 30, // "thunderstorm-day", cloud-bolt

    Mist = 5, // "mist-day", cloud-fog
    Fog = 6, // "fog-day",
    Haze = 32, //: "hazy-day", sun-haze

    Sandstorm = 4, // "sandstorm-day",
    TropicalStorm = 31, //: "tropicalstorm-day", hurricane
}
