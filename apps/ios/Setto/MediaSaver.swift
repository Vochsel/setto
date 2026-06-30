import Foundation
import Photos

/// Download-button states shown in the swipe reel's rail.
enum MediaSaveState {
    case idle, saving, saved, failed
}

enum MediaSaverError: LocalizedError {
    case denied
    var errorDescription: String? {
        switch self {
        case .denied: return "Photo library access is off."
        }
    }
}

/// Saves a remote image or video into the user's photo library, requesting
/// add-only permission on first use.
enum PhotoLibrary {
    static func save(mediaURL: URL, isVideo: Bool) async throws {
        try await ensureAuthorized()
        if isVideo {
            // Videos must be written from a file URL.
            let (tmp, _) = try await URLSession.shared.download(from: mediaURL)
            let dest = FileManager.default.temporaryDirectory
                .appendingPathComponent(UUID().uuidString + ".mp4")
            try? FileManager.default.removeItem(at: dest)
            try FileManager.default.moveItem(at: tmp, to: dest)
            defer { try? FileManager.default.removeItem(at: dest) }
            try await PHPhotoLibrary.shared().performChanges {
                PHAssetCreationRequest.forAsset()
                    .addResource(with: .video, fileURL: dest, options: nil)
            }
        } else {
            let (data, _) = try await URLSession.shared.data(from: mediaURL)
            try await PHPhotoLibrary.shared().performChanges {
                PHAssetCreationRequest.forAsset()
                    .addResource(with: .photo, data: data, options: nil)
            }
        }
    }

    private static func ensureAuthorized() async throws {
        let status = PHPhotoLibrary.authorizationStatus(for: .addOnly)
        switch status {
        case .authorized, .limited:
            return
        case .notDetermined:
            let granted = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
            if granted != .authorized && granted != .limited {
                throw MediaSaverError.denied
            }
        default:
            throw MediaSaverError.denied
        }
    }
}
