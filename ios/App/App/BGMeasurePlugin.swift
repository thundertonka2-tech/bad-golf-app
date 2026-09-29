// Bad Golf — AR distance measure (v1830).
//
// Tyler, 9/29: "build a measuring tool inside the app that would allow them to mark a
// spot using the camera then mark the hole and we give them the distance in feet and
// inches." Used by the Long Putt and Closest-to-the-Pin distance boxes.
//
// JS:  Capacitor.Plugins.BGMeasure.isAvailable()          -> { available, lidar }
//      Capacitor.Plugins.BGMeasure.measure({ title })      -> { inches, ft, in, meters }
//                                                             or { cancelled: true }
//
// ARKit world tracking + a raycast from the centre of the screen onto the ground
// (estimated plane first, so it works before a full plane is found; LiDAR phones get the
// scene mesh as well, which makes grass noticeably steadier). Two marks -> straight-line
// distance between them. Registered explicitly in MainViewController (see
// WatchBridgePlugin.swift) for the same Release-build stripping reason as the others.

import Foundation
import UIKit
import ARKit
import SceneKit
import Capacitor

@objc(BGMeasurePlugin)
public class BGMeasurePlugin: CAPPlugin {

    @objc func isAvailable(_ call: CAPPluginCall) {
        let ok = ARWorldTrackingConfiguration.isSupported
        var lidar = false
        if ok { lidar = ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh) }
        call.resolve(["available": ok, "lidar": lidar])
    }

    @objc func measure(_ call: CAPPluginCall) {
        guard ARWorldTrackingConfiguration.isSupported else {
            call.reject("AR_UNSUPPORTED")
            return
        }
        let title = call.getString("title") ?? "Measure"
        DispatchQueue.main.async { [weak self] in
            guard let presenter = self?.bridge?.viewController else {
                call.reject("NO_VIEW")
                return
            }
            let vc = BGMeasureViewController()
            vc.titleText = title
            vc.onFinish = { inches in
                if let inches = inches {
                    let total = Int(inches.rounded())
                    call.resolve([
                        "inches": total,
                        "ft": total / 12,
                        "in": total % 12,
                        "meters": inches * 0.0254
                    ])
                } else {
                    call.resolve(["cancelled": true])
                }
            }
            vc.modalPresentationStyle = .fullScreen
            presenter.present(vc, animated: true, completion: nil)
        }
    }
}

final class BGMeasureViewController: UIViewController, ARSCNViewDelegate {

    var onFinish: ((Double?) -> Void)?
    var titleText: String = "Measure"

    private let sceneView = ARSCNView(frame: .zero)
    private let reticle = UIView(frame: .zero)
    private let titleLabel = UILabel(frame: .zero)
    private let infoLabel = UILabel(frame: .zero)
    private let distLabel = UILabel(frame: .zero)
    private let markButton = UIButton(type: .system)
    private let undoButton = UIButton(type: .system)
    private let cancelButton = UIButton(type: .system)
    private let useButton = UIButton(type: .system)

    private var points: [SCNVector3] = []
    private var markers: [SCNNode] = []
    private var lineNode: SCNNode?
    private var liveTimer: Timer?
    private var resultInches: Double?
    private var done = false

    private let gold = UIColor(red: 0.95, green: 0.79, blue: 0.30, alpha: 1.0)
    private let navy = UIColor(red: 0.05, green: 0.23, blue: 0.39, alpha: 0.92)

    // MARK: lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        sceneView.translatesAutoresizingMaskIntoConstraints = false
        sceneView.delegate = self
        sceneView.autoenablesDefaultLighting = true
        view.addSubview(sceneView)

        // Centre crosshair: what the next mark will land on.
        reticle.translatesAutoresizingMaskIntoConstraints = false
        reticle.isUserInteractionEnabled = false
        reticle.layer.borderColor = UIColor.white.cgColor
        reticle.layer.borderWidth = 2
        reticle.layer.cornerRadius = 18
        reticle.backgroundColor = UIColor.white.withAlphaComponent(0.08)
        view.addSubview(reticle)
        let dot = UIView(frame: .zero)
        dot.translatesAutoresizingMaskIntoConstraints = false
        dot.backgroundColor = gold
        dot.layer.cornerRadius = 3
        reticle.addSubview(dot)

        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        titleLabel.text = titleText
        titleLabel.textColor = .white
        titleLabel.font = UIFont.systemFont(ofSize: 20, weight: .heavy)
        titleLabel.textAlignment = .center
        view.addSubview(titleLabel)

        infoLabel.translatesAutoresizingMaskIntoConstraints = false
        infoLabel.textColor = .white
        infoLabel.font = UIFont.systemFont(ofSize: 15, weight: .semibold)
        infoLabel.numberOfLines = 0
        infoLabel.textAlignment = .center
        infoLabel.backgroundColor = navy
        infoLabel.layer.cornerRadius = 12
        infoLabel.layer.masksToBounds = true
        view.addSubview(infoLabel)

        distLabel.translatesAutoresizingMaskIntoConstraints = false
        distLabel.textColor = gold
        distLabel.font = UIFont.monospacedDigitSystemFont(ofSize: 44, weight: .black)
        distLabel.textAlignment = .center
        distLabel.text = ""
        view.addSubview(distLabel)

        style(markButton, title: "Mark ball", primary: true)
        style(useButton, title: "Use this distance", primary: true)
        style(undoButton, title: "Undo", primary: false)
        style(cancelButton, title: "Cancel", primary: false)
        useButton.isHidden = true
        undoButton.isHidden = true
        markButton.addTarget(self, action: #selector(markTapped), for: .touchUpInside)
        useButton.addTarget(self, action: #selector(useTapped), for: .touchUpInside)
        undoButton.addTarget(self, action: #selector(undoTapped), for: .touchUpInside)
        cancelButton.addTarget(self, action: #selector(cancelTapped), for: .touchUpInside)
        [markButton, useButton, undoButton, cancelButton].forEach { view.addSubview($0) }

        let g = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            sceneView.topAnchor.constraint(equalTo: view.topAnchor),
            sceneView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            sceneView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            sceneView.trailingAnchor.constraint(equalTo: view.trailingAnchor),

            reticle.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            reticle.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            reticle.widthAnchor.constraint(equalToConstant: 36),
            reticle.heightAnchor.constraint(equalToConstant: 36),
            dot.centerXAnchor.constraint(equalTo: reticle.centerXAnchor),
            dot.centerYAnchor.constraint(equalTo: reticle.centerYAnchor),
            dot.widthAnchor.constraint(equalToConstant: 6),
            dot.heightAnchor.constraint(equalToConstant: 6),

            titleLabel.topAnchor.constraint(equalTo: g.topAnchor, constant: 12),
            titleLabel.leadingAnchor.constraint(equalTo: g.leadingAnchor, constant: 16),
            titleLabel.trailingAnchor.constraint(equalTo: g.trailingAnchor, constant: -16),

            infoLabel.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 10),
            infoLabel.leadingAnchor.constraint(equalTo: g.leadingAnchor, constant: 16),
            infoLabel.trailingAnchor.constraint(equalTo: g.trailingAnchor, constant: -16),
            infoLabel.heightAnchor.constraint(greaterThanOrEqualToConstant: 52),

            distLabel.bottomAnchor.constraint(equalTo: markButton.topAnchor, constant: -14),
            distLabel.leadingAnchor.constraint(equalTo: g.leadingAnchor, constant: 16),
            distLabel.trailingAnchor.constraint(equalTo: g.trailingAnchor, constant: -16),

            cancelButton.bottomAnchor.constraint(equalTo: g.bottomAnchor, constant: -14),
            cancelButton.leadingAnchor.constraint(equalTo: g.leadingAnchor, constant: 16),
            cancelButton.widthAnchor.constraint(equalTo: g.widthAnchor, multiplier: 0.5, constant: -22),
            cancelButton.heightAnchor.constraint(equalToConstant: 50),

            undoButton.bottomAnchor.constraint(equalTo: g.bottomAnchor, constant: -14),
            undoButton.trailingAnchor.constraint(equalTo: g.trailingAnchor, constant: -16),
            undoButton.widthAnchor.constraint(equalTo: g.widthAnchor, multiplier: 0.5, constant: -22),
            undoButton.heightAnchor.constraint(equalToConstant: 50),

            markButton.bottomAnchor.constraint(equalTo: cancelButton.topAnchor, constant: -10),
            markButton.leadingAnchor.constraint(equalTo: g.leadingAnchor, constant: 16),
            markButton.trailingAnchor.constraint(equalTo: g.trailingAnchor, constant: -16),
            markButton.heightAnchor.constraint(equalToConstant: 56),

            useButton.bottomAnchor.constraint(equalTo: cancelButton.topAnchor, constant: -10),
            useButton.leadingAnchor.constraint(equalTo: g.leadingAnchor, constant: 16),
            useButton.trailingAnchor.constraint(equalTo: g.trailingAnchor, constant: -16),
            useButton.heightAnchor.constraint(equalToConstant: 56)
        ])

        setInfo("Point at the ball. Move the phone slowly for a second so it can find the ground.")
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        let config = ARWorldTrackingConfiguration()
        config.planeDetection = [.horizontal]
        if ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh) {
            config.sceneReconstruction = .mesh
        }
        sceneView.session.run(config, options: [.resetTracking, .removeExistingAnchors])
        UIApplication.shared.isIdleTimerDisabled = true
        liveTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            self?.tick()
        }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        liveTimer?.invalidate()
        liveTimer = nil
        sceneView.session.pause()
        UIApplication.shared.isIdleTimerDisabled = false
    }

    override var prefersStatusBarHidden: Bool { return true }

    // MARK: UI helpers

    private func style(_ b: UIButton, title: String, primary: Bool) {
        b.translatesAutoresizingMaskIntoConstraints = false
        b.setTitle(title, for: .normal)
        b.titleLabel?.font = UIFont.systemFont(ofSize: 18, weight: .heavy)
        b.layer.cornerRadius = 14
        if primary {
            b.backgroundColor = gold
            b.setTitleColor(UIColor(red: 0.03, green: 0.14, blue: 0.25, alpha: 1.0), for: .normal)
        } else {
            b.backgroundColor = navy
            b.setTitleColor(.white, for: .normal)
            b.layer.borderColor = UIColor.white.withAlphaComponent(0.4).cgColor
            b.layer.borderWidth = 1
        }
    }

    private func setInfo(_ text: String) {
        infoLabel.text = "  " + text + "  "
    }

    private func fmt(_ inches: Double) -> String {
        let total = Int(inches.rounded())
        return "\(total / 12)\u{2032} \(total % 12)\u{2033}"
    }

    // MARK: geometry

    private func hitAtCenter() -> SCNVector3? {
        let c = CGPoint(x: sceneView.bounds.midX, y: sceneView.bounds.midY)
        let attempts: [(ARRaycastQuery.Target, ARRaycastQuery.TargetAlignment)] = [
            (.existingPlaneGeometry, .horizontal),
            (.estimatedPlane, .horizontal),
            (.estimatedPlane, .any)
        ]
        for (target, align) in attempts {
            if let q = sceneView.raycastQuery(from: c, allowing: target, alignment: align),
               let r = sceneView.session.raycast(q).first {
                let t = r.worldTransform.columns.3
                return SCNVector3(t.x, t.y, t.z)
            }
        }
        return nil
    }

    private func inchesBetween(_ a: SCNVector3, _ b: SCNVector3) -> Double {
        let dx = Double(b.x - a.x), dy = Double(b.y - a.y), dz = Double(b.z - a.z)
        return (dx * dx + dy * dy + dz * dz).squareRoot() * 39.3701
    }

    private func addMarker(at p: SCNVector3, color: UIColor) {
        let s = SCNSphere(radius: 0.02)
        s.firstMaterial?.diffuse.contents = color
        s.firstMaterial?.lightingModel = .constant
        let n = SCNNode(geometry: s)
        n.position = p
        sceneView.scene.rootNode.addChildNode(n)
        markers.append(n)
    }

    private func drawLine(from a: SCNVector3, to b: SCNVector3) {
        lineNode?.removeFromParentNode()
        let len = CGFloat(inchesBetween(a, b) / 39.3701)
        guard len > 0.001 else { return }
        let cyl = SCNCylinder(radius: 0.006, height: len)
        cyl.firstMaterial?.diffuse.contents = gold
        cyl.firstMaterial?.lightingModel = .constant
        let n = SCNNode(geometry: cyl)
        n.position = SCNVector3((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)
        n.look(at: b, up: SCNVector3(0, 1, 0), localFront: SCNVector3(0, 1, 0))
        sceneView.scene.rootNode.addChildNode(n)
        lineNode = n
    }

    // Live readout: from the ball mark to wherever the crosshair is now.
    private func tick() {
        guard !done, points.count == 1 else { return }
        if let p = hitAtCenter() {
            let d = inchesBetween(points[0], p)
            distLabel.text = fmt(d)
            drawLine(from: points[0], to: p)
        }
    }

    // MARK: actions

    @objc private func markTapped() {
        guard let p = hitAtCenter() else {
            setInfo("Can't see the ground yet. Aim at the grass and move the phone slowly side to side.")
            UINotificationFeedbackGenerator().notificationOccurred(.warning)
            return
        }
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        if points.isEmpty {
            points.append(p)
            addMarker(at: p, color: .white)
            markButton.setTitle("Mark hole", for: .normal)
            undoButton.isHidden = false
            setInfo("Now aim the crosshair at the centre of the hole and tap Mark hole.")
        } else if points.count == 1 {
            points.append(p)
            addMarker(at: p, color: gold)
            drawLine(from: points[0], to: p)
            let d = inchesBetween(points[0], p)
            resultInches = d
            done = true
            distLabel.text = fmt(d)
            markButton.isHidden = true
            useButton.isHidden = false
            useButton.setTitle("Use " + fmt(d), for: .normal)
            setInfo("Measured. Tap Use to fill it in, or Undo to mark the hole again.")
        }
    }

    @objc private func undoTapped() {
        guard !points.isEmpty else { return }
        points.removeLast()
        if let m = markers.popLast() { m.removeFromParentNode() }
        done = false
        resultInches = nil
        useButton.isHidden = true
        markButton.isHidden = false
        if points.isEmpty {
            lineNode?.removeFromParentNode()
            lineNode = nil
            distLabel.text = ""
            markButton.setTitle("Mark ball", for: .normal)
            undoButton.isHidden = true
            setInfo("Point at the ball and tap Mark ball.")
        } else {
            markButton.setTitle("Mark hole", for: .normal)
            setInfo("Aim the crosshair at the centre of the hole and tap Mark hole.")
        }
    }

    // The callback is taken out BEFORE dismissing and called from the completion, so the
    // JS promise always settles exactly once even if this controller is released first.
    @objc private func useTapped() {
        let r = resultInches
        let cb = onFinish
        onFinish = nil
        dismiss(animated: true) { cb?(r) }
    }

    @objc private func cancelTapped() {
        let cb = onFinish
        onFinish = nil
        dismiss(animated: true) { cb?(nil) }
    }

    // MARK: ARSCNViewDelegate / ARSessionObserver

    func session(_ session: ARSession, cameraDidChangeTrackingState camera: ARCamera) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self, !self.done else { return }
            switch camera.trackingState {
            case .notAvailable:
                self.setInfo("AR isn't available right now.")
            case .limited(let reason):
                switch reason {
                case .initializing: self.setInfo("Starting up. Move the phone slowly over the ground.")
                case .excessiveMotion: self.setInfo("Slow down a little.")
                case .insufficientFeatures: self.setInfo("Not enough detail. Aim at the grass, not the sky.")
                default: self.setInfo("Hold on, finding the ground.")
                }
            case .normal:
                self.setInfo(self.points.isEmpty ? "Point at the ball and tap Mark ball." : "Aim the crosshair at the centre of the hole and tap Mark hole.")
            }
        }
    }

    func session(_ session: ARSession, didFailWithError error: Error) {
        DispatchQueue.main.async { [weak self] in
            self?.setInfo("Camera problem: \(error.localizedDescription). Check Settings > Bad Golf > Camera.")
        }
    }
}
