// Every uploaded photo/equipment path stored in the DB is relative
// (e.g. "UsersImages/xyz.jpg"); this turns it into the absolute URL the
// frontend can load. Centralized so deploying to a real domain only needs
// API_BASE_URL set once, instead of hardcoded localhost URLs scattered
// across every controller that returns a photo.
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3003';

module.exports = { API_BASE_URL };
