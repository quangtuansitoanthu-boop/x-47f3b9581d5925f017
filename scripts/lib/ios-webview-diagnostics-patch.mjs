/*
MIT License

Copyright (c) 2017-present Drifty Co.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

import fs from 'node:fs';
import path from 'node:path';

// Exact Capacitor iOS 7.6.9 callbacks; policy/plugin dispatch is not a patch target.
const callbacks = [
  ['didStart', `    open func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        // Reset the bridge on each navigation
        bridge?.reset()
    }`],
  ['didFinish', `    open func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if case .initialLoad(let isOpaque) = webViewLoadingState {
            webView.isOpaque = isOpaque
            webViewLoadingState = .subsequentLoad
        }
        CAPLog.print("⚡️  WebView loaded")
    }`],
  ['didFail', `    open func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        if case .initialLoad(let isOpaque) = webViewLoadingState {
            webView.isOpaque = isOpaque
            webViewLoadingState = .subsequentLoad
        }

        if let errorURL = bridge?.config.errorPathURL {
            webView.load(URLRequest(url: errorURL))
        }

        CAPLog.print("⚡️  WebView failed to load")
        CAPLog.print("⚡️  Error: " + error.localizedDescription)
    }`],
  ['didFailProvisional', `    open func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if let errorURL = bridge?.config.errorPathURL {
            webView.load(URLRequest(url: errorURL))
        }

        CAPLog.print("⚡️  WebView failed provisional navigation")
        CAPLog.print("⚡️  Error: " + error.localizedDescription)
    }`],
  ['processTerminate', `    open func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        CAPLog.print("⚡️  WebView process terminated")
        bridge?.reset()
        webView.reload()
    }`],
];

const diagnosticHelper = `    #if DEBUG
    private func tuTapWebViewQA(_ phase: String, webView: WKWebView, error: Error? = nil) {
        guard ProcessInfo.processInfo.arguments.contains("-tutam-qa-events"),
              ["didStart", "didCommit", "didFinish", "didFail", "didFailProvisional", "processTerminate"].contains(phase) else { return }
        let url = webView.url
        let schemeClass: String
        if let scheme = url?.scheme {
            schemeClass = ["capacitor", "file", "http", "https"].contains(scheme) ? scheme : "other"
        } else { schemeClass = "none" }
        let pathClass: String
        if let path = url?.path {
            if path.isEmpty || path == "/" { pathClass = "root" }
            else if path == "/tu-tap/chep-kinh" { pathClass = "copy" }
            else { pathClass = "other" }
        } else { pathClass = "none" }
        let domain: String
        let code: Int
        if let nativeError = error as NSError? {
            let allowed = ["WKErrorDomain", "NSURLErrorDomain", "NSCocoaErrorDomain", "NSPOSIXErrorDomain"]
            domain = allowed.contains(nativeError.domain) ? nativeError.domain : "other"
            code = (-999999...999999).contains(nativeError.code) ? nativeError.code : 0
        } else { domain = "none"; code = 0 }
        let process = ProcessInfo.processInfo
        let pid = Int(process.processIdentifier)
        let uptime = process.systemUptime
        guard pid > 0, uptime.isFinite, uptime >= 0 else { return }
        let payload: [String: Any] = [
            "type": "native-navigation", "phase": phase, "pid": pid, "uptime": uptime,
            "schemeClass": schemeClass, "pathClass": pathClass, "domain": domain, "errorCode": code
        ]
        NotificationCenter.default.post(name: Notification.Name("TuTapQANativeDiagnostic"),
            object: nil, userInfo: payload)
    }

    open func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        tuTapWebViewQA("didCommit", webView: webView)
    }
    #endif
`;

const anchor = '    // MARK: - WKNavigationDelegate\n';
const classAnchor = 'open class WebViewDelegationHandler: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, UIScrollViewDelegate {';
const relativeSwift = 'Capacitor/Capacitor/WebViewDelegationHandler.swift';
const occurrences = (source, value) => source.split(value).length - 1;
const patchedCallback = ([phase, source]) => source.replace(' {\n', ' {\n        #if DEBUG\n' +
  `        tuTapWebViewQA("${phase}", webView: webView${phase.startsWith('didFail') ? ', error: error' : ''})\n` +
  '        #endif\n');
const samePath = (left, right) => process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
const inside = (root, file) => {
  const relative = path.relative(root, file);
  return relative !== '' && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
};

function ownedPath(nodeModules, file) {
  const resolved = path.resolve(file);
  if (!inside(nodeModules, resolved)) throw new Error('WebView diagnostics target outside repository node_modules');
  let current = nodeModules;
  for (const part of path.relative(nodeModules, resolved).split(path.sep)) {
    current = path.join(current, part);
    if (fs.lstatSync(current).isSymbolicLink()) throw new Error('WebView diagnostics refuses linked target paths');
  }
  const real = fs.realpathSync(resolved);
  if (!inside(nodeModules, real) || !samePath(real, resolved)) throw new Error('WebView diagnostics realpath outside owned scope');
  return real;
}

/** Passive, DEBUG/explicit-QA-only observations; all original WK callback bodies remain ordered. */
export function patchIosWebViewDiagnostics(packageDirectory = path.resolve('node_modules/@capacitor/ios')) {
  const cwd = path.resolve(process.cwd());
  const root = fs.realpathSync(cwd);
  if (!samePath(cwd, root)) throw new Error('WebView diagnostics refuses linked repository paths');
  const nodeModules = path.join(root, 'node_modules');
  if (fs.lstatSync(nodeModules).isSymbolicLink() || !samePath(fs.realpathSync(nodeModules), nodeModules)) {
    throw new Error('WebView diagnostics refuses linked repository node_modules');
  }
  const directory = ownedPath(nodeModules, packageDirectory);
  const packageFile = ownedPath(nodeModules, path.join(directory, 'package.json'));
  const swiftFile = ownedPath(nodeModules, path.join(directory, relativeSwift));
  const metadata = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
  if (metadata.name !== '@capacitor/ios' || metadata.version !== '7.6.9') {
    throw new Error('Unsupported WebView SDK; expected @capacitor/ios 7.6.9');
  }
  const original = fs.readFileSync(swiftFile, 'utf8');
  const crlf = original.includes('\r\n');
  if (crlf && /(?<!\r)\n/u.test(original)) throw new Error('Unsupported mixed WebView source line endings');
  const source = original.replaceAll('\r\n', '\n');
  const complete = occurrences(source, diagnosticHelper) === 1 && callbacks.every((item) => occurrences(source, patchedCallback(item)) === 1);
  let baseline = source;
  if (complete) {
    baseline = baseline.replace(diagnosticHelper, '');
    for (const item of callbacks) baseline = baseline.replace(patchedCallback(item), item[1]);
  }
  if (occurrences(baseline, classAnchor) !== 1 || occurrences(baseline, anchor) !== 1 ||
      callbacks.some(([, value]) => occurrences(baseline, value) !== 1 || occurrences(baseline, value.split('\n')[0]) !== 1) ||
      baseline.includes('tuTapWebViewQA') || baseline.includes('TuTapQANativeDiagnostic') ||
      /didCommit\s+navigation\s*:/u.test(baseline)) {
    throw new Error('Unsupported partial or unexpected WebView diagnostic source');
  }
  if (complete) return false;
  let updated = source.replace(anchor, anchor + diagnosticHelper);
  for (const item of callbacks) updated = updated.replace(item[1], patchedCallback(item));
  if (crlf) updated = updated.replaceAll('\n', '\r\n');
  const temporary = swiftFile + '.tutam-webview-qa.tmp';
  if (fs.existsSync(temporary)) throw new Error('WebView diagnostics temporary source already exists');
  let created = false;
  try {
    fs.writeFileSync(temporary, updated, { flag: 'wx', mode: fs.statSync(swiftFile).mode & 0o777 });
    created = true;
    fs.renameSync(temporary, swiftFile);
    created = false;
  } finally {
    if (created) fs.unlinkSync(temporary);
  }
  return true;
}
