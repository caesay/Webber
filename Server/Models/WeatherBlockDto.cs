namespace Webber.Client.Models;

public record WeatherBlockDto : BaseDto
{
    public decimal CurTemperature { get; set; }
    public string CurTemperatureColor { get; set; }
    public decimal MinTemperature { get; set; }
    public string MinTemperatureColor { get; set; }
    public string MinTemperatureAtTime { get; set; }
    public string MinTemperatureAtDay { get; set; }
    public decimal MaxTemperature { get; set; }
    public string MaxTemperatureColor { get; set; }
    public string MaxTemperatureAtTime { get; set; }
    public string MaxTemperatureAtDay { get; set; }
    public string SunriseTime { get; set; }
    public string SolarNoonTime { get; set; }
    public string SunsetTime { get; set; }
    public string SunsetDeltaTime { get; set; }

    public DateTime SunriseUtc { get; set; }
    public DateTime SunsetUtc { get; set; }
    public DateTime Sunrise2Utc { get; set; }
    public DateTime Sunset2Utc { get; set; }

    public double? RecentHighTempMean { get; set; }
    public double? RecentHighTempStdev { get; set; }
    public double? RecentLowTempMean { get; set; }
    public double? RecentLowTempStdev { get; set; }
}
