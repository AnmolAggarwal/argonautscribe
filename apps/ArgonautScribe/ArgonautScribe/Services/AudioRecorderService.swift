import AVFoundation
import Foundation

/// Wraps AVAudioRecorder for segment-based recording.
/// @unchecked Sendable: always used on @MainActor from SwiftUI views.
@Observable
final class AudioRecorderService: @unchecked Sendable {
    private(set) var isRecording = false
    private(set) var duration: TimeInterval = 0

    private var recorder: AVAudioRecorder?
    private var timer: Timer?
    private var outputURL: URL?

    /// Start recording to a temporary .m4a file.
    func start() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.record, mode: .measurement)
        try session.setActive(true)

        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension("m4a")

        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 16000,
            AVNumberOfChannelsKey: 1,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue,
        ]

        let rec = try AVAudioRecorder(url: url, settings: settings)
        rec.record()

        recorder = rec
        outputURL = url
        isRecording = true
        duration = 0

        timer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self, let rec = self.recorder, rec.isRecording else { return }
                self.duration = rec.currentTime
            }
        }
    }

    /// Stop recording and return the audio file URL.
    func stop() -> URL? {
        timer?.invalidate()
        timer = nil
        recorder?.stop()
        isRecording = false

        let url = outputURL
        recorder = nil
        outputURL = nil
        return url
    }

    /// Request microphone permission. Returns true if granted.
    static func requestPermission() async -> Bool {
        await AVAudioApplication.requestRecordPermission()
    }
}
