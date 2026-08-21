import UIKit
import Capacitor

/**
 * Registers local native plugins that are not npm packages.
 * Capacitor only auto-loads classes listed in packageClassList that also
 * conform to CAPBridgedPlugin — we register explicitly for reliability.
 *
 * Also hardens iOS status-bar / safe-area behavior for the remote WebView:
 * `ios.contentInset: automatic` left a compositor gap above CSS where feed
 * images painted during scroll. We force `.never` + an opaque native cover.
 */
class AppViewController: CAPBridgeViewController {
    private var captureOverlay: UIView?
    private var statusBarCover: UIView?

    /// Brand header navy (#11192B) — must match --header-brand-bg.
    private static let brandStatusBarColor = UIColor(
        red: 17.0 / 255.0,
        green: 25.0 / 255.0,
        blue: 43.0 / 255.0,
        alpha: 1.0
    )

    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(NativeAppleSignInPlugin())
        bridge?.registerPluginInstance(NativeGeolocationPlugin())
        hardenWebViewSafeArea()
        installStatusBarCover()
        setupScreenCaptureProtection()
    }

    override open func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        // Keep cover above WKWebView after Capacitor re-parents subviews.
        if let cover = statusBarCover {
            view.bringSubviewToFront(cover)
        }
        if let capture = captureOverlay {
            view.bringSubviewToFront(capture)
        }
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    /// Match Safari: no UIScrollView safe-area inset adjustment. CSS owns padding.
    private func hardenWebViewSafeArea() {
        guard let webView else { return }
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.contentInset = .zero
        webView.scrollView.scrollIndicatorInsets = .zero
        webView.scrollView.automaticallyAdjustsScrollIndicatorInsets = false
        webView.clipsToBounds = true
        webView.scrollView.clipsToBounds = true
        webView.backgroundColor = Self.brandStatusBarColor
        webView.scrollView.backgroundColor = Self.brandStatusBarColor
    }

    /// Opaque native paint from y=0 through the top safe-area — outside CSS.
    /// Guarantees feed GPU layers cannot show under the clock/battery.
    private func installStatusBarCover() {
        guard statusBarCover == nil else { return }
        let cover = UIView()
        cover.translatesAutoresizingMaskIntoConstraints = false
        cover.backgroundColor = Self.brandStatusBarColor
        cover.isUserInteractionEnabled = false
        cover.accessibilityIdentifier = "nahaber.statusBarCover"
        view.addSubview(cover)
        NSLayoutConstraint.activate([
            cover.topAnchor.constraint(equalTo: view.topAnchor),
            cover.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            cover.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            cover.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
        ])
        view.bringSubviewToFront(cover)
        statusBarCover = cover
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
