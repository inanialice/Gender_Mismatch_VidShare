const _ = require('lodash');
const Script = require('../models/Script.js');
const Actor = require('../models/Actor');
const User = require('../models/User');
const replyTimeOffsetMs = require('../lib/replyTimeOffsetMs');

const LEGACY_CONDITIONS = ['None', 'None-True', 'Few:None', 'Few:Few', 'Few:Many', 'Many:None', 'Many:Few', 'Many:Many'];
const DEFAULT_IDENTITY_CONDITION = 'female:unknown';

const IDENTITY_MAPPINGS = {
    victim: {
        male: { username: 'Dave.dusty256', picture: 'victim_male.svg' },
        female: { username: 'Sarah.lunar256', picture: 'victim_female.svg' }
    },
    counterspeaker: {
        male: { username: 'Mike7_Frosty', picture: 'counterspeaker_male.svg' },
        female: { username: 'Ashley7_Neon', picture: 'counterspeaker_female.svg' },
        // No dedicated unknown file exists in people_profiles, so use a neutral default asset.
        unknown: { username: 'Koala7_Wild', picture: '01_woman_light_gray.svg' }
    }
};

const HARASSMENT_COMMENTS = {
    male: [
        "I can't take male creators seriously anymore. Stuff like this is just embarrassing.",
        "Typical male creators at it again. They always manage to make things worse.",
        "Male creators really thought this was a good idea. It looks completely ridiculous.",
        "I knew this had to be from male creators. They are so predictable sometimes.",
        "Male creators keep doing things like this online. It never stops being cringe.",
        "Another example of male creators embarrassing themselves. Nobody is surprised anymore.",
        "Male creators always find new ways to disappoint people. This is no exception.",
        "I don't know why male creators act like this publicly. It is painful to watch.",
        "Male creators always think they are saying something important. This says nothing.",
        "Every time I trust male creators, I regret it. Posts like this remind me why.",
        "Male creators really love making a mess of things. This is chaos.",
        "People wonder why male creators get criticized so much. Moments like this explain it.",
        "Male creators make it hard to defend them sometimes. This is one of those times.",
        "Another day, another male creators disaster. It is almost expected now.",
        "Male creators keep lowering the bar somehow. This is impressive in the worst way.",
        "I tried giving male creators a chance. Then I saw this nonsense.",
        "Male creators always seem so unserious. This proves it again.",
        "Nobody embarrasses themselves like male creators. They do it effortlessly.",
        "Male creators should know better than this. It looks foolish.",
        "This is why I avoid male creators. Things like this are exhausting."
    ],
    female: [
        "I can't take female creators seriously anymore. Stuff like this is just embarrassing.",
        "Typical female creators at it again. They always manage to make things worse.",
        "Female creators really thought this was a good idea. It looks completely ridiculous.",
        "I knew this had to be from female creators. They are so predictable sometimes.",
        "Female creators keep doing things like this online. It never stops being cringe.",
        "Another example of female creators embarrassing themselves. Nobody is surprised anymore.",
        "Female creators always find new ways to disappoint people. This is no exception.",
        "I don't know why female creators act like this publicly. It is painful to watch.",
        "Female creators always think they are saying something important. This says nothing.",
        "Every time I trust female creators, I regret it. Posts like this remind me why.",
        "Female creators really love making a mess of things. This is chaos.",
        "People wonder why female creators get criticized so much. Moments like this explain it.",
        "Female creators make it hard to defend them sometimes. This is one of those times.",
        "Another day, another female creators disaster. It is almost expected now.",
        "Female creators keep lowering the bar somehow. This is impressive in the worst way.",
        "I tried giving female creators a chance. Then I saw this nonsense.",
        "Female creators always seem so unserious. This proves it again.",
        "Nobody embarrasses themselves like female creators. They do it effortlessly.",
        "Female creators should know better than this. It looks foolish.",
        "This is why I avoid female creators. Things like this are exhausting."
    ]
};

const COUNTERSPEECH_COMMENTS = [
    "I don't see what gender has to do with this. Everyone deserves to have their efforts treated with respect. You should apologize.",
    "Gender has nothing to do with the situation here. Showing basic respect for other people's work is the minimum we can do. You should apologize.",
    "I fail to see why gender was brought into this at all. People's efforts deserve respect regardless. You should apologize.",
    "This has nothing to do with gender in any way. Respecting what others put effort into should be standard. You should apologize.",
    "I don't understand why gender was mentioned here. Treating each other's work with respect is basic decency. You should apologize.",
    "Gender is completely irrelevant to this issue. Everyone's efforts should be met with respect. You should apologize.",
    "I'm not sure why gender was made part of this conversation. Respect for other people's effort should come first. You should apologize.",
    "Gender has no place in this comment. The least we can do is respect what others worked on. You should apologize.",
    "I don't see any reason to make this about gender. People deserve respect for the effort they put in. You should apologize.",
    "There was no need to bring gender into this. Treating others and their work respectfully is the bare minimum. You should apologize.",
    "I don't get how gender is relevant here. Respecting each other's contributions should be expected. You should apologize.",
    "Gender is beside the point in this case. Everyone's effort deserves common respect. You should apologize.",
    "I don't see why this was framed around gender. The minimum standard is respecting one another's efforts. You should apologize.",
    "This did not need to involve gender. Showing respect for what others create is basic courtesy. You should apologize.",
    "Gender has nothing to do with whether this was good or bad. Respecting the work people put in still matters. You should apologize.",
    "I can't see how gender is relevant to any of this. We should at least respect each other's effort. You should apologize.",
    "There is no reason gender should be part of this discussion. Treating people's work with respect is the least we can do. You should apologize.",
    "I don't see the connection between gender and this issue. Everyone deserves respect for their effort. You should apologize.",
    "Gender is not the issue here at all. Showing respect toward what others tried to do is the minimum standard. You should apologize.",
    "I fail to see how gender matters in this context. Respecting each other's efforts should come naturally. You should apologize."
];

function parseIdentityCondition(condition) {
    const text = String(condition || '').trim().toLowerCase();
    const parts = text.split(':');
    if (parts.length !== 2) {
        return null;
    }
    const victimGender = parts[0];
    const counterspeakerGender = parts[1];
    if (!IDENTITY_MAPPINGS.victim[victimGender] || !IDENTITY_MAPPINGS.counterspeaker[counterspeakerGender]) {
        return null;
    }
    return {
        victimGender: victimGender,
        counterspeakerGender: counterspeakerGender,
        normalized: victimGender + ':' + counterspeakerGender
    };
}

function isLegacyCondition(condition) {
    return LEGACY_CONDITIONS.indexOf(String(condition || '').trim()) >= 0;
}

function normalizeExperimentalCondition(condition) {
    const parsedIdentity = parseIdentityCondition(condition);
    if (parsedIdentity) {
        return parsedIdentity.normalized;
    }
    if (isLegacyCondition(condition)) {
        return String(condition).trim();
    }
    return DEFAULT_IDENTITY_CONDITION;
}

function hashSeed(seed) {
    let h = 0;
    const s = String(seed || '');
    for (let i = 0; i < s.length; i++) {
        h = ((h << 5) - h) + s.charCodeAt(i);
        h |= 0;
    }
    return Math.abs(h);
}

function seededPick(list, seed) {
    if (!Array.isArray(list) || list.length === 0) {
        return '';
    }
    return list[hashSeed(seed) % list.length];
}

function replaceActorIdentity(actorDoc, identity) {
    if (!actorDoc || !identity) {
        return;
    }
    actorDoc.username = identity.username;
    if (actorDoc.profile) {
        actorDoc.profile.picture = identity.picture;
    }
}

function isHarassmentPlaceholder(comment) {
    if (!comment) {
        return false;
    }
    const body = String(comment.body || '');
    return body.indexOf('Manipulated Harassment Message') === 0;
}

/**
 * This is a helper function. It takes in a User document. 
 * Function processes and returns a final feed of posts that accounts for the user's interactions with posts.
 * Parameters: 
 *  - user: a User document
 * Returns: 
 *  - finalfeed: the processed final feed of posts for the user
 */
exports.getFeed = async function(user) {
    // Get the newsfeed
    let script_feed = await Script.find()
        .where('class').equals(user.interest)
        .sort('postID')
        .populate('actor')
        .populate('comments.actor')
        .populate('comments.subcomments.actor')
        .exec();

    // Legacy override for old frequency-based conditions only.
    // For identity conditions (male/female/unknown), keep CSV-authored comments.
    if (isLegacyCondition(user.group) && user.group != "None-True") {
        var offensePost = script_feed[2];
        var offenseComment = offensePost && Array.isArray(offensePost.comments) ? offensePost.comments[0] : null;
        if (offenseComment) {
            offenseComment.body = "Another pointless video. Ever consider that no one cares?";
            offenseComment.likes = 1;
            offenseComment.unlikes = 1;
            offenseComment.class = 'offense7';
        }
    }

    const parsedIdentityCondition = parseIdentityCondition(user.group);
    if (parsedIdentityCondition) {
        const victimIdentity = IDENTITY_MAPPINGS.victim[parsedIdentityCondition.victimGender];
        const counterspeakerIdentity = IDENTITY_MAPPINGS.counterspeaker[parsedIdentityCondition.counterspeakerGender];

        for (const post of script_feed) {
            if (post && post.actor && post.actor.username === 'Manipulated User Name') {
                replaceActorIdentity(post.actor, victimIdentity);
            }

            if (!post || !Array.isArray(post.comments)) {
                continue;
            }

            for (const comment of post.comments) {
                if (isHarassmentPlaceholder(comment)) {
                    comment.body = seededPick(
                        HARASSMENT_COMMENTS[parsedIdentityCondition.victimGender],
                        user.mturkID + ':' + post.postID + ':' + comment.commentID + ':harassment'
                    );
                    comment.likes = 1;
                    comment.unlikes = 1;
                }

                if (!Array.isArray(comment.subcomments)) {
                    continue;
                }

                for (const subcomment of comment.subcomments) {
                    const subClass = String(subcomment.class || '');
                    const subBody = String(subcomment.body || '');
                    if (subcomment.actor && (subcomment.actor.username === 'Manipulated' || subClass.indexOf('objection') === 0)) {
                        replaceActorIdentity(subcomment.actor, counterspeakerIdentity);
                    }
                    if (subBody.indexOf('Manipulated Objection Message') === 0 || subClass.indexOf('objection') === 0) {
                        subcomment.body = seededPick(
                            COUNTERSPEECH_COMMENTS,
                            user.mturkID + ':' + post.postID + ':' + subcomment.commentID + ':objection'
                        );
                    }
                }
            }
        }
        console.log('[identity-manipulation] condition=' + parsedIdentityCondition.normalized +
            ' victim=' + victimIdentity.username + ' counterspeaker=' + counterspeakerIdentity.username);
    }

    // Final array of all posts to go in the feed
    let finalfeed = [];

    // While there are regular posts to add to the final feed
    while (script_feed.length) {
        let replyDictionary = {}; // where Key = parent comment reply falls under, value = the list of comment objects

        // Looking at the post in script_feed[0] now.
        // For this post, check if there is a user feedAction matching this post's ID and get its index.
        const feedIndex = _.findIndex(user.feedAction, function(o) { return o.post == script_feed[0].id; });

        if (feedIndex != -1) {
            // User performed an action with this post
            // Check to see if there are comment-type actions.
            if (Array.isArray(user.feedAction[feedIndex].comments) && user.feedAction[feedIndex].comments) {
                // There are comment-type actions on this post.
                // For each comment on this post, add likes, flags, etc.
                for (const commentObject of user.feedAction[feedIndex].comments) {
                    if (commentObject.new_comment) {
                        // This is a new, user-made comment. Add it to the comments list for this post.
                        const cat = {
                            commentID: commentObject.new_comment_id,
                            body: commentObject.body,
                            likes: commentObject.liked ? 1 : 0,
                            unlikes: commentObject.unliked ? 1 : 0,
                            time: commentObject.relativeTime,

                            new_comment: commentObject.new_comment,
                            liked: commentObject.liked,
                            unliked: commentObject.unliked
                        };

                        if (commentObject.reply_to != null) {
                            cat.reply_to = commentObject.reply_to;
                            cat.parent_comment = commentObject.parent_comment;
                            if (replyDictionary[commentObject.parent_comment]) {
                                replyDictionary[commentObject.parent_comment].push(cat)
                            } else {
                                replyDictionary[commentObject.parent_comment] = [cat];
                            }
                        } else {
                            script_feed[0].comments.push(cat);
                        }
                    } else {
                        // This is not a new, user-created comment.
                        // Get the comment index that corresponds to the correct comment
                        const commentIndex = _.findIndex(script_feed[0].comments, function(o) { return o.id == commentObject.comment; });
                        // If this comment's ID is found in script_feed, it is a parent comment; add likes, flags, etc.
                        if (commentIndex != -1) {
                            // Check if there is a like recorded for this comment.
                            if (commentObject.liked) {
                                // Update the comment in script_feed.
                                script_feed[0].comments[commentIndex].liked = true;
                                script_feed[0].comments[commentIndex].likes++;
                            }
                            if (commentObject.unliked) {
                                // Update the comment in script_feed.
                                script_feed[0].comments[commentIndex].unliked = true;
                                script_feed[0].comments[commentIndex].unlikes++;
                            }
                            // Check if there is a flag recorded for this comment.
                            if (commentObject.flagged) {
                                script_feed[0].comments[commentIndex].flagged = true;
                            }
                        } else {
                            // Check if user conducted any actions on subcomments
                            script_feed[0].comments.forEach(function(comment, index) {
                                const subcommentIndex = _.findIndex(comment.subcomments, function(o) { return o.id == commentObject.comment; });
                                if (subcommentIndex != -1) {
                                    // Check if there is a like recorded for this subcomment.
                                    if (commentObject.liked) {
                                        // Update the comment in script_feed.
                                        script_feed[0].comments[index].subcomments[subcommentIndex].liked = true;
                                        script_feed[0].comments[index].subcomments[subcommentIndex].likes++;
                                    }
                                    if (commentObject.unliked) {
                                        // Update the subcomment in script_feed.
                                        script_feed[0].comments[index].subcomments[subcommentIndex].unliked = true;
                                        script_feed[0].comments[index].subcomments[subcommentIndex].unlikes++;
                                    }
                                    // Check if there is a flag recorded for this subcomment.
                                    if (commentObject.flagged) {
                                        script_feed[0].comments[index].subcomments[subcommentIndex].flagged = true;
                                    }
                                }
                            })
                        }
                    }
                }
            }
            script_feed[0].comments.sort(function(a, b) {
                return b.time - a.time; // in descending order.
            });

            for (const [key, value] of Object.entries(replyDictionary)) {
                const commentIndex = _.findIndex(script_feed[0].comments, function(o) { return o.commentID == key; });
                script_feed[0].comments[commentIndex]["subcomments"] =
                    script_feed[0].comments[commentIndex]["subcomments"].concat(value)
                    .sort(function(a, b) {
                        return a.time - b.time; // in descending order.
                    });
            }

            // Check if there is a like recorded for this post.
            if (user.feedAction[feedIndex].liked) {
                script_feed[0].like = true;
                script_feed[0].likes++;
            }
            // Check if there is a unlike recorded for this post. 
            if (user.feedAction[feedIndex].unliked) {
                script_feed[0].unlike = true;
                script_feed[0].unlikes++;
            }
            // Check if there is a flag recorded for this post.
            if (user.feedAction[feedIndex].flagged) {
                script_feed[0].flag = true;
            }

            finalfeed.push(script_feed[0]);
            script_feed.splice(0, 1);
        } // user did not interact with this post
        else {
            script_feed[0].comments.sort(function(a, b) {
                return b.time - a.time;
            });
            finalfeed.push(script_feed[0]);
            script_feed.splice(0, 1);
        }
    }
    finalfeed.sort(function(a, b) {
        return a.postID - b.postID;
    });

    return finalfeed;
}

/**
 * This is a helper function. It takes in a User document.
 * Function returns final feed of tutorial posts.
 * Parameters: 
 *  - user: a User document
 * Returns: 
 *  - script_feed: the final feed of tutorial posts.
 */
exports.getTutorial = async function(user) {
    // Get the newsfeed
    let script_feed = await Script.find()
        .where('class').equals(user.interest + "-Tutorial")
        .sort('postID')
        .populate('actor')
        .populate('comments.actor')
        .populate('comments.subcomments.actor')
        .exec();
    // Counter to track which objection actor to use
    let counter = 0;
    // Get objection actors
    const objectionActors = await Actor.find().where('class').equals("objection").exec();
    // Objection comment ID index
    let commentID = 96;

    // Harassment Comments
    const harassmentComments = {
        0: "LOL, did you even preview this before sharing? No one is interested in this crap. Save your time and ours.",
        1: "Looks like the person who made this video must be dumb. Whoever posted this should be embarrassed.",
        2: "This sucks! 🤮",
        3: "Seriously, how can you be so clueless about what's worth sharing? Your stuff is a total waste of space!",
        4: "Honestly, every time I think I've seen the worst content online, someone like you comes along and sets a new low.",
        5: "This gives me ick!! 🤢"
    };

    // Objection Comments
    const objectionComments = {
        0: "This is wrong. Let's support each other's creative efforts rather than tear each other down!",
        1: "We should treat each other's efforts respectfully and kindly. So try to appreciate the work, dude.",
        2: "Hey, stop! A supportive vibe is key. It's important to encourage and inspire one another.",
        3: "Please remember to stay respectful to each other here. Insulting others isn't cool."
    };

    // For each interest, a list of harassment comments' locations is provided. 
    // Each element in the list gives a harassment location information: [Video Index, Comment Index, Objection time]. 
    // These locations are to be replaced with harassments & accompanying objections.
    const videoIndexCommentIndex_HarassmentComments = [
        [1, 0],
        [4, 0],
        [4, 3],
        [2, 3],
        [2, 4],
        [3, 2]
    ];

    const getTargetComment = (videoIndex, commentIndex) => {
        if (!script_feed[videoIndex] || !Array.isArray(script_feed[videoIndex].comments)) {
            return null;
        }
        return script_feed[videoIndex].comments[commentIndex] || null;
    };

    for (const harassmentNum in user.harassmentOrder) {
        const locationToReplace = videoIndexCommentIndex_HarassmentComments[harassmentNum];
        if (!locationToReplace) {
            continue;
        }
        const targetComment = getTargetComment(locationToReplace[0], locationToReplace[1]);
        if (!targetComment) {
            continue;
        }
        targetComment.body = harassmentComments[user.harassmentOrder[harassmentNum]];
        targetComment.class = `offense${parseInt(harassmentNum)+1}`;
        targetComment.likes = 1;
        targetComment.unlikes = 1;
    }

    for (const index in user.harassmentToObjectToOrder) {
        const harassmentNum = user.harassmentToObjectToOrder[index];
        const locationToReplace = videoIndexCommentIndex_HarassmentComments[harassmentNum];
        if (!locationToReplace) {
            continue;
        }
        const targetComment = getTargetComment(locationToReplace[0], locationToReplace[1]);
        if (!targetComment || !Array.isArray(targetComment.subcomments)) {
            continue;
        }

        const subcomment = {
            commentID: commentID,
            body: objectionComments[user.objectionOrder[index]],
            likes: 0,
            unlikes: 0,
            actor: objectionActors[counter],
            time: user.subcommentTimes[counter],
            class: `objection${counter+1}`,

            new_comment: false,
            liked: false,
            unliked: false
        };

        targetComment.subcomments.push(subcomment);
        commentID++;
        counter++;
    }

    // Add comment times to comments:
    for (const video_index in script_feed) {
        if (!Array.isArray(script_feed[video_index].comments)) {
            continue;
        }
        for (const comment_index in script_feed[video_index].comments) {
            const commentTime =
                Array.isArray(user.commentTimes) &&
                Array.isArray(user.commentTimes[video_index]) ?
                user.commentTimes[video_index][comment_index] :
                undefined;
            if (commentTime !== undefined) {
                script_feed[video_index].comments[comment_index].time = commentTime;
            }
        }
    }

    // Add subcomment time to first video, first comment:
    if (
        script_feed[0] &&
        Array.isArray(script_feed[0].comments) &&
        script_feed[0].comments[0] &&
        Array.isArray(script_feed[0].comments[0].subcomments) &&
        script_feed[0].comments[0].subcomments[0] &&
        Array.isArray(user.subcommentTimes) &&
        user.subcommentTimes[6] !== undefined
    ) {
        script_feed[0].comments[0].subcomments[0].time = user.subcommentTimes[6];
    }

    script_feed = script_feed.map(function(post) {
        if (!Array.isArray(post.comments)) {
            return post;
        }
        post.comments.sort(function(a, b) {
            return b.time - a.time;
        })
        return post;
    });

    return script_feed;
};

/**
 * Actor CSV "picture" is either an SVG under people_profiles/ (e.g. 39_man_medium_navy-short.svg)
 * or a label like "Initials (SA)". The latter should render as text, not an image URL.
 */
function actorPictureIsInitials(picture) {
    if (!picture || typeof picture !== 'string') {
        return false;
    }
    return /^\s*Initials\s*\(/i.test(picture.trim());
}

function actorInitialsFromPicture(picture) {
    if (!picture || typeof picture !== 'string') {
        return '';
    }
    var m = picture.match(/Initials\s*\(([^)]+)\)/i);
    return m ? m[1].trim() : '';
}

exports.actorPictureIsInitials = actorPictureIsInitials;
exports.actorInitialsFromPicture = actorInitialsFromPicture;

/** SVG used when actor.profile.picture is empty (e.g. channel accounts with no avatar asset). */
exports.defaultPeopleProfileFilename = '01_woman_light_gray.svg';

/**
 * URL for a people_profiles image, or default when picture is blank.
 * Not used for Initials(...) rows (those render as text).
 */
function actorPeopleProfileImgSrc(picture) {
    var def = '/people_profiles/' + exports.defaultPeopleProfileFilename;
    if (picture == null || typeof picture !== 'string') {
        return def;
    }
    var t = picture.trim();
    if (!t || actorPictureIsInitials(t)) {
        return def;
    }
    return '/people_profiles/' + t;
}

exports.actorPeopleProfileImgSrc = actorPeopleProfileImgSrc;

/**
 * Unix ms for when a comment was "posted" in the simulation.
 * Scripted comments (CSV `time`): offset from the present moment (e.g. -0:29:00 → ~29 minutes ago).
 * Participant-authored comments: absolute time via signup + stored relative offset.
 */
function commentWallClockMs(user, comment) {
    var offset = replyTimeOffsetMs(comment && comment.time);
    if (comment && comment.new_comment) {
        if (!user || !user.createdAt) {
            return Date.now();
        }
        return user.createdAt.getTime() + offset;
    }
    return Date.now() + offset;
}

exports.commentWallClockMs = commentWallClockMs;
exports.parseIdentityCondition = parseIdentityCondition;
exports.normalizeExperimentalCondition = normalizeExperimentalCondition;
exports.isLegacyCondition = isLegacyCondition;
exports.defaultIdentityCondition = DEFAULT_IDENTITY_CONDITION;

const SIGNUP_USERNAME_REGEX = /^[a-z0-9_]{3,24}$/;

function escapeRegexForUsername(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Validates and normalizes a username for signup (lowercase storage, case-insensitive clash checks).
 * @returns {{ ok: true, normalized: string } | { ok: false, message: string }}
 */
exports.validateSignupUsername = async function(raw, mturkId) {
    if (raw == null || typeof raw !== 'string') {
        return { ok: false, message: 'Username is required.' };
    }
    const normalized = raw.trim().toLowerCase();
    if (!normalized) {
        return { ok: false, message: 'Username is required.' };
    }
    if (!SIGNUP_USERNAME_REGEX.test(normalized)) {
        return {
            ok: false,
            message: 'Username must be 3–24 characters and use only letters, numbers, and underscores.'
        };
    }
    const actorMatch = new RegExp(`^${escapeRegexForUsername(normalized)}$`, 'i');
    const actor = await Actor.findOne({ username: actorMatch }).exec();
    if (actor) {
        return { ok: false, message: 'That username is not available.' };
    }
    const other = await User.findOne({ username: actorMatch }).exec();
    if (other && other.mturkID !== mturkId) {
        return { ok: false, message: 'That username is already taken.' };
    }
    return { ok: true, normalized };
};