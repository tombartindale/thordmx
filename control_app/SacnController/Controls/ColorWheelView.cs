using SkiaSharp;
using SkiaSharp.Views.Maui;
using SkiaSharp.Views.Maui.Controls;
using SacnController.Models;

namespace SacnController.Controls;

public class ColorWheelView : SKCanvasView
{
    private float _selectedHue;
    private float _selectedSaturation = 1f;
    private bool _isTouching;

    public event EventHandler<(RgbColor Color, bool IsTouching)>? ColorChanged;

    public float Brightness { get; set; } = 1f;

    public ColorWheelView()
    {
        EnableTouchEvents = true;
        Touch += OnTouch;
    }

    protected override void OnPaintSurface(SKPaintSurfaceEventArgs e)
    {
        var canvas = e.Surface.Canvas;
        var info = e.Info;
        canvas.Clear(SKColor.Parse("#1E1E1E"));

        float size = Math.Min(info.Width, info.Height);
        float radius = size / 2f - 10f;
        float cx = info.Width / 2f;
        float cy = info.Height / 2f;

        // Draw color wheel using sweep gradient (hue) and radial gradient (saturation)
        using var huePaint = new SKPaint { IsAntialias = true };

        // Sweep gradient for hue
        var hueColors = new SKColor[13];
        for (int i = 0; i <= 12; i++)
        {
            float hue = i * 30f;
            hueColors[i] = SKColor.FromHsv(hue, 100, 100);
        }
        var huePositions = new float[13];
        for (int i = 0; i <= 12; i++)
            huePositions[i] = i / 12f;

        huePaint.Shader = SKShader.CreateCompose(
            SKShader.CreateSweepGradient(new SKPoint(cx, cy), hueColors, huePositions),
            SKShader.CreateRadialGradient(
                new SKPoint(cx, cy), radius,
                new SKColor[] { SKColors.White, SKColors.Transparent },
                new float[] { 0f, 1f },
                SKShaderTileMode.Clamp),
            SKBlendMode.SrcOver
        );

        canvas.DrawCircle(cx, cy, radius, huePaint);

        // Draw selector indicator
        float selectorAngle = _selectedHue * MathF.PI / 180f - MathF.PI / 2f;
        float selectorDist = _selectedSaturation * radius;
        float sx = cx + selectorDist * MathF.Cos(selectorAngle);
        float sy = cy + selectorDist * MathF.Sin(selectorAngle);

        using var selectorOuterPaint = new SKPaint
        {
            IsAntialias = true,
            Style = SKPaintStyle.Stroke,
            StrokeWidth = 4f,
            Color = SKColors.Black
        };
        using var selectorInnerPaint = new SKPaint
        {
            IsAntialias = true,
            Style = SKPaintStyle.Stroke,
            StrokeWidth = 2f,
            Color = SKColors.White
        };

        canvas.DrawCircle(sx, sy, 14f, selectorOuterPaint);
        canvas.DrawCircle(sx, sy, 14f, selectorInnerPaint);
    }

    private void OnTouch(object? sender, SKTouchEventArgs e)
    {
        var info = CanvasSize;
        float cx = info.Width / 2f;
        float cy = info.Height / 2f;
        float size = Math.Min(info.Width, info.Height);
        float radius = size / 2f - 10f;

        float dx = e.Location.X - cx;
        float dy = e.Location.Y - cy;
        float distance = MathF.Sqrt(dx * dx + dy * dy);

        switch (e.ActionType)
        {
            case SKTouchAction.Pressed:
            case SKTouchAction.Moved:
                _isTouching = true;

                // Clamp to wheel radius
                float clampedDist = Math.Min(distance, radius);
                _selectedSaturation = clampedDist / radius;

                // Calculate hue from angle (0 at top, clockwise)
                float angle = MathF.Atan2(dy, dx) + MathF.PI / 2f;
                if (angle < 0) angle += 2f * MathF.PI;
                _selectedHue = angle * 180f / MathF.PI;

                InvalidateSurface();
                EmitColor();
                e.Handled = true;
                break;

            case SKTouchAction.Released:
            case SKTouchAction.Cancelled:
                _isTouching = false;
                EmitColor();
                e.Handled = true;
                break;
        }
    }

    public void UpdateBrightness(float brightness)
    {
        Brightness = brightness;
        EmitColor();
    }

    private void EmitColor()
    {
        var color = RgbColor.FromHsv(_selectedHue, _selectedSaturation, Brightness);
        ColorChanged?.Invoke(this, (color, _isTouching));
    }
}
