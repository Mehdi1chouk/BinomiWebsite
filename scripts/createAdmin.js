// One-off / reusable utility to create or promote an admin account.
// Usage: node scripts/createAdmin.js <email> <password> [firstname] [lastname]
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const UserModel = require('../models/User.model');

async function main() {
  const [, , email, password, firstname = 'Admin', lastname = 'Binomy'] = process.argv;

  if (!email || !password) {
    console.error('Usage: node scripts/createAdmin.js <email> <password> [firstname] [lastname]');
    process.exit(1);
  }

  await mongoose.connect(process.env.DB);

  const hashedPassword = await bcrypt.hash(password, await bcrypt.genSalt(12));
  const existing = await UserModel.findOne({ email });

  if (existing) {
    existing.role = 'admin';
    existing.password = hashedPassword;
    existing.isBanned = false;
    existing.banReason = undefined;
    await existing.save();
    console.log(`Existing account ${email} promoted to admin and password updated.`);
  } else {
    await UserModel.create({
      firstname,
      lastname,
      age: 30,
      email,
      password: hashedPassword,
      gender: 'male',
      governorate: 'Tunis',
      city: 'Tunis',
      profession: 'Admin',
      workplace: 'Binomy',
      photo: 'UsersImages/admin-placeholder.jpg',
      role: 'admin',
    });
    console.log(`Admin account created: ${email}`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
