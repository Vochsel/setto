import AVFoundation
import SwiftUI
import UIKit

/// Drives an `AVCaptureSession` for still capture: permission, configuration,
/// front/back flip and photo capture. The captured `UIImage` is published back
/// to SwiftUI.
@MainActor
final class CameraController: NSObject, ObservableObject {
    let session = AVCaptureSession()
    private let output = AVCapturePhotoOutput()
    private let queue = DispatchQueue(label: "app.setto.camera.session")
    private var position: AVCaptureDevice.Position = .back

    @Published var captured: UIImage?
    @Published var permissionDenied = false
    @Published var isFront = false

    /// Ask for permission (if needed) and wire up the session.
    func start() {
        Task {
            let status = AVCaptureDevice.authorizationStatus(for: .video)
            var granted = status == .authorized
            if status == .notDetermined {
                granted = await AVCaptureDevice.requestAccess(for: .video)
            }
            guard granted else {
                permissionDenied = true
                return
            }
            permissionDenied = false
            configure()
        }
    }

    func stop() {
        queue.async { [session] in
            if session.isRunning { session.stopRunning() }
        }
    }

    func flip() {
        position = position == .back ? .front : .back
        isFront = position == .front
        configure()
    }

    func capture() {
        let settings = AVCapturePhotoSettings()
        let front = isFront
        queue.async { [output] in
            if let conn = output.connection(with: .video) {
                conn.isVideoMirrored = front
            }
            output.capturePhoto(with: settings, delegate: self)
        }
    }

    private func configure() {
        let position = self.position
        queue.async { [session, output] in
            session.beginConfiguration()
            session.sessionPreset = .photo
            for input in session.inputs { session.removeInput(input) }
            if let device = AVCaptureDevice.default(
                .builtInWideAngleCamera, for: .video, position: position),
                let input = try? AVCaptureDeviceInput(device: device),
                session.canAddInput(input)
            {
                session.addInput(input)
            }
            if !session.outputs.contains(output), session.canAddOutput(output) {
                session.addOutput(output)
            }
            session.commitConfiguration()
            if !session.isRunning { session.startRunning() }
        }
    }
}

extension CameraController: AVCapturePhotoCaptureDelegate {
    nonisolated func photoOutput(
        _ output: AVCapturePhotoOutput,
        didFinishProcessingPhoto photo: AVCapturePhoto,
        error: Error?
    ) {
        guard let data = photo.fileDataRepresentation(),
            let image = UIImage(data: data)
        else { return }
        Task { @MainActor in self.captured = image }
    }
}

/// SwiftUI host for the live `AVCaptureVideoPreviewLayer`.
struct CameraPreview: UIViewRepresentable {
    let session: AVCaptureSession

    func makeUIView(context: Context) -> PreviewView {
        let view = PreviewView()
        view.previewLayer.session = session
        view.previewLayer.videoGravity = .resizeAspectFill
        return view
    }

    func updateUIView(_ uiView: PreviewView, context: Context) {}

    final class PreviewView: UIView {
        override class var layerClass: AnyClass {
            AVCaptureVideoPreviewLayer.self
        }
        var previewLayer: AVCaptureVideoPreviewLayer {
            layer as! AVCaptureVideoPreviewLayer
        }
    }
}

/// Full-screen native camera with reference thumbnails for the model & product
/// you're shooting. Captures a still, lets you retake, and hands the confirmed
/// `UIImage` back to the caller.
struct CameraView: View {
    @StateObject private var controller = CameraController()

    /// Small reference images (model headshot, product shot) overlaid as guides.
    var references: [URL]
    var onCapture: (UIImage) -> Void
    var onCancel: () -> Void

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if controller.permissionDenied {
                permissionDenied
            } else if let shot = controller.captured {
                review(shot)
            } else {
                live
            }
        }
        .onAppear { controller.start() }
        .onDisappear { controller.stop() }
    }

    // MARK: - Live camera

    private var live: some View {
        ZStack {
            CameraPreview(session: controller.session)
                .ignoresSafeArea()

            VStack {
                HStack(alignment: .top) {
                    closeButton
                    Spacer()
                    references_view
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)

                Spacer()
                controls
            }
        }
    }

    private var references_view: some View {
        VStack(spacing: 8) {
            ForEach(references, id: \.self) { url in
                AsyncImage(url: url) { phase in
                    if let image = phase.image {
                        image.resizable().scaledToFill()
                    } else {
                        Color.white.opacity(0.1)
                    }
                }
                .frame(width: 56, height: 72)
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(.white.opacity(0.7), lineWidth: 1))
            }
        }
    }

    private var controls: some View {
        HStack {
            Spacer()
            // Shutter
            Button(action: controller.capture) {
                ZStack {
                    Circle().stroke(.white, lineWidth: 4).frame(width: 76, height: 76)
                    Circle().fill(.white).frame(width: 62, height: 62)
                }
            }
            Spacer()
        }
        .overlay(alignment: .trailing) {
            Button(action: controller.flip) {
                Image(systemName: "arrow.triangle.2.circlepath.camera")
                    .font(.title2)
                    .foregroundStyle(.white)
                    .padding(14)
                    .background(.white.opacity(0.15), in: Circle())
            }
            .padding(.trailing, 28)
        }
        .padding(.bottom, 40)
    }

    // MARK: - Captured review

    private func review(_ image: UIImage) -> some View {
        ZStack {
            Image(uiImage: image)
                .resizable()
                .scaledToFit()
                .ignoresSafeArea()

            VStack {
                HStack {
                    closeButton
                    Spacer()
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                Spacer()
                HStack(spacing: 16) {
                    Button {
                        controller.captured = nil
                    } label: {
                        Label("Retake", systemImage: "arrow.counterclockwise")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .tint(.white)

                    Button {
                        onCapture(image)
                    } label: {
                        Label("Use Photo", systemImage: "checkmark")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                }
                .controlSize(.large)
                .padding(20)
                .background(.ultraThinMaterial)
            }
        }
    }

    // MARK: - Bits

    private var closeButton: some View {
        Button(action: onCancel) {
            Image(systemName: "xmark")
                .font(.title3.bold())
                .foregroundStyle(.white)
                .padding(12)
                .background(.black.opacity(0.35), in: Circle())
        }
    }

    private var permissionDenied: some View {
        VStack(spacing: 16) {
            Image(systemName: "camera.fill")
                .font(.system(size: 44))
                .foregroundStyle(.white.opacity(0.6))
            Text("Camera access is off")
                .font(.headline)
                .foregroundStyle(.white)
            Text("Enable camera access in Settings to take photos.")
                .font(.footnote)
                .foregroundStyle(.white.opacity(0.7))
                .multilineTextAlignment(.center)
            Button("Open Settings") {
                if let url = URL(string: UIApplication.openSettingsURLString) {
                    UIApplication.shared.open(url)
                }
            }
            .buttonStyle(.borderedProminent)
            Button("Close", action: onCancel)
                .foregroundStyle(.white)
        }
        .padding(40)
    }
}
