import AppKit

let out = CommandLine.arguments[1]
try? FileManager.default.createDirectory(atPath: out, withIntermediateDirectories: true)

func render(_ px: Int) -> Data {
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: px, pixelsHigh: px, bitsPerSample: 8,
                               samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                               colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    let s = CGFloat(px)
    let rect = NSRect(x: s * 0.08, y: s * 0.08, width: s * 0.84, height: s * 0.84)
    let path = NSBezierPath(roundedRect: rect, xRadius: s * 0.18, yRadius: s * 0.18)
    NSGradient(starting: NSColor(red: 1, green: 0.96, blue: 0.62, alpha: 1),
               ending: NSColor(red: 1, green: 0.88, blue: 0.45, alpha: 1))!.draw(in: path, angle: -90)
    NSColor(red: 0.55, green: 0.42, blue: 0.1, alpha: 0.55).setFill()
    for i in 0..<3 {
        let w = s * (i == 2 ? 0.30 : 0.50)
        let r = NSRect(x: s * 0.25, y: s * (0.66 - 0.17 * CGFloat(i)), width: w, height: s * 0.045)
        NSBezierPath(roundedRect: r, xRadius: s * 0.02, yRadius: s * 0.02).fill()
    }
    NSGraphicsContext.restoreGraphicsState()
    return rep.representation(using: .png, properties: [:])!
}

for base in [16, 32, 128, 256, 512] {
    try! render(base).write(to: URL(fileURLWithPath: "\(out)/icon_\(base)x\(base).png"))
    try! render(base * 2).write(to: URL(fileURLWithPath: "\(out)/icon_\(base)x\(base)@2x.png"))
}
