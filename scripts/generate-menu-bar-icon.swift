// Run with: swift scripts/generate-menu-bar-icon.swift
// The same 40-unit heart and cut-out ECG paths as components/AppLogo.tsx.
import AppKit

for scale in [1, 2] {
    let size = 18 * scale
    let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size,
        bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
        colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    let context = NSGraphicsContext(bitmapImageRep: bitmap)!.cgContext
    context.setAllowsAntialiasing(true)
    context.translateBy(x: 0, y: CGFloat(size))
    context.scaleBy(x: CGFloat(size) / 40, y: -CGFloat(size) / 40)
    let heart = CGMutablePath()
    heart.move(to: CGPoint(x: 20, y: 33.9))
    heart.addCurve(to: CGPoint(x: 3.2, y: 13), control1: CGPoint(x: 10.2, y: 25.5), control2: CGPoint(x: 3.2, y: 19.8))
    heart.addCurve(to: CGPoint(x: 11.1, y: 5.1), control1: CGPoint(x: 3.2, y: 8.4), control2: CGPoint(x: 6.8, y: 5.1))
    heart.addCurve(to: CGPoint(x: 20, y: 11), control1: CGPoint(x: 14.7, y: 5.1), control2: CGPoint(x: 17.8, y: 7.5))
    heart.addCurve(to: CGPoint(x: 28.9, y: 5.1), control1: CGPoint(x: 22.2, y: 7.5), control2: CGPoint(x: 25.3, y: 5.1))
    heart.addCurve(to: CGPoint(x: 36.8, y: 13), control1: CGPoint(x: 33.2, y: 5.1), control2: CGPoint(x: 36.8, y: 8.4))
    heart.addCurve(to: CGPoint(x: 20, y: 33.9), control1: CGPoint(x: 36.8, y: 19.8), control2: CGPoint(x: 29.8, y: 25.5))
    heart.closeSubpath()
    context.addPath(heart)
    context.setFillColor(NSColor.black.cgColor)
    context.fillPath()

    let pulse = CGMutablePath()
    pulse.move(to: CGPoint(x: 4.4, y: 18.6))
    for point in [(13.4, 18.6), (16.2, 18.6), (18.6, 11.4), (21.7, 26.0), (24.1, 15.7), (25.9, 18.6), (35.6, 18.6)] {
        pulse.addLine(to: CGPoint(x: point.0, y: point.1))
    }
    context.addPath(pulse)
    context.setBlendMode(.clear)
    context.setLineWidth(3.2)
    context.setLineCap(.round)
    context.setLineJoin(.round)
    context.strokePath()
    let suffix = scale == 1 ? "" : "@2x"
    try bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: "build/menu-barTemplate\(suffix).png"))
}
