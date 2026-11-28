// Sahyadri Card Reader for Windows: reads NFC cards on any PC/SC reader (the laptop's built-in NFC chip, which
// Windows shows as "Microsoft IFD 0", or a USB reader such as an ACR122U) and types the card number plus Enter into
// the portal's gate desk, the same as a keyboard-style USB reader. Browsers cannot talk to these readers, so this
// small tray app does it. The number is the card's UID in upper-case hex: the same value Web NFC and the Flutter
// app give, so one card works everywhere. Contract: docs/nfc-api.md. Build: build.ps1. Install: install.ps1.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

static class Pcsc
{
    public const uint SCOPE_USER = 0, SHARE_SHARED = 2, PROTO_ANY = 3, LEAVE = 0;
    public const uint STATE_UNAWARE = 0, STATE_CHANGED = 0x2, STATE_PRESENT = 0x20, STATE_MUTE = 0x200;
    public const int E_TIMEOUT = unchecked((int)0x8010000A), E_CANCELLED = unchecked((int)0x80100002), E_NO_READERS = unchecked((int)0x8010002E);
    public const string PNP = "\\\\?PnP?\\Notification"; // a pseudo reader that changes when readers are added or removed

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct ReaderState
    {
        public string Reader; public IntPtr User; public uint Current; public uint Event; public uint AtrLen;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 36)] public byte[] Atr;
    }
    [StructLayout(LayoutKind.Sequential)] public struct IoRequest { public uint Protocol; public uint Length; }

    [DllImport("winscard.dll")] public static extern int SCardEstablishContext(uint scope, IntPtr r1, IntPtr r2, out IntPtr ctx);
    [DllImport("winscard.dll")] public static extern int SCardReleaseContext(IntPtr ctx);
    [DllImport("winscard.dll")] public static extern int SCardCancel(IntPtr ctx);
    [DllImport("winscard.dll", CharSet = CharSet.Unicode)] public static extern int SCardListReaders(IntPtr ctx, string groups, char[] readers, ref int len);
    [DllImport("winscard.dll", CharSet = CharSet.Unicode)] public static extern int SCardGetStatusChange(IntPtr ctx, uint timeout, [In, Out] ReaderState[] states, int count);
    [DllImport("winscard.dll", CharSet = CharSet.Unicode)] public static extern int SCardConnect(IntPtr ctx, string reader, uint share, uint protocols, out IntPtr card, out uint protocol);
    [DllImport("winscard.dll")] public static extern int SCardTransmit(IntPtr card, ref IoRequest send, byte[] cmd, int cmdLen, IntPtr recv, byte[] resp, ref int respLen);
    [DllImport("winscard.dll")] public static extern int SCardDisconnect(IntPtr card, uint disposition);

    public static List<string> Readers(IntPtr ctx)
    {
        var list = new List<string>();
        int len = 8192; var buf = new char[len];
        if (SCardListReaders(ctx, null, buf, ref len) != 0) return list;
        foreach (var r in new string(buf, 0, Math.Max(0, len)).Split('\0')) if (r.Length > 0) list.Add(r);
        return list;
    }

    /// The card's UID via the PC/SC "Get Data" pseudo-command (FF CA 00 00 00), answered by the reader for
    /// contactless cards. Returns upper-case hex, or null if the reader did not answer 90 00.
    public static string ReadUid(IntPtr ctx, string reader, out string error)
    {
        error = null;
        IntPtr card; uint proto;
        int rc = SCardConnect(ctx, reader, SHARE_SHARED, PROTO_ANY, out card, out proto);
        if (rc != 0) { error = "could not connect to the card (0x" + rc.ToString("X8") + ")"; return null; }
        try
        {
            var io = new IoRequest { Protocol = proto, Length = 8 };
            var resp = new byte[258]; int rl = resp.Length;
            rc = SCardTransmit(card, ref io, new byte[] { 0xFF, 0xCA, 0x00, 0x00, 0x00 }, 5, IntPtr.Zero, resp, ref rl);
            if (rc != 0) { error = "the reader did not answer (0x" + rc.ToString("X8") + ")"; return null; }
            if (rl < 3 || resp[rl - 2] != 0x90 || resp[rl - 1] != 0x00) { error = "the reader cannot give this card's number"; return null; }
            var sb = new StringBuilder();
            for (int i = 0; i < rl - 2; i++) sb.Append(resp[i].ToString("X2"));
            return sb.ToString();
        }
        finally { SCardDisconnect(card, LEAVE); }
    }
}

class Settings
{
    const string Key = @"Software\SahyadriHeights\CardReader";
    public bool AnyWindow; public bool Paused; public string Url = "https://sahyadri-heights.onrender.com/?web";
    public static Settings Load()
    {
        var s = new Settings();
        using (var k = Registry.CurrentUser.OpenSubKey(Key))
        {
            if (k == null) return s;
            s.AnyWindow = (k.GetValue("AnyWindow", 0) as int? ?? 0) == 1;
            s.Url = k.GetValue("Url", s.Url) as string ?? s.Url;
        }
        return s;
    }
    public void Save()
    {
        using (var k = Registry.CurrentUser.CreateSubKey(Key)) { k.SetValue("AnyWindow", AnyWindow ? 1 : 0); k.SetValue("Url", Url); }
    }
    const string Run = @"Software\Microsoft\Windows\CurrentVersion\Run";
    public static bool StartsWithWindows
    {
        get { using (var k = Registry.CurrentUser.OpenSubKey(Run)) return k != null && k.GetValue("SahyadriCardReader") != null; }
        set
        {
            using (var k = Registry.CurrentUser.CreateSubKey(Run))
                if (value) k.SetValue("SahyadriCardReader", "\"" + Application.ExecutablePath + "\""); else k.DeleteValue("SahyadriCardReader", false);
        }
    }
}

class App : ApplicationContext
{
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);

    readonly NotifyIcon tray = new NotifyIcon();
    readonly Settings cfg = Settings.Load();
    readonly SynchronizationContext ui;
    readonly ToolStripMenuItem status = new ToolStripMenuItem("Starting…") { Enabled = false };
    readonly ToolStripMenuItem last = new ToolStripMenuItem("No card read yet") { Enabled = false };
    IntPtr ctx = IntPtr.Zero;
    volatile bool running = true;

    App()
    {
        ui = SynchronizationContext.Current ?? new WindowsFormsSynchronizationContext();
        tray.Icon = MakeIcon();
        tray.Text = "Sahyadri Card Reader";
        var menu = new ContextMenuStrip();
        menu.Items.Add(status);
        menu.Items.Add(last);
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Open the gate desk", null, (s, e) => Open(cfg.Url));
        var pause = new ToolStripMenuItem("Pause typing") { CheckOnClick = true };
        pause.CheckedChanged += (s, e) => cfg.Paused = pause.Checked;
        menu.Items.Add(pause);
        var any = new ToolStripMenuItem("Type into any window (not only the portal)") { CheckOnClick = true, Checked = cfg.AnyWindow };
        any.CheckedChanged += (s, e) => { cfg.AnyWindow = any.Checked; cfg.Save(); };
        menu.Items.Add(any);
        var boot = new ToolStripMenuItem("Start with Windows") { CheckOnClick = true, Checked = Settings.StartsWithWindows };
        boot.CheckedChanged += (s, e) => Settings.StartsWithWindows = boot.Checked;
        menu.Items.Add(boot);
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Exit", null, (s, e) => Quit());
        tray.ContextMenuStrip = menu;
        tray.DoubleClick += (s, e) => Open(cfg.Url);
        tray.Visible = true;
        new Thread(Watch) { IsBackground = true, Name = "pcsc" }.Start();
    }

    static Icon MakeIcon()
    {
        var bmp = new Bitmap(32, 32);
        using (var g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
            g.Clear(Color.Transparent);
            g.FillEllipse(new SolidBrush(Color.FromArgb(0, 136, 176)), 1, 1, 30, 30);
            using (var p = new Pen(Color.White, 2.6f))
                for (int i = 0; i < 3; i++) g.DrawArc(p, 6 + i * 4 - 6, 8 - i * 3, 12 + i * 6, 16 + i * 6, -50, 100);
        }
        return Icon.FromHandle(bmp.GetHicon());
    }

    static void Open(string url) { try { Process.Start(url); } catch { } }

    void Say(string title, string text, ToolTipIcon icon = ToolTipIcon.Info)
    {
        ui.Post(_ => { tray.BalloonTipTitle = title; tray.BalloonTipText = text; tray.BalloonTipIcon = icon; tray.ShowBalloonTip(2500); }, null);
    }
    void Status(string text)
    {
        string tip = "Sahyadri Card Reader: " + text; // the tray tooltip holds 63 characters at most
        ui.Post(_ => { status.Text = text; tray.Text = tip.Length > 63 ? tip.Substring(0, 63) : tip; }, null);
    }

    /// Waits for cards on every reader; re-reads the reader list when one is plugged in or removed.
    void Watch()
    {
        while (running)
        {
            if (ctx == IntPtr.Zero && Pcsc.SCardEstablishContext(Pcsc.SCOPE_USER, IntPtr.Zero, IntPtr.Zero, out ctx) != 0)
            { ctx = IntPtr.Zero; Status("Smart card service is not running"); Thread.Sleep(3000); continue; }
            var readers = Pcsc.Readers(ctx);
            Status(readers.Count == 0 ? "No NFC reader found. Turn NFC on, or plug in a reader." : "Ready: " + string.Join(", ", readers));
            var states = new Pcsc.ReaderState[readers.Count + 1];
            for (int i = 0; i < readers.Count; i++) states[i] = new Pcsc.ReaderState { Reader = readers[i], Current = Pcsc.STATE_UNAWARE, Atr = new byte[36] };
            states[readers.Count] = new Pcsc.ReaderState { Reader = Pcsc.PNP, Current = (uint)(readers.Count << 16), Atr = new byte[36] };
            bool first = true;
            while (running)
            {
                int rc = Pcsc.SCardGetStatusChange(ctx, 2000, states, states.Length);
                if (rc == Pcsc.E_TIMEOUT) continue;
                if (rc == Pcsc.E_CANCELLED || !running) return;
                if (rc != 0) { Pcsc.SCardReleaseContext(ctx); ctx = IntPtr.Zero; Thread.Sleep(1000); break; } // service restarted: start over
                if ((states[readers.Count].Event & Pcsc.STATE_CHANGED) != 0 && !first) break; // readers changed
                for (int i = 0; i < readers.Count; i++)
                {
                    var s = states[i];
                    bool was = (s.Current & Pcsc.STATE_PRESENT) != 0, now = (s.Event & Pcsc.STATE_PRESENT) != 0 && (s.Event & Pcsc.STATE_MUTE) == 0;
                    // A card on the reader when the app starts is ignored; it counts once it is taken off and put back.
                    if (now && !was && !first) OnCard(readers[i]);
                }
                for (int i = 0; i < states.Length; i++) states[i].Current = states[i].Event & ~Pcsc.STATE_CHANGED;
                first = false;
            }
        }
    }

    void OnCard(string reader)
    {
        string err;
        string uid = Pcsc.ReadUid(ctx, reader, out err);
        if (uid == null) { Say("Card not read", "The card was seen but " + err + ". Hold it still and try again.", ToolTipIcon.Warning); return; }
        ui.Post(_ => Deliver(uid), null);
    }

    void Deliver(string uid)
    {
        last.Text = "Last card: " + uid + " (" + DateTime.Now.ToString("HH:mm:ss") + ")";
        try { Clipboard.SetText(uid); } catch { }
        if (cfg.Paused) { Say("Card " + uid, "Typing is paused. The number is on the clipboard."); return; }
        var sb = new StringBuilder(256);
        GetWindowText(GetForegroundWindow(), sb, sb.Capacity);
        // Only the portal's window by default, so a tap never types into some other program.
        // The portal's tab title is "<society name> Portal" (default "Sahyadri Heights Portal").
        string title = sb.ToString();
        if (!cfg.AnyWindow && title.IndexOf("Sahyadri", StringComparison.OrdinalIgnoreCase) < 0 && title.IndexOf(" Portal", StringComparison.OrdinalIgnoreCase) < 0)
        {
            Say("Card " + uid, "Open the gate desk in the portal to use it. The number is on the clipboard.");
            return;
        }
        SystemSounds();
        SendKeys.SendWait(uid + "{ENTER}");
    }

    static void SystemSounds() { try { System.Media.SystemSounds.Asterisk.Play(); } catch { } }

    void Quit()
    {
        running = false;
        if (ctx != IntPtr.Zero) Pcsc.SCardCancel(ctx);
        tray.Visible = false;
        ExitThread();
    }

    [STAThread]
    static void Main(string[] args)
    {
        // --read-once: print one card number to the console and exit (used by install.ps1 -Test and for support).
        if (args.Length > 0 && args[0] == "--read-once") { Environment.Exit(ReadOnce(args.Length > 1 ? int.Parse(args[1]) : 30)); return; }
        bool created;
        using (new Mutex(true, "SahyadriCardReader", out created))
        {
            if (!created) { MessageBox.Show("Sahyadri Card Reader is already running (see the tray, next to the clock).", "Sahyadri Card Reader"); return; }
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new App());
        }
    }

    static int ReadOnce(int secs)
    {
        IntPtr c;
        if (Pcsc.SCardEstablishContext(Pcsc.SCOPE_USER, IntPtr.Zero, IntPtr.Zero, out c) != 0) { Console.WriteLine("Smart card service is not running."); return 2; }
        var readers = Pcsc.Readers(c);
        if (readers.Count == 0) { Console.WriteLine("No NFC reader found. Turn NFC on in Windows settings, or plug in a reader."); return 3; }
        Console.WriteLine("Readers: " + string.Join(", ", readers) + ". Hold a card on the reader (" + secs + " s)...");
        var states = new Pcsc.ReaderState[readers.Count];
        for (int i = 0; i < readers.Count; i++) states[i] = new Pcsc.ReaderState { Reader = readers[i], Current = Pcsc.STATE_UNAWARE, Atr = new byte[36] };
        var end = DateTime.Now.AddSeconds(secs);
        while (DateTime.Now < end)
        {
            int rc = Pcsc.SCardGetStatusChange(c, 1000, states, states.Length);
            if (rc != 0 && rc != Pcsc.E_TIMEOUT) { Console.WriteLine("Reader error 0x" + rc.ToString("X8")); return 4; }
            for (int i = 0; i < readers.Count; i++)
                if ((states[i].Event & Pcsc.STATE_PRESENT) != 0 && (states[i].Event & Pcsc.STATE_MUTE) == 0)
                {
                    string err; var uid = Pcsc.ReadUid(c, readers[i], out err);
                    Console.WriteLine(uid != null ? "Card number: " + uid : "Card seen on " + readers[i] + " but " + err + ".");
                    return uid != null ? 0 : 5;
                }
            for (int i = 0; i < states.Length; i++) states[i].Current = states[i].Event & ~Pcsc.STATE_CHANGED;
        }
        Console.WriteLine("No card within " + secs + " s.");
        return 1;
    }
}
