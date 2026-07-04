import Foundation
import Capacitor
import AuthenticationServices
import CryptoKit

// MARK: - NativeAppleSignInPlugin

@objc(NativeAppleSignInPlugin)
public class NativeAppleSignInPlugin: CAPPlugin, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {

    private var signInCall: CAPPluginCall?
    private var currentNonce: String?

    // MARK: - Public API

    @objc func authorize(_ call: CAPPluginCall) {
        let rawNonce = randomNonceString()
        currentNonce = rawNonce

        let appleIDProvider = ASAuthorizationAppleIDProvider()
        let request = appleIDProvider.createRequest()
        request.requestedScopes = [.fullName, .email]
        request.nonce = sha256(rawNonce)

        let authorizationController = ASAuthorizationController(authorizationRequests: [request])
        authorizationController.delegate = self
        authorizationController.presentationContextProvider = self

        self.signInCall = call

        DispatchQueue.main.async {
            authorizationController.performRequests()
        }
    }

    // MARK: - ASAuthorizationControllerPresentationContextProviding

    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        // 1. Capacitor bridge'in aktif view controller penceresi (ideal yol)
        if let window = self.bridge?.viewController?.view.window {
            return window
        }

        // 2. iOS 15+ / iPadOS 26 scene-based — foreground aktif sahneyi bul
        let windowScenes = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }

        // Önce foregroundActive, yoksa foregroundInactive dene (iPad Stage Manager)
        let targetScene = windowScenes.first(where: { $0.activationState == .foregroundActive })
                       ?? windowScenes.first(where: { $0.activationState == .foregroundInactive })
                       ?? windowScenes.first

        if let scene = targetScene {
            // iOS 16+ keyWindow özelliği
            if let key = scene.keyWindow { return key }
            // isKeyWindow ile bul
            if let key = scene.windows.first(where: { $0.isKeyWindow }) { return key }
            // İlk pencereyi kullan
            if let first = scene.windows.first { return first }
        }

        // 3. Son çare — tüm sahnelerin tüm pencereleri
        for scene in windowScenes {
            if let w = scene.windows.first { return w }
        }

        // 4. Hiçbir pencere yoksa boş döndür (crash olmaz ama sign-in başarısız olur)
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
