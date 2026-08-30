import Foundation
import UIKit
import Capacitor
import GoogleSignIn

/**
 * Native Google Sign In plugin using the official GoogleSignIn-iOS SDK.
 *
 * Conforms to CAPBridgedPlugin and is registered explicitly in AppViewController.
 * Uses official GIDSignIn.sharedInstance.signIn(...) with the presenting UIViewController.
 * Obtains idToken + accessToken for Firebase GoogleAuthProvider.credential(...) creation.
 */
@objc(NativeGoogleSignInPlugin)
public class NativeGoogleSignInPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeGoogleSignInPlugin"
    public let jsName = "NativeGoogleSignIn"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "signOut", returnType: CAPPluginReturnPromise)
    ]

    @objc func signIn(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else {
                call.reject("Plugin deallocated", "SIGN_IN_FAILED")
                return
            }

            guard let viewController = self.bridge?.viewController ?? self.presentingViewController() else {
                call.reject("No presenting view controller available", "UNAVAILABLE")
                return
            }

            GIDSignIn.sharedInstance.signIn(withPresenting: viewController) { result, error in
                if let error = error {
                    let nsError = error as NSError
                    // GIDSignInErrorCode: kGIDSignInErrorCodeCanceled = -5
                    if nsError.code == -5 || nsError.domain == kGIDSignInErrorDomain && nsError.code == -5 {
                        call.reject("Sign in cancelled", "SIGN_IN_CANCELED")
                        return
                    }
                    call.reject("Google Sign-In failed: \(error.localizedDescription)", "SIGN_IN_FAILED")
                    return
                }

                guard let user = result?.user else {
                    call.reject("Missing Google user from result", "SIGN_IN_FAILED")
                    return
                }

                guard let idToken = user.idToken?.tokenString else {
                    call.reject("Missing Google ID token", "SIGN_IN_FAILED")
                    return
                }

                var response: [String: Any] = [
                    "idToken": idToken,
                    "accessToken": user.accessToken.tokenString,
                    "userId": user.userID ?? ""
                ]

                if let profile = user.profile {
                    response["email"] = profile.email
                    response["name"] = profile.name
                    response["givenName"] = profile.givenName
                    response["familyName"] = profile.familyName
                    if profile.hasImage {
                        response["imageUrl"] = profile.imageURL(withDimension: 200)?.absoluteString
                    }
                }

                call.resolve(response)
            }
        }
    }

    @objc func signOut(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            GIDSignIn.sharedInstance.signOut()
            call.resolve()
        }
    }

    private func presentingViewController() -> UIViewController? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        if let scene = scenes.first(where: { $0.activationState == .foregroundActive }) ?? scenes.first {
            if let root = scene.windows.first(where: { $0.isKeyWindow })?.rootViewController {
                return root
            }
        }
        return nil
    }
}
