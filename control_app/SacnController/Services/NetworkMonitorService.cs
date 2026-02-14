namespace SacnController.Services;

public class NetworkMonitorService : IDisposable
{
    private bool _disposed;

    public bool IsWifiConnected { get; private set; }

    public event EventHandler<bool>? WifiStatusChanged;

    public void StartMonitoring()
    {
        Connectivity.ConnectivityChanged += OnConnectivityChanged;
        UpdateWifiStatus();
    }

    public void StopMonitoring()
    {
        Connectivity.ConnectivityChanged -= OnConnectivityChanged;
    }

    private void OnConnectivityChanged(object? sender, ConnectivityChangedEventArgs e)
    {
        UpdateWifiStatus();
    }

    private void UpdateWifiStatus()
    {
        bool hasWifi = Connectivity.NetworkAccess == NetworkAccess.Internet &&
                       Connectivity.ConnectionProfiles.Contains(ConnectionProfile.WiFi);

        if (hasWifi != IsWifiConnected)
        {
            IsWifiConnected = hasWifi;
            WifiStatusChanged?.Invoke(this, hasWifi);
        }
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        StopMonitoring();
        GC.SuppressFinalize(this);
    }
}
