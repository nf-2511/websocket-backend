// One-off CLI script — nothing should auto-grant the admin role.
// Usage: node scripts/promoteAdmin.js someone@gmail.com
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');

const email = process.argv[2];
if (!email) {
    console.error('Usage: node scripts/promoteAdmin.js <email>');
    process.exit(1);
}

(async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    const user = await User.findOneAndUpdate(
        { email: email.trim().toLowerCase() },
        { role: 'admin' },
        { returnDocument: 'after' }
    );
    if (!user) {
        console.error(`No user found with email ${email}`);
        process.exit(1);
    }
    console.log(`${user.email} is now an admin.`);
    await mongoose.disconnect();
})();
