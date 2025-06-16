// Run with: node scripts/hash-password.js
const bcrypt = require('bcryptjs');
const saltRounds = 10;
const myPlaintextPassword = 'admin123'; // Change this to your desired password

bcrypt.hash(myPlaintextPassword, saltRounds, function(err, hash) {
    if (err) {
        console.error('Error hashing password:', err);
        return;
    }
    console.log('Password:', myPlaintextPassword);
    console.log('Hashed password:', hash);
    console.log('Use this hash in your database for the admin user');
}); 