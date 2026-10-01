import SwiftUI
import UniformTypeIdentifiers
import WebKit

/// WKWebView 편집기를 감싸고 Swift <-> JS 를 연결한다. 웹뷰는 하나를 모든 메모가 공유한다.
@MainActor
final class EditorController: NSObject, ObservableObject, WKScriptMessageHandler, WKNavigationDelegate {
    static let shared = EditorController()

    let webView: WKWebView
    private var ready = false
    private var queue: [String] = []

    override private init() {
        let cfg = WKWebViewConfiguration()
        webView = WKWebView(frame: .zero, configuration: cfg)
        super.init()
        cfg.userContentController.add(self, name: "memo")
        webView.navigationDelegate = self
        webView.setValue(false, forKey: "drawsBackground")
        webView.loadHTMLString(editorHTML, baseURL: nil)
    }

    private func run(_ js: String) {
        if ready { webView.evaluateJavaScript(js) } else { queue.append(js) }
    }

    private func lit(_ s: String) -> String {
        String(data: try! JSONEncoder().encode(s), encoding: .utf8)!
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        ready = true
        queue.forEach { webView.evaluateJavaScript($0) }
        queue.removeAll()
    }

    func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let m = message.body as? [String: Any], m["type"] as? String == "change",
              let idStr = m["id"] as? String, let id = UUID(uuidString: idStr),
              let html = m["html"] as? String, let text = m["text"] as? String else { return }
        let preview = text.split(whereSeparator: \.isWhitespace).joined(separator: " ")
        NoteStore.shared.update(id) { $0.html = html; $0.preview = String(preview.prefix(80)) }
    }

    // MARK: 명령
    func load(_ n: Note) {
        run("App.load({id:\(lit(n.id.uuidString)),html:\(lit(n.html)),color:\(lit(n.color))})")
    }
    func setColor(_ hex: String) { run("App.setColor(\(lit(hex)))") }
    func flush(completion: (() -> Void)? = nil) {
        guard ready else { completion?(); return }
        webView.evaluateJavaScript("App.flush()") { _, _ in completion?() }
    }
    func cmd(_ name: String) { run("App.cmd(\(lit(name)))") }
    func heading() { run("App.heading()") }
    func checklist() { run("App.checklist()") }
    func table(_ op: String) { run("App.table.\(op)") }

    func pickImage() {
        let p = NSOpenPanel()
        p.allowedContentTypes = [.image]
        p.allowsMultipleSelection = true
        guard p.runModal() == .OK else { return }
        for url in p.urls {
            guard let data = try? Data(contentsOf: url) else { continue }
            let mime = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "image/png"
            run("App.addDataURL(\(lit("data:\(mime);base64," + data.base64EncodedString())),\(lit(mime)))")
        }
    }
}

struct EditorWebView: NSViewRepresentable {
    func makeNSView(context: Context) -> WKWebView { EditorController.shared.webView }
    func updateNSView(_ v: WKWebView, context: Context) {}
}
