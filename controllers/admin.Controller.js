const UserModel = require('../models/User.model');
const ReportModel = require('../models/Report.model');
const BannedEmailModel = require('../models/BannedEmail.model');
const NotificationModel = require('../models/Notification.model');
const RoomModel = require('../models/Room.model');
const AdminActionModel = require('../models/AdminAction.model');
const ChatModel = require('../models/Chat.model');
const PushSubscriptionModel = require('../models/PushSubscription.model');
const { getIO } = require('../socketio');
const { API_BASE_URL } = require('../utils/apiBaseUrl');
const { deleteUploadedFile, deleteUploadedFiles } = require('../utils/deleteUploadedFile');
const { sendPushToUser, sendPushToUsers } = require('../utils/sendPushNotification');

const resolvePhotoUrl = (photo) => (photo ? `${API_BASE_URL}/${photo.replace(/\\/g, '/')}` : null);

// req.user (from the JWT) only carries _id/role/tokenVersion, not a display
// name, so the admin's own record is looked up here to label the log entry.
const logAdminAction = async (adminId, action, targetType, targetId, details) => {
  try {
    const admin = await UserModel.findById(adminId).select('firstname lastname email');
    const adminName = admin?.firstname ? `${admin.firstname} ${admin.lastname ?? ''}`.trim() : (admin?.email ?? 'Admin');
    await AdminActionModel.create({
      adminId,
      adminName,
      action,
      targetType,
      targetId,
      details
    });
  } catch (error) {
    console.error('Error logging admin action:', error);
  }
};

// One row per reported user, with how many reports they've accumulated —
// this is the admin dashboard's main list.
exports.getReportedUsers = async (req, res) => {
  try {
    const grouped = await ReportModel.aggregate([
      { $group: { _id: '$reportedUserId', reportCount: { $sum: 1 }, lastReportAt: { $max: '$createdAt' } } },
      { $sort: { reportCount: -1, lastReportAt: -1 } },
    ]);

    const users = await Promise.all(
      grouped.map(async (entry) => {
        const user = await UserModel.findById(entry._id).select('firstname lastname email photo gender isBanned banReason');
        if (!user) return null;
        return {
          userId: entry._id,
          firstname: user.firstname,
          lastname: user.lastname,
          email: user.email,
          photo: resolvePhotoUrl(user.photo),
          gender: user.gender,
          isBanned: user.isBanned,
          banReason: user.banReason,
          reportCount: entry.reportCount,
          lastReportAt: entry.lastReportAt,
        };
      }),
    );

    res.status(200).json({ success: true, data: users.filter(Boolean) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching reported users', error: error.message });
  }
};

exports.getReportsForUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const reports = await ReportModel.find({ reportedUserId: userId })
      .populate('reporterId', 'firstname lastname email photo')
      .sort({ createdAt: -1 });

    const data = reports.map((report) => ({
      _id: report._id,
      reason: report.reason,
      category: report.category,
      createdAt: report.createdAt,
      reporter: report.reporterId
        ? {
            _id: report.reporterId._id,
            firstname: report.reporterId.firstname,
            lastname: report.reporterId.lastname,
            email: report.reporterId.email,
            photo: resolvePhotoUrl(report.reporterId.photo),
          }
        : null,
    }));

    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching reports', error: error.message });
  }
};

exports.sendAlert = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Utilisateur introuvable' });
    }

    const message =
      req.body.message ||
      "Vous avez reçu un avertissement de la part de l'administration suite à des signalements. En cas de nouveau signalement, votre compte pourra être banni.";

    const notification = new NotificationModel({
      sender: req.user._id,
      receiver: userId,
      message,
      type: 'alert',
      status: 'accepted',
    });
    await notification.save();

    const io = getIO();
    io.to(userId.toString()).emit('receive_notification', {
      _id: notification._id,
      sender: { _id: req.user._id, firstname: 'Administration' },
      receiverId: userId,
      message,
      createdAt: notification.createdAt,
      type: 'alert',
    });

    sendPushToUser(userId, {
      title: 'Avertissement de Binomi',
      body: message,
      url: '/app/notifications'
    }).catch(() => {});

    await logAdminAction(req.user._id, 'alert', 'user', userId, message);

    res.status(200).json({ success: true, message: 'Alerte envoyée' });
  } catch (error) {
    res.status(500).json({ success: false, message: "Erreur lors de l'envoi de l'alerte", error: error.message });
  }
};

exports.banUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;
    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Utilisateur introuvable' });
    }

    const banReason = reason || 'Multiples signalements reçus';

    await UserModel.findByIdAndUpdate(userId, {
      isBanned: true,
      banReason,
      $inc: { tokenVersion: 1 },
    });

    await BannedEmailModel.findOneAndUpdate(
      { email: user.email },
      { email: user.email, userId, reason: banReason },
      { upsert: true },
    );

    await logAdminAction(req.user._id, 'ban', 'user', userId, banReason);

    res.status(200).json({ success: true, message: 'Utilisateur banni' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur lors du bannissement', error: error.message });
  }
};

exports.unbanUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Utilisateur introuvable' });
    }

    await UserModel.findByIdAndUpdate(userId, { isBanned: false, banReason: null });
    await BannedEmailModel.deleteOne({ email: user.email });

    await logAdminAction(req.user._id, 'unban', 'user', userId, null);

    res.status(200).json({ success: true, message: 'Utilisateur débanni' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur lors du débannissement', error: error.message });
  }
};

// Permanently removes the account — unlike banUser, this frees the email to
// register again (no BannedEmail entry left behind) and erases the person
// entirely rather than just locking them out. Cascades everything a dangling
// reference to this id could otherwise break or leave stale:
//  - a room they OWN is deleted outright, photos included — unlike the
//    self-service deleteRoom, this never blocks on existing occupants,
//    since the owner themself is the one being removed;
//  - a room they're an OCCUPANT of (someone else's binôme) just loses them
//    from its occupants list — the room and any other occupant are
//    untouched, per the ask: binômes "still exist in application";
//  - notifications, chat messages, reports and push subscriptions involving
//    them are purged so nothing keeps referencing a user that no longer
//    exists.
exports.deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Utilisateur introuvable' });
    }
    if (user.role === 'admin') {
      return res.status(403).json({ success: false, message: 'Impossible de supprimer un compte administrateur' });
    }

    const ownedRoom = await RoomModel.findOne({ user_id: userId });
    if (ownedRoom) {
      await RoomModel.findByIdAndDelete(ownedRoom._id);
      deleteUploadedFiles(ownedRoom.photos);
    }

    await RoomModel.updateMany(
      { occupants: userId },
      { $pull: { occupants: userId }, $inc: { currentOccupants: -1 } },
    );
    // $inc above can take a room to -1 if currentOccupants was already out of
    // sync — same floor decrementCurrentUserOccupants applies for the same
    // reason (room.Controller.js).
    await RoomModel.updateMany({ currentOccupants: { $lt: 0 } }, { $set: { currentOccupants: 0 } });

    await Promise.all([
      NotificationModel.deleteMany({ $or: [{ sender: userId }, { receiver: userId }] }),
      ChatModel.deleteMany({ $or: [{ sender: userId }, { receiver: userId }] }),
      ReportModel.deleteMany({ $or: [{ reporterId: userId }, { reportedUserId: userId }] }),
      PushSubscriptionModel.deleteMany({ user: userId }),
      BannedEmailModel.deleteOne({ email: user.email }),
    ]);

    deleteUploadedFile(user.photo);
    await UserModel.findByIdAndDelete(userId);

    await logAdminAction(req.user._id, 'delete-user', 'user', userId, `${user.firstname} ${user.lastname} (${user.email})`);

    res.status(200).json({ success: true, message: 'Utilisateur supprimé' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error deleting user', error: error.message });
  }
};

// General user directory — search by name/email, optionally filtered by
// status. This is what admin.Controller was missing entirely before: the
// only way to reach a user was if they'd already been reported.
exports.searchUsers = async (req, res) => {
  try {
    const { query, status, gender } = req.query;
    const filter = { role: { $ne: 'admin' } };

    if (query && query.trim()) {
      const regex = new RegExp(query.trim(), 'i');
      filter.$or = [{ firstname: regex }, { lastname: regex }, { email: regex }];
    }

    if (status === 'banned') filter.isBanned = true;
    else if (status === 'verified') filter.isVerified = true;
    else if (status === 'unverified') filter.isVerified = { $ne: true };
    else if (status === 'hidden') filter.isHidden = true;

    if (gender === 'male' || gender === 'female') filter.gender = gender;

    const users = await UserModel.find(filter)
      .select('firstname lastname email photo gender isBanned isVerified isHidden createdAt')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const data = users.map((user) => ({
      ...user,
      photo: resolvePhotoUrl(user.photo),
    }));

    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error searching users', error: error.message });
  }
};

// Full profile view for one user — personal info, verification/ban status,
// their active + archived rooms, and reports made against them, all in one
// place instead of piecing it together across pages.
exports.getUserDetail = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await UserModel.findById(userId).select('-password').lean();
    if (!user) {
      return res.status(404).json({ success: false, message: 'Utilisateur introuvable' });
    }
    user.photo = resolvePhotoUrl(user.photo);

    const [activeRoom, archivedRooms, reports] = await Promise.all([
      RoomModel.findOne({ user_id: userId }).select('type region ville price nombreDeColocation currentOccupants').lean(),
      RoomModel.find({ user_id: null, lastOwner: userId }).select('type region ville price nombreDeColocation currentOccupants').lean(),
      ReportModel.find({ reportedUserId: userId })
        .populate('reporterId', 'firstname lastname email photo')
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    const formattedReports = reports.map((report) => ({
      _id: report._id,
      reason: report.reason,
      category: report.category,
      createdAt: report.createdAt,
      reporter: report.reporterId
        ? {
            _id: report.reporterId._id,
            firstname: report.reporterId.firstname,
            lastname: report.reporterId.lastname,
            email: report.reporterId.email,
            photo: resolvePhotoUrl(report.reporterId.photo),
          }
        : null,
    }));

    res.status(200).json({
      success: true,
      data: {
        user,
        activeRoom: activeRoom || null,
        archivedRooms,
        reports: formattedReports,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching user detail', error: error.message });
  }
};

// Manually force a user's verification state — a support tool for cases
// like "my liveness test keeps failing" without them redoing the whole flow,
// or to revoke a verification badge that shouldn't have been granted.
exports.setVerification = async (req, res) => {
  try {
    const { userId } = req.params;
    const { isVerified } = req.body;
    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Utilisateur introuvable' });
    }

    await UserModel.findByIdAndUpdate(userId, { isVerified: !!isVerified });
    await logAdminAction(req.user._id, isVerified ? 'verify' : 'unverify', 'user', userId, null);

    res.status(200).json({ success: true, message: isVerified ? 'Utilisateur vérifié' : 'Vérification retirée' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error updating verification', error: error.message });
  }
};

// Listings moderation — every room, active or archived, with its owner's
// info, so a spammy/fake listing can be removed even though only the owner
// could delete it through the normal app flow.
exports.getListings = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status === 'active') filter.user_id = { $ne: null };
    else if (status === 'archived') filter.user_id = null;

    const rooms = await RoomModel.find(filter)
      .select('type region ville quartier price user_id lastOwner nombreDeColocation currentOccupants createdAt')
      .populate('user_id', 'firstname lastname email gender')
      .populate('lastOwner', 'firstname lastname email gender')
      .sort({ _id: -1 })
      .limit(100)
      .lean();

    const data = rooms.map((room) => ({
      _id: room._id,
      type: room.type,
      region: room.region,
      ville: room.ville,
      quartier: room.quartier,
      price: room.price,
      nombreDeColocation: room.nombreDeColocation,
      currentOccupants: room.currentOccupants,
      isArchived: !room.user_id,
      owner: room.user_id || room.lastOwner || null,
    }));

    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching listings', error: error.message });
  }
};

exports.removeListing = async (req, res) => {
  try {
    const { roomId } = req.params;
    const room = await RoomModel.findById(roomId);
    if (!room) {
      return res.status(404).json({ success: false, message: 'Logement introuvable' });
    }

    await RoomModel.findByIdAndDelete(roomId);
    deleteUploadedFiles(room.photos);
    await logAdminAction(req.user._id, 'delete-room', 'room', roomId, `${room.type} - ${room.ville}`);

    res.status(200).json({ success: true, message: 'Logement supprimé' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error removing listing', error: error.message });
  }
};

// At-a-glance health check of the app — nothing like this existed before,
// so checking on the app meant querying the database by hand.
exports.getDashboardStats = async (req, res) => {
  try {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      verifiedUsers,
      bannedUsers,
      activeRooms,
      archivedRooms,
      totalReports,
      reportsThisWeek,
      totalMessages,
      maleTotal,
      maleVerified,
      maleBanned,
      femaleTotal,
      femaleVerified,
      femaleBanned,
    ] = await Promise.all([
      UserModel.countDocuments({ role: { $ne: 'admin' } }),
      UserModel.countDocuments({ role: { $ne: 'admin' }, isVerified: true }),
      UserModel.countDocuments({ role: { $ne: 'admin' }, isBanned: true }),
      RoomModel.countDocuments({ user_id: { $ne: null } }),
      RoomModel.countDocuments({ user_id: null }),
      ReportModel.countDocuments({}),
      ReportModel.countDocuments({ createdAt: { $gte: weekAgo } }),
      ChatModel.countDocuments({}),
      UserModel.countDocuments({ role: { $ne: 'admin' }, gender: 'male' }),
      UserModel.countDocuments({ role: { $ne: 'admin' }, gender: 'male', isVerified: true }),
      UserModel.countDocuments({ role: { $ne: 'admin' }, gender: 'male', isBanned: true }),
      UserModel.countDocuments({ role: { $ne: 'admin' }, gender: 'female' }),
      UserModel.countDocuments({ role: { $ne: 'admin' }, gender: 'female', isVerified: true }),
      UserModel.countDocuments({ role: { $ne: 'admin' }, gender: 'female', isBanned: true }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalUsers,
        verifiedUsers,
        unverifiedUsers: totalUsers - verifiedUsers,
        bannedUsers,
        activeRooms,
        archivedRooms,
        totalReports,
        reportsThisWeek,
        totalMessages,
        genderBreakdown: {
          male: { total: maleTotal, verified: maleVerified, unverified: maleTotal - maleVerified, banned: maleBanned },
          female: { total: femaleTotal, verified: femaleVerified, unverified: femaleTotal - femaleVerified, banned: femaleBanned },
        },
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching stats', error: error.message });
  }
};

// Send an 'alert'-type notification to every user in a segment at once,
// instead of the one-by-one flow the reports dashboard uses.
exports.broadcast = async (req, res) => {
  try {
    const { message, segment, gender } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, message: 'Le message est requis' });
    }

    const filter = { role: { $ne: 'admin' }, isBanned: { $ne: true } };
    if (segment === 'verified') filter.isVerified = true;
    else if (segment === 'unverified') filter.isVerified = { $ne: true };

    // Independent of the verified/unverified segment above — the two can be
    // combined (e.g. "verified" + "female") rather than gender being just
    // another segment option.
    if (gender === 'male' || gender === 'female') filter.gender = gender;

    const targets = await UserModel.find(filter).select('_id').lean();
    if (targets.length === 0) {
      return res.status(200).json({ success: true, message: 'Aucun destinataire pour ce segment', recipientCount: 0 });
    }

    const notifications = targets.map((target) => ({
      sender: req.user._id,
      receiver: target._id,
      message: message.trim(),
      type: 'alert',
      status: 'accepted',
    }));
    const created = await NotificationModel.insertMany(notifications);

    const io = getIO();
    created.forEach((notification) => {
      io.to(notification.receiver.toString()).emit('receive_notification', {
        _id: notification._id,
        sender: { _id: req.user._id, firstname: 'Administration' },
        receiverId: notification.receiver,
        message: notification.message,
        createdAt: notification.createdAt,
        type: 'alert',
      });
    });

    sendPushToUsers(targets.map((target) => target._id), {
      title: 'Binomi',
      body: message.trim(),
      url: '/app/notifications'
    }).catch(() => {});

    const segmentLabel = [segment || 'all', gender].filter(Boolean).join(' + ');
    await logAdminAction(req.user._id, 'broadcast', 'broadcast', null, `${segmentLabel}: ${message.trim()} (${targets.length} destinataires)`);

    res.status(200).json({ success: true, message: 'Diffusion envoyée', recipientCount: targets.length });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error broadcasting', error: error.message });
  }
};

exports.getAuditLog = async (req, res) => {
  try {
    const actions = await AdminActionModel.find({}).sort({ createdAt: -1 }).limit(200).lean();
    res.status(200).json({ success: true, data: actions });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching audit log', error: error.message });
  }
};
