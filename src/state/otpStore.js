// email -> { code, expiresAt, attempts }. Process-local, purged every 60s.
const otpStore = new Map();
const OTP_MAX_ATTEMPTS = 5;

setInterval(() => {
    const now = Date.now();
    for (const [email, record] of otpStore.entries()) {
        if (now > record.expiresAt) otpStore.delete(email);
    }
}, 60 * 1000);

module.exports = { otpStore, OTP_MAX_ATTEMPTS };
