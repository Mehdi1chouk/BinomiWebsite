const Hashids = require("hashids/cjs");
const hashids = new Hashids("binomy-secret", 10); // Replace with a secure secret

module.exports = {
  encodeRoomId: (id) => hashids.encodeHex(id.toString()),
  decodeRoomId: (encodedId) => hashids.decodeHex(encodedId),
};
