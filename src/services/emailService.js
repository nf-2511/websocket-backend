const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendOTPEmail(toEmail, code) {
    await resend.emails.send({
        from: 'MARS CHAT <onboarding@resend.dev>',
        to: [toEmail],
        subject: 'MARS CHAT — Your Access Code',
        html: `
        <div style="background:#020408;padding:40px;font-family:monospace;border:1px solid #00f5ff33;">
            <div style="text-align:center;margin-bottom:30px;">
                <h1 style="color:#00f5ff;font-size:28px;letter-spacing:4px;text-shadow:0 0 10px #00f5ff;">
                    MARS CHAT
                </h1>
                <p style="color:#00f5ff88;font-size:12px;letter-spacing:2px;">SECURE TRANSMISSION</p>
            </div>
            <div style="background:rgba(0,245,255,0.05);border:1px solid #00f5ff33;padding:30px;text-align:center;">
                <p style="color:#a0c0e0;margin-bottom:20px;letter-spacing:1px;">YOUR ACCESS CODE</p>
                <div style="background:#000;border:2px solid #00f5ff;display:inline-block;padding:20px 40px;letter-spacing:12px;">
                    <span style="color:#00f5ff;font-size:36px;font-weight:bold;text-shadow:0 0 20px #00f5ff;">
                        ${code}
                    </span>
                </div>
                <p style="color:#607080;margin-top:20px;font-size:12px;">
                    Expires in 5 minutes
                </p>
            </div>
            <p style="color:#304050;text-align:center;margin-top:20px;font-size:11px;">
                If you didn't request this code, ignore this message.
            </p>
        </div>
        `,
    });
}

module.exports = { sendOTPEmail };
