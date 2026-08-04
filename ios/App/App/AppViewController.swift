import UIKit
import Capacitor

/**
 * Registers local native plugins that are not npm packages.
 * Capacitor only auto-loads classes listed in packageClassList that also
 * conform to CAPBridgedPlugin — we register explicitly for reliability.
 */
class AppViewController: CAPBridgeViewController {
    private var captureOverlay: UIView?

    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(NativeAppleSignInPlugin())
        bridge?.registerPluginInstance(NativeGeolocationPlugin())
        setupScreenCaptureProtection()
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    /// Best-effort: blank the UI while the screen is being recorded/mirrored.
    /// iOS cannot prevent screenshots; this only covers capture/mirroring sessions.
    private func setupScreenCaptureProtection() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(updateCaptureOverlay),
            name: UIScreen.capturedDidChangeNotification,
            object: nil
        )
        updateCaptureOverlay()
    }

    @objc private func updateCaptureOverlay() {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            if UIScreen.main.isCaptured {
                self.showCaptureOverlay()
            } else {
                self.hideCaptureOverlay()
            }
        }
    }

    private func showCaptureOverlay() {
        guard captureOverlay == nil else { return }
        let overlay = UIView(frame: view.bounds)
        overlay.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        overlay.backgroundColor = .black
        overlay.isUserInteractionEnabled = true
        view.addSubview(overlay)
        captureOverlay = overlay
    }

    private func hideCaptureOverlay() {
        captureOverlay?.removeFromSuperview()
        captureOverlay = nil
    }
}
