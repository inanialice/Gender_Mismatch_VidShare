/**
 * Millisecond offset for a scripted reply relative to "now" when the feed is rendered.
 * CSV format: (+/-)H:MM or H:MM:SS (e.g. -0:29:00 ≈ 29 minutes ago). Negative = further in the past.
 */

var CSV_DURATION = /^\s*-?\d+:\d{1,2}(:\d{1,2})?\s*$/;

function parseCsvDuration(str) {
    var parts = String(str).trim().split(':');
    if (parts.length < 2) {
        return NaN;
    }
    var hourPart = parts[0];
    var negative = hourPart.charAt(0) === '-';
    var h = Math.abs(parseInt(hourPart, 10));
    var m = parseInt(parts[1], 10);
    var s = parts.length >= 3 ? parseInt(parts[2], 10) : 0;
    if (!Number.isFinite(h) || !Number.isFinite(m) || !Number.isFinite(s)) {
        return NaN;
    }
    var totalSec = h * 3600 + m * 60 + s;
    return (negative ? -1 : 1) * totalSec * 1000;
}

function replyTimeOffsetMs(value) {
    if (value == null || value === '') {
        return 0;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    var s = String(value).trim();
    if (s === '') {
        return 0;
    }
    if (CSV_DURATION.test(s)) {
        var fromCsv = parseCsvDuration(s);
        return Number.isFinite(fromCsv) ? fromCsv : 0;
    }
    var n = Number(s);
    return Number.isFinite(n) ? n : 0;
}

module.exports = replyTimeOffsetMs;
module.exports.parseCsvDuration = parseCsvDuration;
