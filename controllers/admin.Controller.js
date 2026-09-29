const UserModel = require('../models/User.model');
const ReportModel = require('../models/Report.model');
const BannedEmailModel = require('../models/BannedEmail.model');
const NotificationModel = require('../models/Notification.model');
const { getIO } = require('../socketio');

const resolvePhotoUrl = (photo) => (photo ? `http://localhost:3003/${photo.replace(/\\/g, '/')}` : null);

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
        const user = await UserModel.findById(entry._id).select('firstname lastname email photo isBanned banReason');
        if (!user) return null;
        return {
          userId: entry._id,
          firstname: user.firstname,
          lastname: user.lastname,
          email: user.email,
          photo: resolvePhotoUrl(user.photo),
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

    res.status(200).json({ success: true, message: 'Utilisateur débanni' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur lors du débannissement', error: error.message });
  }
};
