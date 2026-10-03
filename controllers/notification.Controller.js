const NotificationModel = require('../models/Notification.model');
const UserModel = require("../models/User.model");
const { getIO } = require('../socketio'); // Import Socket.IO instance
const ChatModel = require('../models/Chat.model');
const RoomModel = require('../models/Room.model');
const { API_BASE_URL } = require('../utils/apiBaseUrl');
const { sendPushToUser } = require('../utils/sendPushNotification');

const resolvePhotoUrl = (photo) => (photo ? `${API_BASE_URL}/${photo.replace(/\\/g, '/')}` : null);

// const sendNotification = async(req, res) => {
//     try {
//         const { senderId, receiverId, message } = req.body; // Get request data


//         // Verify sender and receiver exist
//         const sender = await UserModel.findById(senderId);
//         const receiver = await UserModel.findById(receiverId);

//         if (!sender || !receiver) {
//             return res.status(404).json({ message: 'Sender or Receiver not found' });
//         }

//         // Save notification to the database
//         const notification = new NotificationModel({
//             sender: senderId,
//             receiver: receiverId,
//             message
//         });

//         await notification.save();
//         console.log('Notification saved in database:', notification);
//          const populatedNotification = await NotificationModel.findById(notification._id)
//             .populate('sender', 'firstname lastname photo');
        
//         // Emit notification to all connected clients
//         const io = getIO();
//         io.emit('receive_notification', {
//             _id: notification._id,
//             sender: populatedNotification.sender,
//             receiverId: receiverId,
//             message,
//             createdAt: notification.createdAt
//         });
        
//         res.status(200).json({ 
//             message: 'Notification sent successfully',
//             notification 
//         });
        
//     } catch (error) {
//         console.error('Error sending notification:', error);
//         res.status(500).json({
//             message: 'Error sending notification',
//             error: error.message
//         });
//     }
// };


// Add these new functions to your existing notification controller

// Check relationship status between two users


const checkNotificationStatus = async (req, res) => {
  try {
    const { receiverId, senderId } = req.query;
    
    if (!receiverId || !senderId) {
      return res.status(400).json({ error: 'Both receiverId and senderId are required' });
    }

    // Check for pending notifications (both directions) — contact requests only,
    // so an in-progress binome proposal between existing friends doesn't get
    // mistaken for a fresh contact request.
    const pendingNotification = await NotificationModel.findOne({
      type: 'contact',
      $or: [
        { sender: senderId, receiver: receiverId, status: 'pending' },
        { sender: receiverId, receiver: senderId, status: 'pending' }
      ]
    });

    // Check for accepted notifications (both directions)
    const acceptedNotification = await NotificationModel.findOne({
      type: 'contact',
      $or: [
        { sender: senderId, receiver: receiverId, status: 'accepted' },
        { sender: receiverId, receiver: senderId, status: 'accepted' }
      ]
    });

    res.json({
      hasPending: !!pendingNotification,
      hasAccepted: !!acceptedNotification,
      relationshipStatus: acceptedNotification ? 'friends' : (pendingNotification ? 'pending' : 'none')
    });

  } catch (error) {
    console.error('Error checking notification status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Updated sendNotification function to prevent duplicates
const sendNotification = async (req, res) => {
  try {
    const { senderId, receiverId, message } = req.body;
    
    // Verify sender and receiver exist
    const sender = await UserModel.findById(senderId);
    const receiver = await UserModel.findById(receiverId);

    if (!sender || !receiver) {
      return res.status(404).json({ message: 'Sender or Receiver not found' });
    }

    // Check if there's already a pending or accepted contact notification between these users
    const existingNotification = await NotificationModel.findOne({
      type: 'contact',
      $or: [
        { sender: senderId, receiver: receiverId, status: { $in: ['pending', 'accepted'] } },
        { sender: receiverId, receiver: senderId, status: { $in: ['pending', 'accepted'] } }
      ]
    });

    if (existingNotification) {
      return res.status(409).json({
        error: 'A notification already exists between these users',
        status: existingNotification.status
      });
    }

    // Create new notification
    const notification = new NotificationModel({
      sender: senderId,
      receiver: receiverId,
      message,
      status: 'pending',
      type: 'contact'
    });

    await notification.save();
    console.log('Notification saved in database:', notification);
    
    // Populate sender info for socket emission
    const populatedNotification = await NotificationModel.findById(notification._id)
      .populate('sender', 'firstname lastname photo');
    const senderPayload = populatedNotification.sender.toObject();
    senderPayload.photo = resolvePhotoUrl(senderPayload.photo);

    // Emit notification to all connected clients
    const io = getIO();
    io.emit('receive_notification', {
      _id: notification._id,
      sender: senderPayload,
      receiverId: receiverId,
      message,
      createdAt: notification.createdAt,
      status: notification.status
    });

    sendPushToUser(receiverId, {
      title: `${senderPayload.firstname} vous a envoyé un message`,
      body: message,
      url: '/app/notifications'
    }).catch(() => {});

    res.status(200).json({
      message: 'Notification sent successfully',
      notification
    });

  } catch (error) {
    console.error('Error sending notification:', error);
    res.status(500).json({
      message: 'Error sending notification',
      error: error.message
    });
  }
};

// Propose becoming binômes — the counterpart must separately confirm via
// acceptNotification before the room actually gains an occupant.
const proposeBinome = async (req, res) => {
  try {
    const senderId = req.user._id;
    const { receiverId } = req.body;

    if (!receiverId) {
      return res.status(400).json({ message: 'receiverId est requis' });
    }

    const [sender, receiver, room, receiverRoom] = await Promise.all([
      UserModel.findById(senderId),
      UserModel.findById(receiverId),
      RoomModel.findOne({ user_id: senderId }),
      RoomModel.findOne({ user_id: receiverId })
    ]);

    if (!sender || !receiver) {
      return res.status(404).json({ message: 'Utilisateur introuvable' });
    }

    if (!room) {
      return res.status(400).json({ message: "Vous devez avoir un logement actif pour proposer un binôme" });
    }

    // The app doesn't merge two households into one — if the other person
    // already has their own active house, one of you needs to archive yours
    // first (from the Archive section) before a binôme proposal makes sense.
    if (receiverRoom) {
      return res.status(409).json({
        message: 'Cette personne a déjà son propre logement actif. Elle doit archiver son logement (ou vous le vôtre) avant de proposer un binôme.'
      });
    }

    const isAlreadyOccupant = room.occupants.some((id) => id.toString() === receiverId);
    if (isAlreadyOccupant) {
      return res.status(409).json({ message: 'Cette personne est déjà votre binôme' });
    }

    if (room.occupants.length >= room.nombreDeColocation) {
      return res.status(409).json({ message: 'Votre colocation est déjà complète' });
    }

    const existingProposal = await NotificationModel.findOne({
      type: 'binome',
      status: 'pending',
      $or: [
        { sender: senderId, receiver: receiverId },
        { sender: receiverId, receiver: senderId }
      ]
    });
    if (existingProposal) {
      return res.status(409).json({ message: 'Une proposition est déjà en cours avec cette personne' });
    }

    const notification = new NotificationModel({
      sender: senderId,
      receiver: receiverId,
      message: `${sender.firstname} vous propose de devenir binômes`,
      type: 'binome',
      roomId: room._id,
      status: 'pending'
    });
    await notification.save();

    const populatedNotification = await NotificationModel.findById(notification._id)
      .populate('sender', 'firstname lastname photo');
    const senderPayload = populatedNotification.sender.toObject();
    senderPayload.photo = resolvePhotoUrl(senderPayload.photo);

    const io = getIO();
    io.to(receiverId.toString()).emit('receive_notification', {
      _id: notification._id,
      sender: senderPayload,
      receiverId,
      message: notification.message,
      createdAt: notification.createdAt,
      status: notification.status,
      type: notification.type
    });

    sendPushToUser(receiverId, {
      title: 'Proposition de binôme',
      body: notification.message,
      url: '/app/notifications'
    }).catch(() => {});

    res.status(200).json({ message: 'Proposition envoyée', notification });
  } catch (error) {
    console.error('Error proposing binome:', error);
    res.status(500).json({ message: 'Erreur lors de la proposition', error: error.message });
  }
};

// Check if users have an existing conversation
const checkExistingConversation = async (req, res) => {
  try {
    const { userId } = req.query;
    const currentUserId = req.user._id;

    // Check if conversation exists between these users using your ChatModel
    const conversation = await ChatModel.findOne({
      $or: [
        { sender: currentUserId, receiver: userId },
        { sender: userId, receiver: currentUserId }
      ]
    });

    res.json({
      hasConversation: !!conversation,
      conversationId: conversation ? conversation._id : null
    });

  } catch (error) {
    console.error('Error checking existing conversation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};



const getNotifications = async(req, res) => {
    try {
        // Get the current user ID from the authenticated request
        const userId = req.user._id;
        
        // Find all notifications for this user
        const notifications = await NotificationModel.find({ receiver: userId })
            .populate('sender', 'firstname lastname photo _id')
            .sort({ createdAt: -1 });

        const resolvedNotifications = notifications.map((notification) => {
            const plain = notification.toObject();
            if (plain.sender) {
                plain.sender.photo = resolvePhotoUrl(plain.sender.photo);
            }
            return plain;
        });

        res.status(200).json(resolvedNotifications);
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({
            message: 'Error fetching notifications',
            error: error.message
        });
    }
};

const getUnreadNotificationsCount = async (req, res) => {
    try {
        const userId = req.user._id;
        const count = await NotificationModel.countDocuments({ receiver: userId, isRead: false });
        res.status(200).json({ count });
    } catch (error) {
        console.error('Error counting unread notifications:', error);
        res.status(500).json({ message: 'Error counting unread notifications', error: error.message });
    }
};

const markAllNotificationsAsRead = async (req, res) => {
    try {
        const userId = req.user._id;
        await NotificationModel.updateMany({ receiver: userId, isRead: false }, { $set: { isRead: true } });
        res.status(200).json({ message: 'Notifications marked as read' });
    } catch (error) {
        console.error('Error marking notifications as read:', error);
        res.status(500).json({ message: 'Error marking notifications as read', error: error.message });
    }
};


// Handle accepting a notification
const acceptNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user._id; // From your verifytoken middleware

    // Find the notification and verify it belongs to the current user
    const notification = await NotificationModel.findOne({
      _id: notificationId,
      receiver: userId
    });

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    if (notification.type === 'binome') {
      // Land the room mutation before touching the notification's own status,
      // so a failure here (full room, deleted room, etc.) leaves the proposal
      // exactly as it was — still pending, safe to retry — instead of getting
      // marked accepted while the room was never actually updated.
      const room = await RoomModel.findById(notification.roomId);
      if (!room) {
        return res.status(404).json({ message: 'Logement introuvable' });
      }

      const isAlreadyOccupant = room.occupants.some((id) => id.toString() === userId.toString());
      let willBeFull = false;
      if (!isAlreadyOccupant) {
        if (room.occupants.length >= room.nombreDeColocation) {
          return res.status(409).json({ message: 'Cette colocation est déjà complète' });
        }

        // The accepter must not already own their own active house — the app
        // doesn't reconcile two households into one, so they have to archive
        // their own listing first (see room.Controller's archiveCurrentUserRoom).
        const ownRoom = await RoomModel.findOne({ user_id: userId });
        if (ownRoom) {
          return res.status(409).json({
            message: 'Vous avez déjà un logement actif. Archivez-le avant de rejoindre une autre colocation.'
          });
        }

        const newOccupantCount = room.occupants.length + 1;
        willBeFull = newOccupantCount >= room.nombreDeColocation;

        // Targeted update instead of fetch+save: save() re-validates the whole
        // document, including unrelated legacy fields that may predate current
        // validation rules (e.g. an old room's disponibilite date).
        await RoomModel.findByIdAndUpdate(room._id, {
          $push: { occupants: userId },
          $set: {
            currentOccupants: newOccupantCount,
            ...(willBeFull ? { lastOwner: room.user_id } : {})
          },
          ...(willBeFull ? { $unset: { user_id: '' } } : {})
        });

        // The room's owner isn't part of this request/response cycle, so the
        // only way they learn their listing just got archived is a
        // notification — same reasoning as the binome-accepted one below.
        if (willBeFull && room.user_id) {
          const archiveNotification = new NotificationModel({
            sender: userId,
            receiver: room.user_id,
            message: 'Votre colocation est complète ! Votre logement a été archivé automatiquement.',
            type: 'house-archived',
            status: 'accepted'
          });
          await archiveNotification.save();

          const io = getIO();
          io.to(room.user_id.toString()).emit('receive_notification', {
            _id: archiveNotification._id,
            sender: { _id: userId },
            receiverId: room.user_id,
            message: archiveNotification.message,
            createdAt: archiveNotification.createdAt,
            type: 'house-archived'
          });

          sendPushToUser(room.user_id, {
            title: 'Colocation complète',
            body: archiveNotification.message,
            url: '/app/notifications'
          }).catch(() => {});
        }
      }

      notification.isRead = true;
      notification.status = 'accepted';
      await notification.save();

      // Let the original proposer know their request was accepted — they
      // have no other way of finding out short of noticing the binome
      // status change on their own.
      const accepter = await UserModel.findById(userId).select('firstname photo');
      const confirmationNotification = new NotificationModel({
        sender: userId,
        receiver: notification.sender,
        message: `${accepter?.firstname ?? 'Votre binôme'} a accepté votre demande de colocation ! Vous pouvez aller dans l'espace chat et commencer à discuter.`,
        type: 'binome-accepted',
        status: 'accepted'
      });
      await confirmationNotification.save();

      const io = getIO();
      io.to(notification.sender.toString()).emit('receive_notification', {
        _id: confirmationNotification._id,
        sender: { _id: userId, firstname: accepter?.firstname, photo: resolvePhotoUrl(accepter?.photo) },
        receiverId: notification.sender,
        message: confirmationNotification.message,
        createdAt: confirmationNotification.createdAt,
        type: 'binome-accepted'
      });

      sendPushToUser(notification.sender, {
        title: 'Proposition acceptée',
        body: confirmationNotification.message,
        url: '/app/notifications'
      }).catch(() => {});

      return res.status(200).json({
        message: 'Vous êtes maintenant binômes !',
        notification,
        becameBinome: true,
        roomNowFull: willBeFull
      });
    }

    // Mark the notification as accepted/read
    notification.isRead = true;
    notification.status = 'accepted'; // Add a status field if you don't have one
    await notification.save();

    // Create a new conversation between the users or find an existing one
    let conversation = await ChatModel.findOne({
      $or: [
        { sender: userId, receiver: notification.sender },
        { sender: notification.sender, receiver: userId }
      ]
    });

    if (!conversation) {
      // Create a new conversation record (initial welcome message)
      conversation = new ChatModel({
        sender: userId,
        receiver: notification.sender,
        message: "Bonjour ! J'ai accepté votre demande de contact."
      });

      await conversation.save();
    }

    // Let the original sender know their contact request was accepted — same
    // reasoning as the binome-accepted notification above: they have no
    // other way of finding out.
    const accepterUser = await UserModel.findById(userId).select('firstname photo');
    const contactAcceptedNotification = new NotificationModel({
      sender: userId,
      receiver: notification.sender,
      message: `${accepterUser?.firstname ?? 'Cette personne'} a accepté votre demande de contact ! Vous pouvez aller dans l'espace chat et commencer à discuter.`,
      type: 'contact-accepted',
      status: 'accepted'
    });
    await contactAcceptedNotification.save();

    const ioForContact = getIO();
    ioForContact.to(notification.sender.toString()).emit('receive_notification', {
      _id: contactAcceptedNotification._id,
      sender: { _id: userId, firstname: accepterUser?.firstname, photo: resolvePhotoUrl(accepterUser?.photo) },
      receiverId: notification.sender,
      message: contactAcceptedNotification.message,
      createdAt: contactAcceptedNotification.createdAt,
      type: 'contact-accepted'
    });

    sendPushToUser(notification.sender, {
      title: 'Demande de contact acceptée',
      body: contactAcceptedNotification.message,
      url: '/app/notifications'
    }).catch(() => {});

    // Return the conversation for frontend redirect
    res.status(200).json({
      message: 'Notification accepted successfully',
      notification,
      conversationId: conversation._id
    });

  } catch (error) {
    console.error('Error accepting notification:', error);
    res.status(500).json({
      message: 'Error accepting notification',
      error: error.message
    });
  }
};
  
  // Handle refusing a notification
  const refuseNotification = async (req, res) => {
        try {
      const { notificationId } = req.params;
      const userId = req.user._id; // Assuming your verifytoken middleware adds user to req
  
      // Find the notification and verify it belongs to the current user
      const notification = await NotificationModel.findOne({
        _id: notificationId,
        receiver: userId
      });
  
      if (!notification) {
        return res.status(404).json({ message: 'Notification not found' });
      }

      // Only an actual pending request (contact/binome) being turned down
      // notifies the original sender — dismissing a purely informational
      // notification (alert, binome-accepted) isn't "rejecting" anyone.
      if (notification.type === 'contact' || notification.type === 'binome') {
        const rejecter = await UserModel.findById(userId).select('firstname photo');
        const message = notification.type === 'binome'
          ? `${rejecter?.firstname ?? 'Cette personne'} a refusé votre demande de colocation.`
          : `${rejecter?.firstname ?? 'Cette personne'} a refusé votre demande de contact.`;

        const rejectionNotification = new NotificationModel({
          sender: userId,
          receiver: notification.sender,
          message,
          type: 'rejected',
          status: 'refused'
        });
        await rejectionNotification.save();

        const io = getIO();
        io.to(notification.sender.toString()).emit('receive_notification', {
          _id: rejectionNotification._id,
          sender: { _id: userId, firstname: rejecter?.firstname, photo: resolvePhotoUrl(rejecter?.photo) },
          receiverId: notification.sender,
          message,
          createdAt: rejectionNotification.createdAt,
          type: 'rejected'
        });

        sendPushToUser(notification.sender, {
          title: 'Demande refusée',
          body: message,
          url: '/app/notifications'
        }).catch(() => {});
      }

      // Delete the original pending notification
      await NotificationModel.deleteOne({ _id: notificationId });

      res.status(200).json({
        message: 'Notification refused successfully'
      });
  
    } catch (error) {
      console.error('Error refusing notification:', error);
      res.status(500).json({
        message: 'Error refusing notification',
        error: error.message
      });
    }
  };


  // Delete a notification
const deleteNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user._id; // From your verifyToken middleware

    // Find the notification and verify it belongs to the current user
    const notification = await NotificationModel.findOne({
      _id: notificationId,
      receiver: userId
    });

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    // Delete the notification
    await NotificationModel.findByIdAndDelete(notificationId);

    res.status(200).json({ message: 'Notification deleted successfully' });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({
      message: 'Error deleting notification',
      error: error.message
    });
  }
};


module.exports = { sendNotification,getNotifications,acceptNotification,refuseNotification,deleteNotification,
  checkNotificationStatus,checkExistingConversation,proposeBinome,getUnreadNotificationsCount,markAllNotificationsAsRead }