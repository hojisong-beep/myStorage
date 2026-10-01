import Foundation

// MyMemo MCP 서버 (stdio, JSON-RPC). 메모 JSON 파일을 직접 읽고 쓰며, 실행 중인 앱이 변경을 감지해 반영한다.

typealias JSON = [String: Any]

let dir: URL = {
    if let p = ProcessInfo.processInfo.environment["MYMEMO_DIR"] { return URL(fileURLWithPath: p, isDirectory: true) }
    return FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("MyMemo/notes", isDirectory: true)
}()
try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)

let colorNames: [String: String] = [
    "yellow": "#FFF7B0", "pink": "#FFD6E0", "orange": "#FFE0B8", "green": "#D5F5C8",
    "mint": "#CFF5EA", "blue": "#D0E8FF", "purple": "#E4D8FF", "gray": "#EDEDEF",
]
let iso = ISO8601DateFormatter()

// MARK: 저장소
func fileURL(_ id: String) -> URL { dir.appendingPathComponent("\(id).json") }

func loadAll() -> [JSON] {
    let files = (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? []
    return files.filter { $0.pathExtension == "json" }.compactMap {
        (try? JSONSerialization.jsonObject(with: Data(contentsOf: $0))) as? JSON
    }.sorted { ($0["updated"] as? String ?? "") > ($1["updated"] as? String ?? "") }
}

func find(_ key: String) throws -> JSON {
    let all = loadAll()
    let k = key.lowercased()
    if let n = all.first(where: { ($0["id"] as? String)?.lowercased() == k }) { return n }
    let m = all.filter { ($0["id"] as? String)?.lowercased().hasPrefix(k) == true }
    if m.count == 1 { return m[0] }
    throw Failure("메모를 찾을 수 없습니다: \(key)" + (m.count > 1 ? " (id 가 모호함)" : ""))
}

func save(_ n: JSON) throws {
    var n = n
    n["updated"] = iso.string(from: Date())
    n["preview"] = String(plain(n["html"] as? String ?? "").split(whereSeparator: \.isWhitespace).joined(separator: " ").prefix(80))
    let data = try JSONSerialization.data(withJSONObject: n, options: [.withoutEscapingSlashes])
    try data.write(to: fileURL(n["id"] as! String), options: .atomic)
}

struct Failure: Error { let msg: String; init(_ m: String) { msg = m } }

// MARK: Markdown -> HTML (앱 편집기가 쓰는 HTML)
func esc(_ s: String) -> String {
    s.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;").replacingOccurrences(of: ">", with: "&gt;")
}

func inline(_ raw: String) -> String {
    var s = esc(raw)
    let rules: [(String, String)] = [
        ("`([^`]+)`", "<code>$1</code>"),
        ("\\*\\*([^*]+)\\*\\*", "<b>$1</b>"),
        ("(?<![\\w*])\\*([^*\\s][^*]*)\\*(?![\\w*])", "<i>$1</i>"),
        ("~~([^~]+)~~", "<strike>$1</strike>"),
        ("\\[([^\\]]+)\\]\\((https?://[^)\\s]+)\\)", "<a href=\"$2\">$1</a>"),
    ]
    for (pat, rep) in rules {
        s = s.replacingOccurrences(of: pat, with: rep, options: .regularExpression)
    }
    return s
}

func markdownToHTML(_ md: String) -> String {
    let lines = md.replacingOccurrences(of: "\r\n", with: "\n").components(separatedBy: "\n")
    var out = ""
    var i = 0
    var list: String?   // "ul" | "ol"
    func closeList() { if let l = list { out += "</\(l)>"; list = nil } }
    func isRow(_ l: String) -> Bool { l.trimmingCharacters(in: .whitespaces).hasPrefix("|") }
    func cells(_ l: String) -> [String] {
        var t = l.trimmingCharacters(in: .whitespaces)
        if t.hasPrefix("|") { t.removeFirst() }
        if t.hasSuffix("|") { t.removeLast() }
        return t.components(separatedBy: "|").map { $0.trimmingCharacters(in: .whitespaces) }
    }
    while i < lines.count {
        let line = lines[i]
        let t = line.trimmingCharacters(in: .whitespaces)
        if t.hasPrefix("```") {
            closeList()
            var code: [String] = []
            i += 1
            while i < lines.count, !lines[i].trimmingCharacters(in: .whitespaces).hasPrefix("```") { code.append(lines[i]); i += 1 }
            out += "<pre>\(esc(code.joined(separator: "\n")))</pre>"
        } else if isRow(line) {
            closeList()
            var rows: [[String]] = []
            while i < lines.count, isRow(lines[i]) {
                let c = cells(lines[i])
                if !c.allSatisfy({ $0.range(of: "^:?-{2,}:?$", options: .regularExpression) != nil }) { rows.append(c) }
                i += 1
            }
            i -= 1
            let w = rows.map(\.count).max() ?? 0
            out += "<table><tbody>" + rows.map { r in
                "<tr>" + (0..<w).map { c in "<td>" + (c < r.count && !r[c].isEmpty ? inline(r[c]) : "<br>") + "</td>" }.joined() + "</tr>"
            }.joined() + "</tbody></table><div><br></div>"
        } else if let m = t.range(of: "^#{1,6} ", options: .regularExpression) {
            closeList()
            out += "<h2>\(inline(String(t[m.upperBound...])))</h2>"
        } else if let m = t.range(of: "^[-*] \\[[ xX]\\] ", options: .regularExpression) {
            closeList()
            let checked = t[m].contains { $0 == "x" || $0 == "X" }
            out += "<div><input type=\"checkbox\"\(checked ? " checked=\"\"" : "")>&nbsp;\(inline(String(t[m.upperBound...])))</div>"
        } else if let m = t.range(of: "^[-*] ", options: .regularExpression) {
            if list != "ul" { closeList(); out += "<ul>"; list = "ul" }
            out += "<li>\(inline(String(t[m.upperBound...])))</li>"
        } else if let m = t.range(of: "^\\d+[.)] ", options: .regularExpression) {
            if list != "ol" { closeList(); out += "<ol>"; list = "ol" }
            out += "<li>\(inline(String(t[m.upperBound...])))</li>"
        } else if t.isEmpty {
            closeList()
        } else {
            closeList()
            out += "<div>\(inline(t))</div>"
        }
        i += 1
    }
    closeList()
    return out
}

// MARK: HTML -> 읽기용 텍스트(마크다운 비슷하게)
func plain(_ html: String) -> String {
    var s = html
    func sub(_ p: String, _ r: String) { s = s.replacingOccurrences(of: p, with: r, options: [.regularExpression, .caseInsensitive]) }
    sub("<input[^>]*checked[^>]*>(&nbsp;)?", "[x] ")
    sub("<input[^>]*type=\"checkbox\"[^>]*>(&nbsp;)?", "[ ] ")
    sub("<img[^>]*>", "[이미지]")
    sub("<tr[^>]*>", "| ")
    sub("</td>", " | ")
    sub("</tr>", "\n")
    sub("<h2[^>]*>", "## ")
    sub("<li[^>]*>", "- ")
    sub("<br\\s*/?>", "\n")
    sub("</(div|h2|li|p|pre|ul|ol|table)>", "\n")
    sub("<[^>]+>", "")
    for (a, b) in [("&nbsp;", " "), ("&lt;", "<"), ("&gt;", ">"), ("&quot;", "\""), ("&amp;", "&")] {
        s = s.replacingOccurrences(of: a, with: b)
    }
    sub("\n{3,}", "\n\n")
    return s.trimmingCharacters(in: .whitespacesAndNewlines)
}

func describe(_ n: JSON) -> String {
    let t = (n["title"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "(제목 없음)"
    return "\(n["id"] as? String ?? "?")  \(n["pinned"] as? Bool == true ? "📌 " : "")\(t)  [\(n["updated"] as? String ?? "")]"
}

func resolveColor(_ s: String) throws -> String {
    if let h = colorNames[s.lowercased()] { return h }
    if s.range(of: "^#[0-9a-fA-F]{6}$", options: .regularExpression) != nil { return s.uppercased() }
    throw Failure("color 는 \(colorNames.keys.sorted().joined(separator: "/")) 중 하나이거나 #RRGGBB 형식이어야 합니다.")
}

// MARK: 도구
func str(_ a: JSON, _ k: String) -> String? { a[k] as? String }
func req(_ a: JSON, _ k: String) throws -> String {
    guard let v = str(a, k) else { throw Failure("'\(k)' 인자가 필요합니다.") }
    return v
}

let tools: [(name: String, desc: String, props: JSON, required: [String], run: (JSON) throws -> String)] = [
    ("list_notes", "메모 목록(id, 제목, 수정 시각). 최근 수정순, 고정 메모 포함.", [:], [], { _ in
        let all = loadAll()
        return all.isEmpty ? "메모가 없습니다." : all.map(describe).joined(separator: "\n")
    }),
    ("search_notes", "제목과 본문에서 텍스트를 검색한다.", ["query": ["type": "string"]], ["query"], { a in
        let q = try req(a, "query").lowercased()
        let r = loadAll().filter { (($0["title"] as? String ?? "") + "\n" + plain($0["html"] as? String ?? "")).lowercased().contains(q) }
        return r.isEmpty ? "검색 결과 없음" : r.map(describe).joined(separator: "\n")
    }),
    ("read_note", "메모 하나의 제목·색·본문을 읽는다. 본문은 마크다운 비슷한 텍스트(표는 | 로 구분, 이미지는 [이미지]). id 는 앞부분만 써도 된다.", ["id": ["type": "string"]], ["id"], { a in
        let n = try find(try req(a, "id"))
        return "id: \(n["id"] as! String)\n제목: \(n["title"] as? String ?? "")\n색: \(n["color"] as? String ?? "")\n고정: \(n["pinned"] as? Bool ?? false)\n\n\(plain(n["html"] as? String ?? ""))"
    }),
    ("create_note", "새 메모를 만든다. content 는 마크다운(제목 #, 목록 -, 체크리스트 - [ ], 표 |, **굵게**, *기울임*, 코드 ```).", [
        "title": ["type": "string"], "content": ["type": "string", "description": "마크다운 본문"],
        "color": ["type": "string", "description": "yellow/pink/orange/green/mint/blue/purple/gray 또는 #RRGGBB"],
        "pinned": ["type": "boolean"],
    ], ["title"], { a in
        let id = UUID().uuidString
        let now = iso.string(from: Date())
        var n: JSON = ["id": id, "title": try req(a, "title"), "html": markdownToHTML(str(a, "content") ?? ""), "preview": "",
                       "color": try resolveColor(str(a, "color") ?? "yellow"), "pinned": a["pinned"] as? Bool ?? false,
                       "created": now, "updated": now]
        n["id"] = id
        try save(n)
        return "생성됨: \(id)"
    }),
    ("append_to_note", "메모 끝에 마크다운 내용을 덧붙인다. 기존 내용(그림 포함)은 그대로 유지되므로 가장 안전한 편집 방법.", ["id": ["type": "string"], "content": ["type": "string"]], ["id", "content"], { a in
        var n = try find(try req(a, "id"))
        n["html"] = (n["html"] as? String ?? "") + markdownToHTML(try req(a, "content"))
        try save(n)
        return "추가됨: \(n["id"] as! String)"
    }),
    ("replace_note_content", "메모 본문 전체를 마크다운 내용으로 교체한다. 주의: 기존 그림은 사라진다. 먼저 read_note 로 내용을 확인하고, 그림이 있으면 사용자에게 알릴 것.", ["id": ["type": "string"], "content": ["type": "string"]], ["id", "content"], { a in
        var n = try find(try req(a, "id"))
        n["html"] = markdownToHTML(try req(a, "content"))
        try save(n)
        return "교체됨: \(n["id"] as! String)"
    }),
    ("update_note_meta", "메모의 제목, 색, 고정 여부를 바꾼다(본문은 유지).", [
        "id": ["type": "string"], "title": ["type": "string"], "color": ["type": "string"], "pinned": ["type": "boolean"],
    ], ["id"], { a in
        var n = try find(try req(a, "id"))
        if let t = str(a, "title") { n["title"] = t }
        if let c = str(a, "color") { n["color"] = try resolveColor(c) }
        if let p = a["pinned"] as? Bool { n["pinned"] = p }
        try save(n)
        return "수정됨: \(n["id"] as! String)"
    }),
    ("delete_note", "메모를 삭제한다(복구 불가). 사용자가 명시적으로 요청했을 때만 사용.", ["id": ["type": "string"]], ["id"], { a in
        let n = try find(try req(a, "id"))
        try FileManager.default.removeItem(at: fileURL(n["id"] as! String))
        return "삭제됨: \(n["id"] as! String)"
    }),
]

// MARK: JSON-RPC
func send(_ o: JSON) {
    guard let d = try? JSONSerialization.data(withJSONObject: o, options: [.withoutEscapingSlashes]) else { return }
    FileHandle.standardOutput.write(d + Data("\n".utf8))
}

while let line = readLine(strippingNewline: true) {
    guard let d = line.data(using: .utf8), let msg = (try? JSONSerialization.jsonObject(with: d)) as? JSON,
          let method = msg["method"] as? String else { continue }
    guard let id = msg["id"] else { continue }   // 알림은 응답하지 않음
    let params = msg["params"] as? JSON ?? [:]
    switch method {
    case "initialize":
        send(["jsonrpc": "2.0", "id": id, "result": [
            "protocolVersion": params["protocolVersion"] as? String ?? "2025-06-18",
            "capabilities": ["tools": [String: Any]()],
            "serverInfo": ["name": "mymemo", "version": "1.0.0"],
        ] as JSON])
    case "tools/list":
        let list: [JSON] = tools.map { t in
            ["name": t.name, "description": t.desc,
             "inputSchema": ["type": "object", "properties": t.props, "required": t.required] as JSON]
        }
        send(["jsonrpc": "2.0", "id": id, "result": ["tools": list]])
    case "tools/call":
        let name = params["name"] as? String ?? ""
        let args = params["arguments"] as? JSON ?? [:]
        var text: String, isError = false
        if let t = tools.first(where: { $0.name == name }) {
            do { text = try t.run(args) } catch let f as Failure { text = f.msg; isError = true } catch { text = "\(error)"; isError = true }
        } else { text = "알 수 없는 도구: \(name)"; isError = true }
        send(["jsonrpc": "2.0", "id": id, "result": ["content": [["type": "text", "text": text]], "isError": isError] as JSON])
    case "ping":
        send(["jsonrpc": "2.0", "id": id, "result": JSON()])
    default:
        send(["jsonrpc": "2.0", "id": id, "error": ["code": -32601, "message": "Method not found"] as JSON])
    }
}
