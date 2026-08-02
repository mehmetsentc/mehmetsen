import Foundation
import Capacitor
import AuthenticationServices
import CryptoKit

/**
 * Native Sign in with Apple for Capacitor.
 *
 * Must conform to CAPBridgedPlugin and be registered (AppViewController /
 * packageClassList). Without that, JS gets UNAVAILABLE and App Review sees
 * a toast error on "Apple ile devam et".
 */
@objc(NativeAppleSignInPlugin)
public class NativeAppleSignInPlugin: CAPPlugin, CAPBridgedPlugin,
    ASAuthorizationControllerDelegate,
    ASAuthorizationControllerPresentationContextProviding {

    public let identifier = "NativeAppleSignInPlugin"
    public let jsName = "NativeAppleSignIn"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authorize", returnType: CAPPluginReturnPromise)
    ]

    private var signInCall: CAPPluginCall?
    private var rawNonce: String = ""
    private var authController: ASAuthorizationController?
    private var retryCount = 0

    // MARK: - Public API

    @objc func authorize(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else {
                call.reject("Plugin deallocated", "SIGN_IN_FAILED")
                return
            }

            if let prev = self.signInCall {
                prev.reject("Cancelled by new request", "SIGN_IN_CANCELED")
                self.signInCall = nil
            }

            self.signInCall = call
            self.retryCount = 0
            self.performAppleRequest(delay: 0.05)
        }
    }

    // MARK: - ASAuthorization flow

    private func performAppleRequest(delay: TimeInterval) {
        let nonce = randomNonceString()
        rawNonce = nonce

        let provider = ASAuthorizationAppleIDProvider()
        let request = provider.createRequest()
        request.requestedScopes = [.fullName, .email]
        request.nonce = sha256(nonce)

        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        authController = controller

        // Small delay so UIKit is in an interactive context (iPadOS 26+).
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            self?.authController?.performRequests()
        }
    }

    private func retryIfNeeded(for error: Error) -> Bool {
        guard let asError = error as? ASAuthorizationError else { return false }
        // 1000 unknown, 1004 failed, 1005 notInteractive — common on iPad review devices
        let retryable: Set<ASAuthorizationError.Code> = [.failed, .notInteractive, .unknown]
        guard retryable.contains(asError.code), retryCount < 1 else { return false }
        retryCount += 1
        performAppleRequest(delay: 0.4)
        return true
    }

    // MARK: - ASAuthorizationControllerPresentationContextProviding

    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        if let window = bridge?.viewController?.view.window {
            return window
        }
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        if let scene = scenes.first(where: { $0.activationState == .foregroundActive })
            ?? scenes.first {
            if let key = scene.keyWindow { return key }
            if let visible = scene.windows.first(where: { !$0.isHidden }) { return visible }
        }
        return UIWindow()
    }

    // MARK: - ASAuthorizationControllerDelegate

    public func authorizationController(controller: ASAuthorizationController,
                                        didCompleteWithAuthorization authorization: ASAuthorization) {
        authController = nil

        guard let cred = authorization.credential as? ASAuthorizationAppleIDCredential else {
            signInCall?.reject("SIGN_IN_FAILED:0:Invalid credential type", "SIGN_IN_FAILED")
            signInCall = nil
            return
        }
        guard
            let tokenData = cred.identityToken,
            let identityToken = String(data: tokenData, encoding: .utf8)
        else {
            signInCall?.reject("SIGN_IN_FAILED:1000:Missing identity token", "SIGN_IN_FAILED")
            signInCall = nil
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

        signInCall?.resolve(result)
        signInCall = nil
    }

    public func authorizationController(controller: ASAuthorizationController,
                                        didCompleteWithError error: Error) {
        if retryIfNeeded(for: error) {
            return
        }

        authController = nil

        let asError = error as? ASAuthorizationError
        if asError?.code == .canceled {
            signInCall?.reject("Sign in cancelled", "SIGN_IN_CANCELED")
        } else {
            let errNum = asError.map { "\($0.code.rawValue)" } ?? "0"
            let msg = "SIGN_IN_FAILED:\(errNum):\(error.localizedDescription)"
            signInCall?.reject(msg, "SIGN_IN_FAILED")
        }
        signInCall = nil
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

    private func sha256(_ input: String) -> String {
        let data = Data(input.utf8)
        let hash = SHA256.hash(data: data)
        return hash.compactMap { String(format: "%02x", $0) }.joined()
    }
}
