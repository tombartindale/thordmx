using SkiaSharp.Views.Maui.Controls.Hosting;
using SacnController.Services;

namespace SacnController;

public static class MauiProgram
{
    public static MauiApp CreateMauiApp()
    {
        var builder = MauiApp.CreateBuilder();
        builder
            .UseMauiApp<App>()
            .UseSkiaSharp()
            .ConfigureFonts(fonts =>
            {
                fonts.AddFont("OpenSans-Regular.ttf", "OpenSansRegular");
            });

        builder.Services.AddSingleton<SacnService>();
        builder.Services.AddSingleton<NetworkMonitorService>();
        builder.Services.AddSingleton<MainPage>();

        return builder.Build();
    }
}
