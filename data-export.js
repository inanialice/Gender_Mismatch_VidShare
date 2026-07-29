const dotenv = require('dotenv');
dotenv.config({ path: '.env' });

const Script = require('./models/Script.js');
const User = require('./models/User.js');
const helpers = require('./controllers/helpers');
const mongoose = require('mongoose');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

// Console.log color shortcuts
const color_start = '\x1b[33m%s\x1b[0m'; // yellow
const color_success = '\x1b[32m%s\x1b[0m'; // green
const color_error = '\x1b[31m%s\x1b[0m'; // red

const placeholderCache = {};
async function getIdentityPlaceholders(interest) {
    if (placeholderCache[interest]) return placeholderCache[interest];
    const scripts = await Script.find({ class: interest }).exec();
    const harassmentPlaceholders = [];
    const counterspeechPlaceholders = [];
    for (const script of scripts) {
        for (const comment of (script.comments || [])) {
            if (String(comment.body || '').indexOf('Manipulated Harassment Message') === 0) {
                harassmentPlaceholders.push({ postID: script.postID, commentID: comment.commentID });
            }
            for (const sub of (comment.subcomments || [])) {
                if (String(sub.body || '').indexOf('Manipulated Objection Message') === 0 ||
                    String(sub.class || '').indexOf('objection') === 0) {
                    counterspeechPlaceholders.push({ postID: script.postID, commentID: sub.commentID });
                }

            }
        }
    }
    placeholderCache[interest] = { harassmentPlaceholders, counterspeechPlaceholders };
    return placeholderCache[interest];
}

// establish initial Mongoose connection, if Research Site
mongoose.connect(process.env.MONGOLAB_URI, { useNewUrlParser: true });
// listen for errors after establishing initial connection
db = mongoose.connection;
db.on('error', (err) => {
    console.error(err);
    console.log(color_error, '%s MongoDB connection error.');
    process.exit(1);
});
console.log(color_success, `Successfully connected to db.`);

/*
  Gets the user models from the database specified in the .env file.
*/
async function getUserJsons() {
    const studyLaunchDate = new Date("2024-06-06T00:00:00.000Z")
    const users = await User
        .find({ isAdmin: false, createdAt: { $gte: studyLaunchDate } })
        .populate('feedAction.post')
        .exec();
    return users;
}

/*
  Gets the mongoDB object id value of the offense message.
*/
async function getOffenseId(interest) {
    const videoObjs = await Script
        .find({ class: interest })
        .sort({ postID: -1 })
        .limit(1)
        .exec();
    if (!videoObjs.length || !Array.isArray(videoObjs[0].comments)) {
        return null;
    }
    const offenseObj = videoObjs[0].comments.find(comment =>
        String(comment.class || '').indexOf('offense') === 0 ||
        String(comment.body || '').indexOf('Manipulated Harassment Message') === 0
    );
    return offenseObj ? offenseObj.id : null;
}

/*
  Gets the mongoDB object ids of the harassment ("Manipulated Harassment Message")
  and objection ("Manipulated Objection Message") comments, which live on the
  FIRST video for the interest (unlike the offense message above, which is on the last).
*/
async function getFirstVideoStimulusIds(interest) {
    const videoObjs = await Script
        .find({ class: interest })
        .sort({ postID: 1 })
        .limit(1)
        .exec();
    if (!videoObjs.length || !Array.isArray(videoObjs[0].comments)) {
        return { postID: null, harassmentId: null, objectionId: null };
    }
    const harassmentObj = videoObjs[0].comments.find(comment =>
        String(comment.class || '').indexOf('offense') === 0 ||
        String(comment.body || '').indexOf('Manipulated Harassment Message') === 0
    );
    let objectionId = null;
    if (harassmentObj && Array.isArray(harassmentObj.subcomments)) {
        const objectionObj = harassmentObj.subcomments.find(sub =>
            String(sub.class || '').indexOf('objection') === 0 ||
            String(sub.body || '').indexOf('Manipulated Objection Message') === 0
        );
        objectionId = objectionObj ? objectionObj.id : null;
    }
    return {
        postID: videoObjs[0].postID,
        harassmentId: harassmentObj ? harassmentObj.id : null,
        objectionId
    };
}

async function getDataExport() {
    const users = await getUserJsons();

    console.log(color_start, `Starting the data export script...`);
    const currentDate = new Date();
    const outputFilename =
        `truman_Objections-SocialNorms-dataExport` +
        `.${currentDate.getMonth()+1}-${currentDate.getDate()}-${currentDate.getFullYear()}` +
        `.${currentDate.getHours()}-${currentDate.getMinutes()}-${currentDate.getSeconds()}`;
    const outputFilepath = `./outputFiles/${outputFilename}.csv`;
    const csvWriter_header = [
        { id: 'id', title: "Qualtrics ID" },
        { id: 'username', title: "Username" },
        { id: 'Topic', title: 'Topic' },
        { id: 'Condition', title: 'Condition' },
        { id: 'NumVideosVisited_Tutorial', title: 'NumVideosVisited_Tutorial (max: 6)' },
        { id: 'NumVideosVisited_Behavioral', title: 'NumVideosVisited_Behavioral (max: 3)' },
        { id: 'V1_visited', title: 'V1_visited (T/F)' },
        { id: 'V2_visited', title: 'V2_visited (T/F)' },
        { id: 'V3_visited', title: 'V3_visited (T/F)' },
        { id: 'V4_visited', title: 'V4_visited (T/F)' },
        { id: 'V5_visited', title: 'V5_visited (T/F)' },
        { id: 'V6_visited', title: 'V6_visited (T/F)' },
        { id: 'V7_visited', title: 'V7_visited (T/F)' },
        { id: 'V8_visited', title: 'V8_visited (T/F)' },
        { id: 'V9_visited', title: 'V9_visited (T/F)' },
        { id: 'AvgTimeOnVideoPage', title: 'AvgTimeOnVideoPage (in secs)' },
        { id: 'PageLog', title: 'PageLog' },
        { id: 'VideoUpvoteNumber', title: 'VideoUpvoteNumber' },
        { id: 'VideoDownvoteNumber', title: 'VideoDownvoteNumber' },
        { id: 'VideoFlagNumber', title: 'VideoFlagNumber' },
        { id: 'CommentUpvoteNumber', title: 'CommentUpvoteNumber (excluding stimuli msg)' },
        { id: 'V7_CommentUpvoteNumber', title: 'V7_CommentUpvoteNumber' },
        { id: 'V8_CommentUpvoteNumber', title: 'V8_CommentUpvoteNumber' },
        { id: 'V9_CommentUpvoteNumber', title: 'V9_CommentUpvoteNumber' },
        { id: 'CommentDownvoteNumber', title: 'CommentDownvoteNumber (excluding stimuli msg)' },
        { id: 'V7_CommentDownvoteNumber', title: 'V7_CommentDownvoteNumber' },
        { id: 'V8_CommentDownvoteNumber', title: 'V8_CommentDownvoteNumber' },
        { id: 'V9_CommentDownvoteNumber', title: 'V9_CommentDownvoteNumber' },
        { id: 'CommentFlagNumber', title: 'CommentFlagNumber (excluding stimuli msg)' },
        { id: 'V7_CommentFlagNumber', title: 'V7_CommentFlagNumber' },
        { id: 'V8_CommentFlagNumber', title: 'V8_CommentFlagNumber' },
        { id: 'V9_CommentFlagNumber', title: 'V9_CommentFlagNumber' },
        { id: 'GeneralPostComments', title: 'GeneralPostComments (excluding replies to the stimuli msg)' },
        { id: 'V7_PostComments', title: 'V7_PostComments' },
        { id: 'V8_PostComments', title: 'V8_PostComments' },
        { id: 'V9_PostComments', title: 'V9_PostComments' },
        { id: 'Off7_Appear', title: 'Off7_Appear (T/F)' },
        { id: 'Off7_Upvote', title: 'Off7_Upvote(T/F)' },
        { id: 'Off7_Downvote', title: 'Off7_Downvote (T/F)' },
        { id: 'Off7_Flag', title: 'Off7_Flag (T/F)' },
        { id: 'Off7_Reply', title: 'Off7_Reply' },
        { id: 'Off7_ReplyBody', title: 'Off7_ReplyBody' },
        { id: 'V9_CommentBody', title: 'V9_CommentBody' },
        { id: 'Harassment_Appear', title: 'Harassment_Appear (T/F)' },
        { id: 'Harassment_Upvote', title: 'Harassment_Upvote (T/F)' },
        { id: 'Harassment_Downvote', title: 'Harassment_Downvote (T/F)' },
        { id: 'Harassment_Flag', title: 'Harassment_Flag (T/F)' },
        { id: 'Harassment_Reply', title: 'Harassment_Reply' },
        { id: 'Harassment_ReplyBody', title: 'Harassment_ReplyBody' },
        { id: 'Objection_Appear', title: 'Objection_Appear (T/F)' },
        { id: 'Objection_Upvote', title: 'Objection_Upvote (T/F)' },
        { id: 'Objection_Downvote', title: 'Objection_Downvote (T/F)' },
        { id: 'Objection_Flag', title: 'Objection_Flag (T/F)' },
        { id: 'Objection_Reply', title: 'Objection_Reply' },
        { id: 'Objection_ReplyBody', title: 'Objection_ReplyBody' },
        { id: 'HarassmentMessage', title: 'HarassmentMessage_Shown' },
        { id: 'CounterspeechMessage', title: 'CounterspeechMessage_Shown' },
    ];
    const csvWriter = createCsvWriter({
        path: outputFilepath,
        header: csvWriter_header
    });
    const records = [];
    // For each user
    for (const user of users) {
        // Set default values for record
        const record = {
            NumVideosVisited_Tutorial: 0,
            NumVideosVisited_Behavioral: 0,
            V1_visited: false,
            V2_visited: false,
            V3_visited: false,
            V4_visited: false,
            V5_visited: false,
            V6_visited: false,
            V7_visited: false,
            V8_visited: false,
            V9_visited: false,
            AvgTimeOnVideoPage: 0,
            VideoUpvoteNumber: 0,
            VideoDownvoteNumber: 0,
            VideoFlagNumber: 0,
            CommentUpvoteNumber: 0,
            V7_CommentUpvoteNumber: 0,
            V8_CommentUpvoteNumber: 0,
            V9_CommentUpvoteNumber: 0,
            CommentDownvoteNumber: 0,
            V7_CommentDownvoteNumber: 0,
            V8_CommentDownvoteNumber: 0,
            V9_CommentDownvoteNumber: 0,
            CommentFlagNumber: 0,
            V7_CommentFlagNumber: 0,
            V8_CommentFlagNumber: 0,
            V9_CommentFlagNumber: 0,
            GeneralPostComments: 0,
            V7_PostComments: 0,
            V8_PostComments: 0,
            V9_PostComments: 0
        };

        // Record for the user
        record.id = user.mturkID;
        record.username = user.username;
        record.Topic = user.interest;
        record.Condition = user.group;

        const parsedIdentity = helpers.parseIdentityCondition(user.group);
        if (parsedIdentity) {
            const { harassmentPlaceholders, counterspeechPlaceholders } = await getIdentityPlaceholders(user.interest);
            record.HarassmentMessage = harassmentPlaceholders.map(p =>
                helpers.seededPick(helpers.HARASSMENT_COMMENTS[parsedIdentity.victimGender], user.mturkID + ':' + p.postID + ':' + p.commentID + ':harassment')
            ).join(' | ');
            record.CounterspeechMessage = counterspeechPlaceholders.map(p =>
                helpers.seededPick(helpers.COUNTERSPEECH_COMMENTS, user.mturkID + ':' + p.postID + ':' + p.commentID + ':objection')
            ).join(' | ');
        }

        const offenseId = await getOffenseId(user.interest);
        const { postID: harassPostID, harassmentId, objectionId } = await getFirstVideoStimulusIds(user.interest);
        const harassVideo = harassPostID != null ? (harassPostID % 9) + 1 : null;

        // Extract pages visited on the website
        let NumVideosVisited_Tutorial = 0;
        let NumVideosVisited_Behavioral = 0;
        let Off7_Appear = false;
        let Harassment_Appear = false;
        let Objection_Appear = false;

        for (const pageLog of user.pageLog) {
            // Begin at v = 0, 1, 2, 3, 4, 5, 6, 7, 8
            if (pageLog.page.startsWith("/?v=") || pageLog.page.startsWith("/tutorial?v=")) {
                let page = parseInt((pageLog.page.replace(/\D/g, '') % 9) + 1);
                if (record[`V${page}_visited`] == false) {
                    record[`V${page}_visited`] = true;
                    if (pageLog.page.startsWith("/tutorial?v=")) {
                        NumVideosVisited_Tutorial++;
                    } else {
                        NumVideosVisited_Behavioral++;
                    }
                    if (page == 9) {
                        Off7_Appear = true;
                        record.Off7_Upvote = false;
                        record.Off7_Downvote = false;
                        record.Off7_Flag = false;
                        record.Off7_Reply = false;
                    }
                    if (harassVideo != null && page == harassVideo) {
                        Harassment_Appear = true;
                        Objection_Appear = true;
                        record.Harassment_Upvote = false;
                        record.Harassment_Downvote = false;
                        record.Harassment_Flag = false;
                        record.Harassment_Reply = false;
                        record.Objection_Upvote = false;
                        record.Objection_Downvote = false;
                        record.Objection_Flag = false;
                        record.Objection_Reply = false;
                    }
                }
            }
        }

        record.NumVideosVisited_Tutorial = NumVideosVisited_Tutorial;
        record.NumVideosVisited_Behavioral = NumVideosVisited_Behavioral;
        record.Off7_Appear = Off7_Appear;
        record.Harassment_Appear = Harassment_Appear;
        record.Objection_Appear = Objection_Appear;

        if (!user.consent) {
            records.push(record);
            continue;
        }

        let sumOnVideos = 0;
        let numVideos = 0;
        for (let pageTime of user.pageTimes) {
            if (pageTime.time > 1500 && (pageTime.page.startsWith("/?v=") || pageTime.page.startsWith("/tutorial?v="))) {
                numVideos++;
                sumOnVideos += pageTime.time;
            }
        }

        record.AvgTimeOnVideoPage = (sumOnVideos / numVideos) / 1000;

        let VideoUpvoteNumber = 0;
        let VideoDownvoteNumber = 0;
        let VideoFlagNumber = 0;

        let CommentUpvoteNumber = 0;
        let CommentDownvoteNumber = 0;
        let CommentFlagNumber = 0;
        let GeneralPostComments = 0;

        // Stimuli comments (offense/harassment/objection) are tracked in their own
        // dedicated columns below, so they're excluded from the general counts here.
        const stimulusIds = [offenseId, harassmentId, objectionId].filter(Boolean).map(String);

        // For each video (feedAction) belonging to the user's interest:
        for (const feedAction of user.feedAction) {
            if (!feedAction.post || !feedAction.post.class.startsWith(user.interest)) {
                continue;
            }
            const video = (feedAction.post.postID % 9) + 1; // 1, 2, 3, 4, 5, 6, 7, 8, 9

            if (feedAction.liked) {
                VideoUpvoteNumber++;
            }
            if (feedAction.unliked) {
                VideoDownvoteNumber++;
            }
            if (feedAction.flagged) {
                VideoFlagNumber++;
            }
            const generalComments = feedAction.comments.filter(comment =>
                !comment.new_comment &&
                stimulusIds.indexOf(String(comment.comment)) === -1);

            const numLikes = generalComments.filter(comment => comment.liked).length;
            const numDislikes = generalComments.filter(comment => comment.unliked).length;
            const numFlagged = generalComments.filter(comment => comment.flagged).length;
            const newComments = feedAction.comments.filter(comment =>
                comment.new_comment &&
                stimulusIds.indexOf(String(comment.reply_to || '')) === -1);
            const numNewComments = newComments.length;

            CommentUpvoteNumber += numLikes;
            CommentDownvoteNumber += numDislikes;
            CommentFlagNumber += numFlagged;
            GeneralPostComments += numNewComments;

            record[`V${video}_CommentUpvoteNumber`] = numLikes;
            record[`V${video}_CommentDownvoteNumber`] = numDislikes;
            record[`V${video}_CommentFlagNumber`] = numFlagged;
            record[`V${video}_PostComments`] = numNewComments;

            if (video == 9 && offenseId) {
                // Offense
                const offObj = feedAction.comments.find(comment => !comment.new_comment && comment.comment.toString() == offenseId);
                record.Off7_Upvote = (offObj != undefined) ? offObj.liked : false;
                record.Off7_Downvote = (offObj != undefined) ? offObj.unliked : false;
                record.Off7_Flag = (offObj != undefined) ? offObj.flagged : false;

                const replyToOffense = feedAction.comments.filter(comment => String(comment.reply_to || '') == String(offenseId));
                if (replyToOffense.length != 0) {
                    let string = "";
                    replyToOffense.forEach(comment => { string += comment.new_comment_id + (comment.reply_to ? " (is a reply to " + comment.reply_to + ")" : "") + ": " + comment.body + "\r\n" });
                    record.Off7_ReplyBody = string;
                    record.Off7_Reply = true;
                } else {
                    record.Off7_Reply = false;
                }

                // Other comments
                let string = "";
                newComments.forEach(comment => { string += comment.new_comment_id + (comment.reply_to ? " (is a reply to " + comment.reply_to + ")" : "") + ": " + comment.body + "\r\n" });
                record.V9_CommentBody = string;
            }

            if (harassVideo != null && video == harassVideo) {
                if (harassmentId) {
                    const harassObj = feedAction.comments.find(comment => !comment.new_comment && comment.comment.toString() == harassmentId);
                    record.Harassment_Upvote = (harassObj != undefined) ? harassObj.liked : false;
                    record.Harassment_Downvote = (harassObj != undefined) ? harassObj.unliked : false;
                    record.Harassment_Flag = (harassObj != undefined) ? harassObj.flagged : false;

                    const replyToHarassment = feedAction.comments.filter(comment => String(comment.reply_to || '') == String(harassmentId));
                    if (replyToHarassment.length != 0) {
                        let string = "";
                        replyToHarassment.forEach(comment => { string += comment.new_comment_id + (comment.reply_to ? " (is a reply to " + comment.reply_to + ")" : "") + ": " + comment.body + "\r\n" });
                        record.Harassment_ReplyBody = string;
                        record.Harassment_Reply = true;
                    } else {
                        record.Harassment_Reply = false;
                    }
                }

                if (objectionId) {
                    const objectionObj = feedAction.comments.find(comment => !comment.new_comment && comment.comment.toString() == objectionId);
                    record.Objection_Upvote = (objectionObj != undefined) ? objectionObj.liked : false;
                    record.Objection_Downvote = (objectionObj != undefined) ? objectionObj.unliked : false;
                    record.Objection_Flag = (objectionObj != undefined) ? objectionObj.flagged : false;

                    const replyToObjection = feedAction.comments.filter(comment => String(comment.reply_to || '') == String(objectionId));
                    if (replyToObjection.length != 0) {
                        let string = "";
                        replyToObjection.forEach(comment => { string += comment.new_comment_id + (comment.reply_to ? " (is a reply to " + comment.reply_to + ")" : "") + ": " + comment.body + "\r\n" });
                        record.Objection_ReplyBody = string;
                        record.Objection_Reply = true;
                    } else {
                        record.Objection_Reply = false;
                    }
                }
            }
        }

        let string = "";
        const newPageLog = user.pageLog.filter(page => page.page != "/tutorial");
        newPageLog.forEach(page => { string += page.page + "\r\n" });
        record.PageLog = string;

        record.VideoUpvoteNumber = VideoUpvoteNumber;
        record.VideoDownvoteNumber = VideoDownvoteNumber;
        record.VideoFlagNumber = VideoFlagNumber;
        record.CommentUpvoteNumber = CommentUpvoteNumber;
        record.CommentDownvoteNumber = CommentDownvoteNumber;
        record.CommentFlagNumber = CommentFlagNumber;
        record.GeneralPostComments = GeneralPostComments;

        // console.log(record);
        records.push(record);
    }

    await csvWriter.writeRecords(records);
    console.log(color_success, `...Data export completed.\nFile exported to: ${outputFilepath} with ${records.length} records.`);
    console.log(color_success, `...Finished reading from the db.`);
    db.close();
    console.log(color_start, 'Closed db connection.');
}

getDataExport();