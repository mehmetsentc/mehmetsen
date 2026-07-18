import Foundation
import Capacitor
import AuthenticationServices
import CryptoKit

// MARK: - AppleSignInPresentationViewController
//
// Transparent UIViewController that presents ASAuthorizationController from viewDidAppear.
// This ensures performRequests() is called from a true UIKit lifecycle event rather than
// a WKWebView JavaScript callback — which is the root cause of ASAuthorizationError.notInteractive
// (code 1004) on iPad with iPadOS 26.
//
private class AppleSignInPresentationViewController: UIViewController,
    ASAuthorizationControllerDelegate,
    ASAuthorizationControllerPresentationContextProviding {

    var rawNonce: String = ""
    var onSuccess: (([String: Any]) -> Void)?
    var onFailure: ((Error) -> Void)?

    private var authController: ASAuthorizationController?

    override func viewDidLoad() {
        super.viewDidLoad()
        // Nearly transparent — user sees the existing UI beneath
        view.backgroundColor = UIColor.black.withAlphaComponent(0.01)
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        // Called from UIKit lifecycle → proper interactive context on all iPadOS versions
        startAppleSignIn()
    }

    private func startAppleSignIn() {
        let provider = ASAuthorizationAppleIDProvider()
        let request = provider.createRequest()
        request.requestedScopes = [.fullName, .email]
        request.nonce = sha256(rawNonce)

        let ctrl = ASAuthorizationController(authorizationRequests: [request])
        ctrl.delegate = self
        ctrl.presentationContextProvider = self
        self.authController = ctrl
        ctrl.performRequests()
    }

    // MARK: - ASAuthorizationControllerPresentationContextProviding

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        // At this point we are a fully presented UIViewController — view.window is guaranteed.
        if let w = view.window { return w }
        // Fallback: foreground active scene
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        if let scene = scenes.first(where: { $0.activationState == .foregroundActive }),
           let w = scene.keyWindow ?? scene.windows.first(where: { !$0.isHidden }) {
            return w
        }
        return UIWindow()
    }

    // MARK: - ASAuthorizationControllerDelegate

    func authorizationController(controller: ASAuthorizationController,
                                  didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let cred = authorization.credential as? ASAuthorizationAppleIDCredential else {
            onFailure?(ASAuthorizationError(.failed))
            return
        }
        guard
            let tokenData = cred.identityToken,
            let identityToken = String(data: tokenData, encoding: .utf8)
        else {
            onFailure?(ASAuthorizationError(.invalidResponse))
            return
        }

        var result: [String: Any] = [
            "user": cred.user,
            "identityToken": identityToken,
            "nonce": rawNonce,
        ]
        if let authCodeData = cred.authorizationCode,
           let authCode = String(data: authCodeData, encoding: .utf8) {
            result["authorizationCode"] = authCode
        }
        if let email = cred.email { result["email"] = email }
        if let name = cred.fullName {
            result["givenName"] = name.givenName ?? ""
            result["familyName"] = name.familyName ?? ""
        }
        onSuccess?(result)
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        onFailure?(error)
    }

    // MARK: - Helpers

    private func sha256(_ input: String) -> String {
        let data = Data(input.utf8)
        let hash = SHA256.hash(data: data)
        return hash.compactMap { String(format: "%02x", $0) }.joined()
    }
}

// MARK: - NativeAppleSignInPlugin

@objc(NativeAppleSignInPlugin)
public class NativeAppleSignInPlugin: CAPPlugin {

    private var signInCall: CAPPluginCall?

    // MARK: - Public API

    @objc func authorize(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else {
                call.reject("Plugin deallocated", "SIGN_IN_FAILED")
                return
            }

            // Cancel any pending sign-in
            if let prev = self.signInCall {
                prev.reject("Cancelled by new request", "SIGN_IN_CANCELED")
                self.signInCall = nil
            }

            self.signInCall = call
            let rawNonce = self.randomNonceString()

            let vc = AppleSignInPresentationViewController()
            vc.rawNonce = rawNonce
            vc.modalPresentationStyle = .overCurrentContext
            vc.modalTransitionStyle = .crossDissolve

            vc.onSuccess = { [weak self] result in
                self?.signInCall?.resolve(result)
                self?.signInCall = nil
                vc.dismiss(animated: false)
            }

            vc.onFailure = { [weak self] error in
                let asError = error as? ASAuthorizationError
                if asError?.code == .canceled {
                    self?.signInCall?.reject("Sign in cancelled", "SIGN_IN_CANCELED")
                } else {
                    // Encode iOS error code in the message so JavaScript can surface it
                    // even if Capacitor doesn't propagate the custom code string.
                    let errNum = asError.map { "\($0.code.rawValue)" } ?? "0"
                    let msg = "SIGN_IN_FAILED:\(errNum):\(error.localizedDescription)"
                    self?.signInCall?.reject(msg, "SIGN_IN_FAILED")
                }
                self?.signInCall = nil
                vc.dismiss(animated: false)
            }

            guard let rootVC = self.bridge?.viewController else {
                call.reject("No root view controller", "SIGN_IN_FAILED")
                return
            }
            rootVC.present(vc, animated: false)
        }
    }

    // MARK: - Helpers

    private func randomNonceString(length: Int = 32) -> String {
        precondition(length > 0)
        var randomBytes = [UInt8](repeating: 0, count: length)
        let errorCode = SecRandomCopyBytes(kSecRandomDefault, randomBytes.count, &randomBytes)
        if errorCode != errSecSuccess {
            fatalError("Unable to generate nonce. SecRandomCopyBytes failed with OSStatus \(errorCode)")
        }
        let charset: [Character] = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        return String(randomBytes.map { charset[Int($0) % charset.count] })
    }
}
