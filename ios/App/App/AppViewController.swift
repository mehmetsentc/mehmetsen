import UIKit
import Capacitor

/**
 * Registers local native plugins that are not npm packages.
 * Capacitor only auto-loads classes listed in packageClassList that also
 * conform to CAPBridgedPlugin — we register explicitly for reliability.
 */
class AppViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(NativeAppleSignInPlugin())
        bridge?.registerPluginInstance(NativeGeolocationPlugin())
    }
}
