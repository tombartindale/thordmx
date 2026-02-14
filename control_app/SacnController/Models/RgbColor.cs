namespace SacnController.Models;

public readonly record struct RgbColor(byte R, byte G, byte B)
{
    public static RgbColor FromHsv(float hue, float saturation, float value)
    {
        int hi = (int)(hue / 60f) % 6;
        float f = hue / 60f - (int)(hue / 60f);
        float p = value * (1f - saturation);
        float q = value * (1f - f * saturation);
        float t = value * (1f - (1f - f) * saturation);

        float r, g, b;
        switch (hi)
        {
            case 0: r = value; g = t; b = p; break;
            case 1: r = q; g = value; b = p; break;
            case 2: r = p; g = value; b = t; break;
            case 3: r = p; g = q; b = value; break;
            case 4: r = t; g = p; b = value; break;
            default: r = value; g = p; b = q; break;
        }

        return new RgbColor(
            (byte)(r * 255f),
            (byte)(g * 255f),
            (byte)(b * 255f)
        );
    }
}
