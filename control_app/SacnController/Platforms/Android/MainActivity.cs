using Android.App;
using Android.Content.PM;
using Android.Net.Wifi;
using Android.OS;

namespace SacnController;

[Activity(Theme = "@style/Maui.SplashTheme", MainLauncher = true,
    ConfigurationChanges = ConfigChanges.ScreenSize | ConfigChanges.Orientation | ConfigChanges.UiMode |
                           ConfigChanges.ScreenLayout | ConfigChanges.SmallestScreenSize | ConfigChanges.Density)]
public class MainActivity : MauiAppCompatActivity
{
    private WifiManager.MulticastLock? _multicastLock;

    protected override void OnResume()
    {
        base.OnResume();
        AcquireMulticastLock();
    }

    protected override void OnPause()
    {
        base.OnPause();
        ReleaseMulticastLock();
    }

    private void AcquireMulticastLock()
    {
        if (_multicastLock != null) return;

        var wifiManager = (WifiManager?)GetSystemService(WifiService);
        if (wifiManager == null) return;

        _multicastLock = wifiManager.CreateMulticastLock("SacnControllerMulticast");
        _multicastLock.Acquire();
    }

    private void ReleaseMulticastLock()
    {
        if (_multicastLock == null) return;

        if (_multicastLock.IsHeld)
            _multicastLock.Release();

        _multicastLock = null;
    }
}
