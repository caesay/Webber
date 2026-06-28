using System.Reflection;
using System.Text.Json;
using System.Text.Json.Serialization;
using Newtonsoft.Json.Linq;
using Webber.Server.Blocks;
using Webber.Server.Services;

namespace Webber.Server;

public class AppConfig
{
    public string DbFilePath { get; init; }
    public string WebRootPath { get; init; }
    public string LocalTimezoneName { get; init; }
    public string[] CorsOrigins { get; init; }
    public bool DisableCaching { get; init; }
}

class WebberService
{
    private readonly string _configPath;
    private WebApplication app;
    private CancellationTokenSource _cts = new();

    public WebberService(string configPath)
    {
        if (string.IsNullOrWhiteSpace(configPath))
            throw new ArgumentNullException(nameof(configPath), "missing config path");
        if (!File.Exists(configPath))
            throw new ArgumentException("The '-config' specified path does not exist");
        this._configPath = configPath;

        var appConfig = JObject.Parse(File.ReadAllText(configPath))["App"].ToObject<AppConfig>(); // we need this before the ASP config API gets to load the file...
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { WebRootPath = appConfig.WebRootPath, ContentRootPath = AppContext.BaseDirectory });

        builder.Configuration.AddJsonFile(_configPath, optional: false);

        builder.Logging.AddConsole2(); // disabled by default; enabled/configured in config JSON
        builder.Logging.AddFile(); // disabled by default; enabled/configured in config JSON
        builder.Services.AddControllers();
        builder.Services.AddSignalR()
            .AddJsonProtocol(opts => opts.PayloadSerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase, allowIntegerValues: false)));

        var blockServerTypes = Assembly.GetExecutingAssembly().GetTypes().Where(t => !t.IsAbstract && t.IsAssignableTo(typeof(IBlockServer))).ToList();
        foreach (var blockServerType in blockServerTypes)
        {
            var blockConfig = builder.Configuration.GetSection(blockServerType.Name.Replace("BlockServer", "Block"));
            if (!blockConfig.Exists())
                continue;

            // Register the block server
            var IBlockServer_TDto = blockServerType.GetInterfaces().Single(i => i.IsGenericType && i.GetGenericTypeDefinition() == typeof(IBlockServer<>));
            builder.Services.Add(new ServiceDescriptor(blockServerType, blockServerType, ServiceLifetime.Singleton));

            // Register it's interfaces to use the same instance
            Func<IServiceProvider, object> factory = (sp) => sp.GetRequiredService(blockServerType);
            builder.Services.Add(new ServiceDescriptor(IBlockServer_TDto, factory, ServiceLifetime.Singleton));
            builder.Services.Add(new ServiceDescriptor(typeof(IBlockServer), factory, ServiceLifetime.Singleton));

            // Register its configuration
            var configTypeName = blockServerType.FullName.Replace("BlockServer", "BlockConfig");
            var configType = Assembly.GetExecutingAssembly().GetType(configTypeName);
            if (configType != null)
                builder.Services.Add(new ServiceDescriptor(configType, blockConfig.Get(configType)));
        }

        var config = builder.Configuration.GetSection("App").GetOrDefault<AppConfig>();
        builder.Services.AddSingleton<AppConfig>(config);

        // TODO make this just a single service which toggles "Enabled" on the presence of DbFilePath
        if (string.IsNullOrEmpty(config.DbFilePath))
            builder.Services.AddSingleton<IDbService, DisabledDbService>();
        else
            builder.Services.AddSingleton<IDbService>(new DbService(config));

        app = builder.Build();
        app.Logger.LogInformation($"Webber starting");

        if (config.DisableCaching)
            app.UseMiddleware<NoCacheHeadersMiddleware>();
        app.UseCors(b => { b.WithOrigins(config.CorsOrigins ?? new[] { "http://localhost:3000" }).AllowAnyHeader().WithMethods("GET", "POST").AllowCredentials(); });
        app.UseStaticFiles();
        app.UseRouting();
        app.MapControllers();
        app.MapFallbackToFile("index.html");
    }

    private void Init()
    {
        foreach (var service in app.Services.GetServices<IBlockServer>())
            service.Init(app);

        app.MapHub<DashboardHub>("/hub/dashboard");

        var dbService = app.Services.GetRequiredService<IDbService>();
        dbService.Initialise();

        foreach (var service in app.Services.GetServices<IBlockServer>())
        {
            Task.Run(() =>
            {
                var start = DateTime.UtcNow;
                service.Start(_cts.Token);
                app.Logger.LogInformation($"Service {service.GetType().Name} started in {(DateTime.UtcNow - start).TotalSeconds:0.0} seconds");
            });
        }
    }

    public int StartAndBlock()
    {
        Init();
        app.Run();
        return 0;
    }
}
