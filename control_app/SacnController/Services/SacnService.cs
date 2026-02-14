using System.Net;
using System.Net.Sockets;
using System.Text;
using SacnController.Models;

namespace SacnController.Services;

public class SacnService : IDisposable
{
    private const string MulticastAddress = "239.255.0.1";
    private const int Port = 5568;
    private const int PacketSize = 638;
    private const int DmxSlots = 512;
    private const string SourceName = "ThorDMX Pocket";

    private readonly byte[] _cid;
    private byte _sequenceNumber;
    private UdpClient? _udpClient;
    private IPEndPoint? _endpoint;
    private CancellationTokenSource? _cts;
    private RgbColor _currentColor;
    private bool _isTouching;
    private DateTime _lastTouchTime = DateTime.MinValue;
    private bool _isRunning;
    private bool _disposed;

    public SacnService()
    {
        _cid = GetOrCreateCid();
    }

    public void SetColor(RgbColor color, bool isTouching)
    {
        _currentColor = color;
        _isTouching = isTouching;
        if (isTouching)
            _lastTouchTime = DateTime.UtcNow;
    }

    public void Start()
    {
        if (_isRunning) return;
        _isRunning = true;

        _udpClient = new UdpClient();
        _udpClient.JoinMulticastGroup(IPAddress.Parse(MulticastAddress));
        _endpoint = new IPEndPoint(IPAddress.Parse(MulticastAddress), Port);

        _cts = new CancellationTokenSource();
        _ = SendLoopAsync(_cts.Token);
    }

    public void Stop()
    {
        if (!_isRunning) return;
        _isRunning = false;

        _cts?.Cancel();
        _cts?.Dispose();
        _cts = null;

        try
        {
            _udpClient?.DropMulticastGroup(IPAddress.Parse(MulticastAddress));
        }
        catch { }

        _udpClient?.Dispose();
        _udpClient = null;
    }

    private async Task SendLoopAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                var isActive = _isTouching ||
                    (DateTime.UtcNow - _lastTouchTime).TotalSeconds < 1.0;
                var interval = isActive
                    ? TimeSpan.FromMilliseconds(45)   // ~22 Hz
                    : TimeSpan.FromMilliseconds(1000); // ~1 Hz keep-alive

                SendPacket();
                await Task.Delay(interval, ct);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch
            {
                // Swallow send errors, retry on next tick
            }
        }
    }

    private void SendPacket()
    {
        if (_udpClient == null || _endpoint == null) return;

        var packet = BuildPacket(_currentColor);
        _udpClient.Send(packet, packet.Length, _endpoint);
    }

    private byte[] BuildPacket(RgbColor color)
    {
        var packet = new byte[PacketSize];

        // --- Root Layer ---
        // Preamble Size (0x0010)
        packet[0] = 0x00; packet[1] = 0x10;
        // Post-amble Size (0x0000)
        packet[2] = 0x00; packet[3] = 0x00;
        // ACN Packet Identifier
        byte[] acnId = { 0x41, 0x53, 0x43, 0x2D, 0x45, 0x31, 0x2E, 0x31, 0x37, 0x00, 0x00, 0x00 };
        Array.Copy(acnId, 0, packet, 4, 12);

        // Root Flags + Length (0x7000 | length from here to end)
        int rootLength = PacketSize - 16;
        packet[16] = (byte)(0x70 | ((rootLength >> 8) & 0x0F));
        packet[17] = (byte)(rootLength & 0xFF);

        // Root Vector (0x00000004)
        packet[18] = 0x00; packet[19] = 0x00; packet[20] = 0x00; packet[21] = 0x04;

        // CID
        Array.Copy(_cid, 0, packet, 22, 16);

        // --- Framing Layer ---
        // Framing Flags + Length
        int framingLength = PacketSize - 38;
        packet[38] = (byte)(0x70 | ((framingLength >> 8) & 0x0F));
        packet[39] = (byte)(framingLength & 0xFF);

        // Framing Vector (0x00000002)
        packet[40] = 0x00; packet[41] = 0x00; packet[42] = 0x00; packet[43] = 0x02;

        // Source Name (64 bytes, UTF-8 padded)
        byte[] nameBytes = Encoding.UTF8.GetBytes(SourceName);
        Array.Copy(nameBytes, 0, packet, 44, Math.Min(nameBytes.Length, 64));

        // Priority
        packet[108] = 100;

        // Sync Address (0)
        packet[109] = 0x00; packet[110] = 0x00;

        // Sequence Number
        packet[111] = _sequenceNumber++;

        // Options
        packet[112] = 0x00;

        // Universe (1)
        packet[113] = 0x00; packet[114] = 0x01;

        // --- DMP Layer ---
        // DMP Flags + Length
        int dmpLength = PacketSize - 115;
        packet[115] = (byte)(0x70 | ((dmpLength >> 8) & 0x0F));
        packet[116] = (byte)(dmpLength & 0xFF);

        // DMP Vector
        packet[117] = 0x02;

        // Address Type & Data Type
        packet[118] = 0xA1;

        // First Property Address (0x0000)
        packet[119] = 0x00; packet[120] = 0x00;

        // Address Increment (0x0001)
        packet[121] = 0x00; packet[122] = 0x01;

        // Property Value Count (513 = 0x0201)
        packet[123] = 0x02; packet[124] = 0x01;

        // DMX Start Code
        packet[125] = 0x00;

        // DMX Channel Data: slot 1=R, 2=G, 3=B (offsets 126, 127, 128)
        packet[126] = color.R;
        packet[127] = color.G;
        packet[128] = color.B;

        return packet;
    }

    private static byte[] GetOrCreateCid()
    {
        const string cidKey = "sacn_cid";
        string? stored = Preferences.Get(cidKey, null);

        if (stored != null)
        {
            return Convert.FromBase64String(stored);
        }

        byte[] cid = Guid.NewGuid().ToByteArray();
        Preferences.Set(cidKey, Convert.ToBase64String(cid));
        return cid;
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        Stop();
        GC.SuppressFinalize(this);
    }
}
