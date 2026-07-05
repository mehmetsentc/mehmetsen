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
        // Eğer zaten bir işlem devam ediyorsa iptal et
        if signInCall != nil {
            call.reject("Sign in already in progress", "SIGN_IN_IN_PROGRESS")
            return
        }

        let rawNonce = randomNonceString()
        currentNonce = rawNonce

        let appleIDProvider = ASAuthorizationAppleIDProvider()
        let request = appleIDProvider.createRequest()
        request.requestedScopes = [.fullName, .email]
        request.nonce = sha256(rawNonce)

        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self

        // Instance variable'a ata — ARC tarafından serbest bırakılmasın
        self.authorizationController = controller
        self.signInCall = call

        DispatchQueue.main.async { [weak self] in
            self?.authorizationController?.performRequests()
        }
    }

    // MARK: - ASAuthorizationControllerPresentationContextProviding

    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        // Main thread'de çalıştığından emin ol
        assert(Thread.isMainThread, "presentationAnchor must be called on main thread")

        // 1. Capacitor bridge'in aktif view controller'ının penceresi (en güvenilir)
        if let vc = self.bridge?.viewController,
           let window = vc.view.window,
           !window.isHidden {
            return window
        }

        // 2. iPadOS 26+ — scene-based window, Stage Manager dahil
        let scenes = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }

        // Önce foregroundActive sahne
        let activeScenes = scenes.filter { $0.activationState == .foregroundActive }
        let candidateScenes = activeScenes.isEmpty
            ? scenes.filter { $0.activationState == .foregroundInactive }
            : activeScenes

        for scene in candidateScenes {
            // iOS 16+ keyWindow (en güvenilir)
            if let key = scene.keyWindow, !key.isHidden { return key }
        }

        // 3. Herhangi bir visible window
        for scene in scenes {
            if let key = scene.keyWindow, !key.isHidden { return key }
            for window in scene.windows where !window.isHidden && window.isKeyWindow {
                return window
            }
        }

        // 4. Görünür herhangi bir window
        for scene in scenes {
            for window in scene.windows where !window.isHidden {
                return window
            }
        }

        // 5. Son çare — boş pencere (nadiren buraya düşer)
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
