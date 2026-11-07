import Capacitor
import UIKit

/// Keeps the screen on during a fight. The sheet calls keepOn when a fight starts (if the
/// "Keep the screen on during a fight" setting is on) and allowSleep when it ends.
/// The Android app has the same plugin in KeepAwakePlugin.java.
@objc(KeepAwakePlugin)
public class KeepAwakePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "KeepAwakePlugin"
    public let jsName = "KeepAwake"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "keepOn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "allowSleep", returnType: CAPPluginReturnPromise)
    ]

    @objc func keepOn(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            UIApplication.shared.isIdleTimerDisabled = true
            call.resolve()
        }
    }

    @objc func allowSleep(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            UIApplication.shared.isIdleTimerDisabled = false
            call.resolve()
        }
    }
}

/// The app's screen: Capacitor's web view, with the plugin above registered.
/// Main.storyboard uses this class.
class ViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(KeepAwakePlugin())
    }
}
