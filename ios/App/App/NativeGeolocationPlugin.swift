import Foundation
import Capacitor
import CoreLocation

/**
 * NativeGeolocationPlugin — CLLocationManager üzerinden doğrudan iOS izin dialogu açar.
 *
 * navigator.geolocation, Capacitor remote-URL modunda WKWebView üzerinden geçer ve
 * iOS 17+ cihazlarda WKUIDelegate gereksinimi nedeniyle sessizce başarısız olabilir.
 * Bu plugin CLLocationManager.requestWhenInUseAuthorization() çağırarak native dialog'u
 * garantilemek için kullanılır.
 */
@objc(NativeGeolocationPlugin)
public class NativeGeolocationPlugin: CAPPlugin, CLLocationManagerDelegate {

    private var locationManager: CLLocationManager?
    private var permissionCall: CAPPluginCall?

    // MARK: - Permission Request

    @objc func requestPermission(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else {
                call.reject("Plugin deallocated", "PLUGIN_ERROR")
                return
            }

            let status = CLLocationManager.authorizationStatus()

            switch status {
            case .authorizedWhenInUse, .authorizedAlways:
                call.resolve(["status": "granted"])
                return
            case .denied, .restricted:
                call.resolve(["status": "denied"])
                return
            default: // .notDetermined
                break
            }

            // Not determined — show native dialog
            self.permissionCall = call
            let mgr = CLLocationManager()
            mgr.delegate = self
            self.locationManager = mgr
            mgr.requestWhenInUseAuthorization()
        }
    }

    // MARK: - CLLocationManagerDelegate

    public func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        guard let call = permissionCall else { return }
        permissionCall = nil

        let status = manager.authorizationStatus
        switch status {
        case .authorizedWhenInUse, .authorizedAlways:
            call.resolve(["status": "granted"])
        case .denied, .restricted:
            call.resolve(["status": "denied"])
        default:
            call.resolve(["status": "prompt"])
        }
        locationManager = nil
    }

    // Eski iOS (<14) için fallback
    public func locationManager(_ manager: CLLocationManager, didChangeAuthorization status: CLAuthorizationStatus) {
        locationManagerDidChangeAuthorization(manager)
    }
}
