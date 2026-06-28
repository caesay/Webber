using Webber.Server;

var envDocker = Environment.GetEnvironmentVariable("WEBBER_DOCKER");
var envConfig = Environment.GetEnvironmentVariable("WEBBER_CONFIG");

if (!string.IsNullOrEmpty(envDocker))
{
    if (string.IsNullOrEmpty(envConfig))
        throw new Exception("Must specify config path via the WEBBER_CONFIG argument in docker containers.");

    var svc = new WebberService(envConfig);
    return svc.StartAndBlock();
}

if (args.Length == 2 && args[0] == "--debug")
{
    var svc = new WebberService(args[1]);
    return svc.StartAndBlock();
}

if (args.Length == 2 && args[0] == "--config")
{
    var svc = new WebberService(args[1]);
    return svc.StartAndBlock();
}

Console.Error.WriteLine("Usage: Webber --config <path>");
return 1;
