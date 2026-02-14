namespace SacnController;

public partial class App : Application
{
    public App()
    {
        InitializeComponent();
    }

    protected override Window CreateWindow(IActivationState? activationState)
    {
        return new Window(new NavigationPage(Handler?.MauiContext?.Services.GetService<MainPage>() ?? new MainPage()));
    }
}
