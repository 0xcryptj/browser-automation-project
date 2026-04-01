using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Text;
using System.Web.Script.Serialization;

internal static class BrowserAutomationNativeHost
{
    private static readonly JavaScriptSerializer Json = new JavaScriptSerializer();

    private static string ExecutableDirectory
    {
        get { return Path.GetDirectoryName(Process.GetCurrentProcess().MainModule.FileName); }
    }

    private static string RepoRoot
    {
        get { return Path.GetFullPath(Path.Combine(ExecutableDirectory, "..", "..")); }
    }

    private static string RuntimeDirectory
    {
        get { return Path.Combine(RepoRoot, "packages", "runner", ".local"); }
    }

    private static string LogPath
    {
        get { return Path.Combine(RuntimeDirectory, "runner-autostart.log"); }
    }

    private static int Main()
    {
        try
        {
            Directory.CreateDirectory(RuntimeDirectory);
            var message = ReadNativeMessage();
            var type = GetString(message, "type");

            if (string.Equals(type, "ensure-runner", StringComparison.OrdinalIgnoreCase))
            {
                var runnerBaseUrl = GetString(message, "runnerBaseUrl");
                if (string.IsNullOrWhiteSpace(runnerBaseUrl))
                {
                    runnerBaseUrl = "http://127.0.0.1:3000";
                }

                WriteNativeMessage(EnsureRunner(runnerBaseUrl));
                return 0;
            }

            if (string.Equals(type, "ensure-browser-attach", StringComparison.OrdinalIgnoreCase))
            {
                var browser = GetString(message, "browser");
                if (!string.Equals(browser, "chrome", StringComparison.OrdinalIgnoreCase) &&
                    !string.Equals(browser, "brave", StringComparison.OrdinalIgnoreCase))
                {
                    browser = "brave";
                }

                var cdpUrl = GetString(message, "cdpUrl");
                if (string.IsNullOrWhiteSpace(cdpUrl))
                {
                    cdpUrl = "http://127.0.0.1:9222";
                }

                WriteNativeMessage(EnsureBrowserAttach(browser, cdpUrl));
                return 0;
            }

            WriteNativeMessage(MakeObject(
                "ok", false,
                "error", string.Format("Unsupported native host command: {0}", type ?? "unknown"),
                "logPath", LogPath
            ));
            return 1;
        }
        catch (Exception ex)
        {
            WriteNativeMessage(MakeObject(
                "ok", false,
                "error", ex.Message,
                "logPath", LogPath
            ));
            return 1;
        }
    }

    private static Dictionary<string, object> ReadNativeMessage()
    {
        using (var stdin = Console.OpenStandardInput())
        {
            var header = new byte[4];
            ReadExact(stdin, header, 4);
            var length = BitConverter.ToInt32(header, 0);
            var body = new byte[length];
            ReadExact(stdin, body, length);
            var json = Encoding.UTF8.GetString(body);
            return Json.Deserialize<Dictionary<string, object>>(json) ?? new Dictionary<string, object>();
        }
    }

    private static void WriteNativeMessage(object payload)
    {
        var json = Json.Serialize(payload);
        var body = Encoding.UTF8.GetBytes(json);
        var header = BitConverter.GetBytes(body.Length);
        using (var stdout = Console.OpenStandardOutput())
        {
            stdout.Write(header, 0, header.Length);
            stdout.Write(body, 0, body.Length);
            stdout.Flush();
        }
    }

    private static void ReadExact(Stream stream, byte[] buffer, int length)
    {
        var offset = 0;
        while (offset < length)
        {
            var read = stream.Read(buffer, offset, length - offset);
            if (read <= 0)
            {
                throw new EndOfStreamException("Could not read the full native messaging payload.");
            }

            offset += read;
        }
    }

    private static Dictionary<string, object> EnsureRunner(string runnerBaseUrl)
    {
        try
        {
            var health = FetchJson(string.Format("{0}/health", TrimTrailingSlash(runnerBaseUrl)));
            return MakeObject(
                "ok", true,
                "launched", false,
                "health", health,
                "logPath", LogPath
            );
        }
        catch
        {
            // continue to launch
        }

        LaunchRunner(runnerBaseUrl);
        var result = WaitForJson(string.Format("{0}/health", TrimTrailingSlash(runnerBaseUrl)), 20000);

        return MakeObject(
            "ok", true,
            "launched", true,
            "health", result,
            "logPath", LogPath
        );
    }

    private static Dictionary<string, object> EnsureBrowserAttach(string browser, string cdpUrl)
    {
        try
        {
            var version = WaitForJson(string.Format("{0}/json/version", TrimTrailingSlash(cdpUrl)), 1500);
            return MakeObject(
                "ok", true,
                "launched", false,
                "browser", browser,
                "cdpUrl", cdpUrl,
                "connected", version,
                "logPath", LogPath
            );
        }
        catch
        {
            // continue to restart
        }

        StopBrowserProcesses(browser);
        System.Threading.Thread.Sleep(1200);
        var executable = LaunchBrowserForAttach(browser, cdpUrl);
        var connected = WaitForJson(string.Format("{0}/json/version", TrimTrailingSlash(cdpUrl)), 20000);

        return MakeObject(
            "ok", true,
            "launched", true,
            "browser", browser,
            "cdpUrl", cdpUrl,
            "executable", executable,
            "connected", connected,
            "logPath", LogPath
        );
    }

    private static void LaunchRunner(string runnerBaseUrl)
    {
        var port = SafePort(runnerBaseUrl);
        var nodeExe = ResolveNodeExecutable();
        var runnerArgs = ResolveRunnerArguments();
        Directory.CreateDirectory(RuntimeDirectory);
        File.AppendAllText(
            LogPath,
            string.Format(
                "[{0}] launching runner silently: {1} {2}{3}",
                DateTime.Now.ToString("O"),
                nodeExe,
                runnerArgs,
                Environment.NewLine
            )
        );
        var startInfo = new ProcessStartInfo
        {
            FileName = nodeExe,
            Arguments = runnerArgs,
            WorkingDirectory = RepoRoot,
            UseShellExecute = false,
            CreateNoWindow = true,
            WindowStyle = ProcessWindowStyle.Hidden,
        };

        startInfo.EnvironmentVariables["RUNNER_PORT"] = port;
        var process = new Process { StartInfo = startInfo, EnableRaisingEvents = false };
        if (!process.Start())
        {
            throw new InvalidOperationException("The local runner process could not be started.");
        }
    }

    private static void StopBrowserProcesses(string browser)
    {
        var processNames = string.Equals(browser, "brave", StringComparison.OrdinalIgnoreCase)
            ? new[] { "brave.exe", "BraveCrashHandler.exe", "BraveCrashHandler64.exe" }
            : new[] { "chrome.exe" };

        foreach (var processName in processNames)
        {
            try
            {
                var stop = new ProcessStartInfo
                {
                    FileName = "taskkill.exe",
                    Arguments = string.Format("/IM {0} /F /T", processName),
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    WindowStyle = ProcessWindowStyle.Hidden,
                };
                using (var process = Process.Start(stop))
                {
                    if (process != null)
                    {
                        process.WaitForExit(4000);
                    }
                }
            }
            catch
            {
                // Ignore missing or protected processes.
            }
        }
    }

    private static string LaunchBrowserForAttach(string browser, string cdpUrl)
    {
        var executable = ResolveBrowserExecutable(browser);
        if (string.IsNullOrWhiteSpace(executable))
        {
            throw new InvalidOperationException(
                string.Equals(browser, "brave", StringComparison.OrdinalIgnoreCase)
                    ? "Could not find Brave. Install Brave or set BRAVE_PATH before using attach mode."
                    : "Could not find Chrome. Install Chrome or set CHROME_PATH before using attach mode."
            );
        }

        var port = SafePort(cdpUrl, "9222");
        var startInfo = new ProcessStartInfo
        {
            FileName = executable,
            Arguments = string.Format("--remote-debugging-port={0} --new-window about:blank", port),
            WorkingDirectory = RepoRoot,
            UseShellExecute = false,
            CreateNoWindow = false,
            WindowStyle = ProcessWindowStyle.Normal,
        };

        Process.Start(startInfo);
        return executable;
    }

    private static string ResolveNodeExecutable()
    {
        var candidates = new[]
        {
            Environment.GetEnvironmentVariable("NODE_PATH"),
            @"C:\Program Files\nodejs\node.exe",
            @"C:\Program Files (x86)\nodejs\node.exe",
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "nodejs", "node.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "nodejs", "node.exe"),
        };

        foreach (var candidate in candidates)
        {
            if (!string.IsNullOrWhiteSpace(candidate) && File.Exists(candidate))
            {
                return candidate;
            }
        }

        throw new InvalidOperationException("Could not find node.exe for silent runner startup.");
    }

    private static string ResolveRunnerArguments()
    {
        var compiledEntry = Path.Combine(RepoRoot, "packages", "runner", "dist", "index.js");
        if (File.Exists(compiledEntry))
        {
            return string.Format("\"{0}\"", compiledEntry);
        }

        var sourceEntry = Path.Combine(RepoRoot, "packages", "runner", "src", "index.ts");
        if (File.Exists(sourceEntry))
        {
            var tsxCli = ResolveTsxCli();
            return string.Format("\"{0}\" \"{1}\"", tsxCli, sourceEntry);
        }

        throw new InvalidOperationException("Could not find a compiled runner entry point for silent startup.");
    }

    private static string ResolveTsxCli()
    {
        var candidates = new[]
        {
            Path.Combine(RepoRoot, "node_modules", ".pnpm", "tsx@4.21.0", "node_modules", "tsx", "dist", "cli.mjs"),
            Path.Combine(RepoRoot, "node_modules", "tsx", "dist", "cli.mjs"),
        };

        foreach (var candidate in candidates)
        {
            if (File.Exists(candidate))
            {
                return candidate;
            }
        }

        throw new InvalidOperationException("Could not find tsx cli.mjs for silent runner startup fallback.");
    }

    private static Dictionary<string, object> WaitForJson(string url, int timeoutMs)
    {
        var startedAt = Environment.TickCount;
        Exception lastError = null;

        while (Environment.TickCount - startedAt < timeoutMs)
        {
            try
            {
                return FetchJson(url);
            }
            catch (Exception ex)
            {
                lastError = ex;
                System.Threading.Thread.Sleep(1000);
            }
        }

        throw new InvalidOperationException(lastError != null ? lastError.Message : "Timed out waiting for endpoint.");
    }

    private static Dictionary<string, object> FetchJson(string url)
    {
        var request = (HttpWebRequest)WebRequest.Create(url);
        request.Method = "GET";
        request.Timeout = 2000;
        request.ReadWriteTimeout = 2000;

        using (var response = (HttpWebResponse)request.GetResponse())
        using (var stream = response.GetResponseStream())
        using (var reader = new StreamReader(stream))
        {
          var json = reader.ReadToEnd();
          return Json.Deserialize<Dictionary<string, object>>(json) ?? new Dictionary<string, object>();
        }
    }

    private static string ResolveBrowserExecutable(string browser)
    {
        var candidates = string.Equals(browser, "brave", StringComparison.OrdinalIgnoreCase)
            ? new[]
            {
                Environment.GetEnvironmentVariable("BRAVE_PATH"),
                @"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe",
                @"C:\Program Files (x86)\BraveSoftware\Brave-Browser\Application\brave.exe",
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
            }
            : new[]
            {
                Environment.GetEnvironmentVariable("CHROME_PATH"),
                @"C:\Program Files\Google\Chrome\Application\chrome.exe",
                @"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Google", "Chrome", "Application", "chrome.exe"),
            };

        foreach (var candidate in candidates)
        {
            if (!string.IsNullOrWhiteSpace(candidate) && File.Exists(candidate))
            {
                return candidate;
            }
        }

        return null;
    }

    private static string SafePort(string rawUrl, string fallback = "3000")
    {
        try
        {
            var uri = new Uri(rawUrl);
            return uri.Port > 0 ? uri.Port.ToString() : fallback;
        }
        catch
        {
            return fallback;
        }
    }

    private static string TrimTrailingSlash(string url)
    {
        return url.TrimEnd('/');
    }

    private static string GetString(Dictionary<string, object> message, string key)
    {
        if (message == null || !message.ContainsKey(key) || message[key] == null)
        {
            return null;
        }

        return Convert.ToString(message[key]);
    }

    private static Dictionary<string, object> MakeObject(params object[] parts)
    {
        var result = new Dictionary<string, object>();
        for (var index = 0; index + 1 < parts.Length; index += 2)
        {
            result[Convert.ToString(parts[index])] = parts[index + 1];
        }

        return result;
    }
}
