import Foundation

/// Timezone helpers for the social calendar. Posts store an absolute epoch
/// (scheduledAt, ms); the workspace picks an IANA timezone (default AEST) that
/// we use to bucket posts onto days and to render times. Foundation's Calendar
/// does the heavy lifting — no manual offset math needed.
enum Scheduling {
    static let defaultTZ = "Australia/Sydney"  // AEST/AEDT

    /// A short, curated list for the timezone picker (AU-first).
    static let timezones = [
        "Australia/Sydney", "Australia/Brisbane", "Australia/Adelaide",
        "Australia/Perth", "Pacific/Auckland", "Asia/Singapore", "Asia/Tokyo",
        "Europe/London", "Europe/Berlin", "America/New_York", "America/Chicago",
        "America/Denver", "America/Los_Angeles", "UTC",
    ]

    static func timeZone(_ id: String) -> TimeZone {
        TimeZone(identifier: id) ?? .current
    }

    /// A Calendar pinned to the workspace timezone (for same-day bucketing).
    static func calendar(_ tz: String) -> Calendar {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = timeZone(tz)
        cal.firstWeekday = 2  // Monday
        return cal
    }

    /// The tz abbreviation (e.g. "AEST") for display.
    static func abbrev(_ tz: String) -> String {
        timeZone(tz).abbreviation() ?? tz
    }

    /// "9:30 am"-style time in the workspace tz.
    static func timeString(_ date: Date, tz: String) -> String {
        let f = DateFormatter()
        f.timeZone = timeZone(tz)
        f.dateFormat = "h:mm a"
        f.amSymbol = "am"
        f.pmSymbol = "pm"
        return f.string(from: date)
    }

    /// "Fri 4 Jul, 9:30 am"-style date+time in the workspace tz.
    static func dateTimeString(_ date: Date, tz: String) -> String {
        let f = DateFormatter()
        f.timeZone = timeZone(tz)
        f.dateFormat = "EEE d MMM, h:mm a"
        f.amSymbol = "am"
        f.pmSymbol = "pm"
        return f.string(from: date)
    }
}
