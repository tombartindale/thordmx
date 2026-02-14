using SacnController.Models;
using SacnController.Services;

namespace SacnController;

public partial class MainPage : ContentPage
{
    private readonly SacnService _sacnService;
    private readonly NetworkMonitorService _networkMonitor;

    public MainPage(SacnService sacnService, NetworkMonitorService networkMonitor)
    {
        InitializeComponent();

        _sacnService = sacnService;
        _networkMonitor = networkMonitor;

        ColorWheel.ColorChanged += OnColorChanged;
        BrightnessSlider.ValueChanged += OnBrightnessChanged;
        _networkMonitor.WifiStatusChanged += OnWifiStatusChanged;
    }

    public MainPage() : this(new SacnService(), new NetworkMonitorService())
    {
    }

    protected override void OnAppearing()
    {
        base.OnAppearing();
        _networkMonitor.StartMonitoring();
        UpdateWifiBanner(_networkMonitor.IsWifiConnected);

        if (_networkMonitor.IsWifiConnected)
            _sacnService.Start();
    }

    protected override void OnDisappearing()
    {
        base.OnDisappearing();
        _sacnService.Stop();
        _networkMonitor.StopMonitoring();
    }

    private void OnColorChanged(object? sender, (RgbColor Color, bool IsTouching) e)
    {
        MainThread.BeginInvokeOnMainThread(() =>
        {
            var c = e.Color;
            ColorPreview.Color = Color.FromRgb(c.R, c.G, c.B);
            RedLabel.Text = $"R: {c.R}";
            GreenLabel.Text = $"G: {c.G}";
            BlueLabel.Text = $"B: {c.B}";
        });

        _sacnService.SetColor(e.Color, e.IsTouching);
    }

    private void OnBrightnessChanged(object? sender, ValueChangedEventArgs e)
    {
        ColorWheel.UpdateBrightness((float)e.NewValue);
    }

    private void OnWifiStatusChanged(object? sender, bool isConnected)
    {
        MainThread.BeginInvokeOnMainThread(() =>
        {
            UpdateWifiBanner(isConnected);

            if (isConnected)
                _sacnService.Start();
            else
                _sacnService.Stop();
        });
    }

    private void UpdateWifiBanner(bool isConnected)
    {
        WifiBanner.IsVisible = !isConnected;
        WifiIndicator.BackgroundColor = isConnected
            ? Color.FromArgb("#44FF44")
            : Color.FromArgb("#FF4444");
    }
}
