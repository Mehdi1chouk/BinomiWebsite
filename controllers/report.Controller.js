const ReportModel = require("../models/Report.model");
//const BannedEmailModel = require("../models/BannedEmail.model");
const BannedEmailModel=require("../models/BannedEmail.model")
const UserModel = require("../models/User.model");
const jwt = require('jsonwebtoken');

exports.reportUser = async (req, res) => {
    try {
        const { reportedUserId, reason } = req.body;
        
        // Get reporter ID from token
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).send({ message: 'Token manquant' });
        }
        
        const decoded = jwt.verify(token, process.env.SECRET);
        const reporterId = decoded._id;
        
        // Check if reporter already reported this user
        const existingReport = await ReportModel.findOne({
            reporterId,
            reportedUserId
        });
        
        if (existingReport) {
            return res.status(400).send({ message: 'Vous avez déjà signalé cet utilisateur' });
        }
        
        // Check if reported user exists
        const reportedUser = await UserModel.findById(reportedUserId);
        if (!reportedUser) {
            return res.status(404).send({ message: 'Utilisateur non trouvé' });
        }
        
        // Create the report
        const newReport = new ReportModel({
            reporterId,
            reportedUserId,
            reason: reason || 'Inappropriate behavior'
        });
        
        await newReport.save();
        
        // Count total reports for this user
        const reportCount = await ReportModel.countDocuments({ reportedUserId });
        
        // If user has been reported 3 or more times, ban them
        if (reportCount >= 3) {
            // Check if email is already banned
            const existingBan = await BannedEmailModel.findOne({ email: reportedUser.email });
            
            if (!existingBan) {
                // Ban the email
                const bannedEmail = new BannedEmailModel({
                    email: reportedUser.email,
                    userId: reportedUserId,
                    reportCount: reportCount
                });
                
                await bannedEmail.save();
                
                return res.send({ 
                    message: 'Utilisateur signalé et banni avec succès',
                    banned: true,
                    reportCount 
                });
            }
        }
        
        res.send({ 
            message: 'Utilisateur signalé avec succès',
            banned: false,
            reportCount 
        });
        
    } catch (err) {
        console.error('Report error:', err);
        res.status(500).send({ message: 'Erreur interne du serveur' });
    }
};

exports.checkBannedEmail = async (email) => {
    try {
        const bannedEmail = await BannedEmailModel.findOne({ email });
        return bannedEmail !== null;
    } catch (err) {
        console.error('Error checking banned email:', err);
        return false;
    }
};