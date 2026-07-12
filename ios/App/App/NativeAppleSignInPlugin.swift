import Foundation
import Capacitor
import AuthenticationServices
import CryptoKit

// MARK: - NativeAppleSignInPlugin

@objc(NativeAppleSignInPlugin)
public class NativeAppleSignInPlugin: CAPPlugin, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {

    private var signInCall: CAPPluginCall?
    private var currentNonce: String?
    /// Strong reference — local var olarak tutulursa ARC performRequests'ten önce serbest bırakır
    private var authorizationController: ASAuthorizationController?

    // MARK: - Public API

    @objc func authorize(_ call: CAPPluginCall) {
        // Tüm ASAuthorization setup'ı main thread'de çalışmalı
        DispatchQueue.main.async { [weak self] in
            guard let self = self else {
                call.reject("Plugin deallocated", "SIGN_IN_FAILED")
                return
            }

            // Önceki takılmış oturumu temizle (yeniden deneme senaryosu)
            if self.signInCall != nil {
                self.signInCall?.reject("Cancelled by new request", "SIGN_IN_CANCELED")
                self.reset()
            }

            let rawNonce = self.randomNonceString()
            self.currentNonce = rawNonce
            self.signInCall = call

            let appleIDProvider = ASAuthorizationAppleIDProvider()
            let request = appleIDProvider.createRequest()
            request.requestedScopes = [.fullName, .email]
            request.nonce = self.sha256(rawNonce)

            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            self.authorizationController = controller
            controller.performRequests()
        }
    }

    // MARK: - ASAuthorizationControllerPresentationContextProviding

    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        // Bu delegate her zaman main thread'den çağrılır

        // 1. Capacitor bridge view controller'ının penceresi — EN GÜVENİLİR
        //    iPad'de Stage Manager veya Split View ile birden fazla foregroundActive
        //    sahne bulunabilir; bu kontrolör hangi sahnede olduğu bilinmez.
        //    bridge.viewController.view.window ise her zaman uygulamanın kendi penceresidir.
        if let vc = self.bridge?.viewController,
           let window = vc.view.window,
           !window.isHidden,
           window.windowScene != nil {
            return window
        }

        // 2. Foreground active scene → key window (sahne bazlı fallback)
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }

        if let activeScene = scenes.first(where: { $0.activationState == .foregroundActive }) {
            if let keyWindow = activeScene.keyWindow, !keyWindow.isHidden { return keyWindow }
            if let visibleWindow = activeScene.windows.first(where: { !$0.isHidden }) { return visibleWindow }
        }

        // 3. Herhangi bir foreground scene
        for scene in scenes where scene.activationState != .background {
            if let keyWindow = scene.keyWindow, !keyWindow.isHidden { return keyWindow }
            if let visibleWindow = scene.windows.first(where: { !$0.isHidden }) { return visibleWindow }
        }

        // 4. Son çare — ilk görünür window
        for scene in scenes {
            for window in scene.windows where !window.isHidden { return window }
        }

        // Çalışan bir uygulamada bu satıra ulaşılmamalı
        return UIWindow()
    }

    // MARK: - ASAuthorizationControllerDelegate

    public func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithAuthorization authorization: ASAuthorization
    ) {
        guard let appleIDCredential = authorization.credential as? ASAuthorizationAppleIDCredential else {
            signInCall?.reject("Invalid credential type", "INVALID_CREDENTIAL")
            reset()
            return
        }

        guard
            let identityTokenData = appleIDCredential.identityToken,
            let identityToken = String(data: identityTokenData, encoding: .utf8)
        else {
            signInCall?.reject("Could not get identity token", "NO_IDENTITY_TOKEN")
            reset()
            return
        }

        var result: [String: Any] = [
            "user": appleIDCredential.user,
            "identityToken": identityToken,
            "nonce": currentNonce ?? "",
        ]

        if let authCodeData = appleIDCredential.authorizationCode,
           let authCode = String(data: authCodeData, encoding: .utf8) {
            result["authorizationCode"] = authCode
        }
        if let email = appleIDCredential.email {
            result["email"] = email
        }
        if let fullName = appleIDCredential.fullName {
            result["givenName"] = fullName.givenName ?? ""
            result["familyName"] = fullName.familyName ?? ""
        }

        signInCall?.resolve(result)
        reset()
    }

    public func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithError error: Error
    ) {
        let asError = error as? ASAuthorizationError
        if asError?.code == .canceled {
            signInCall?.reject("Sign in cancelled", "SIGN_IN_CANCELED")
        } else {
            signInCall?.reject(error.localizedDescription, "SIGN_IN_FAILED")
        }
        reset()
    }

    // MARK: - Helpers

    private func reset() {
        signInCall = nil
        currentNonce = nil
        authorizationController = nil
    }

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
        let inputData = Data(input.utf8)
        let hashed = SHA256.hash(data: inputData)
        return hashed.compactMap { String(format: "%02x", $0) }.joined()
    }
}
