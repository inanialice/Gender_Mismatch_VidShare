const User = require('../models/User');
const helpers = require('./helpers');
const { validateSignupUsername } = helpers;

// From https://stackoverflow.com/questions/2450954/how-to-randomize-shuffle-a-javascript-array
function shuffle(array) {
    let currentIndex = array.length,
        randomIndex;
    // While there remain elements to shuffle.
    while (currentIndex != 0) {
        // Pick a remaining element.
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        // And swap it with the current element.
        [array[currentIndex], array[randomIndex]] = [
            array[randomIndex], array[currentIndex]
        ];
    }
    return array;
}

// create random id for guest accounts
function makeid(length) {
    var result = '';
    var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for (var i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

// create random comment time (between -86400 and -60 seconds, i.e. one day and 1 minute)
function getRandomCommentTime() {
    // Math.floor(Math.random() * (max - min + 1)) + min
    return Math.floor((Math.random() * (86400 - 60 + 1) + 60)) * -1000;
}

// create random subcomment time (between -commentTime and -60 seconds, i.e. after the parent comment time and 1 minute)
function getRandomSubCommentTime(commentTime) {
    const maxCommentTime = (commentTime / -1000) - 60; // Indicates the subcomment must come at least 1 minute after original comment
    return Math.floor((Math.random() * (maxCommentTime - 60 + 1) + 60)) * -1000;
}

function normalizeProfileInitials(raw) {
    if (raw == null || typeof raw !== 'string') {
        return '';
    }
    const normalized = raw.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(normalized)) {
        return '';
    }
    return normalized;
}

/**
 * GET /logout
 * Handles user log out.
 */
exports.logout = async(req, res) => {
    try {
        // Allow /logout to be called safely even when no user session exists.
        if (!req.user || !req.user.id) {
            if (req.session) {
                req.session.destroy(() => res.redirect('/signup'));
                return;
            }
            return res.redirect('/signup');
        }

        const user = await User.findById(req.user.id).exec();
        const r_id = user && user.mturkID ? user.mturkID : '';
        if (user) {
            user.logPage(Date.now(), '/thankyou');
        }
        req.logout((err) => {
            if (err) console.log('Error : Failed to logout.', err);
            req.session.destroy((err) => {
                if (err) console.log('Error : Failed to destroy the session during logout.', err);
                req.user = null;
                if (r_id) {
                    return res.redirect(`/thankyou?r_id=${r_id}`);
                }
                return res.redirect('/signup');
            });
        });
    } catch (err) {
        console.log('Error : Failed to process logout.', err);
        return res.redirect('/signup');
    }
};

/**
 * GET /embed/firstVideo
 * Read-only render of the first video + its comments for a participant,
 * looked up by mturkID (r_id). Meant to be embedded via iframe in the
 * post-study Qualtrics survey, since the feed itself is no longer
 * reachable once the participant has logged out.
 * */
exports.getFirstVideoEmbed = async(req, res, next) => {
    try {
        const r_id = req.query.r_id;
        let firstPost = null;
        let participant = null;

        if (r_id) {
            participant = await User.findOne({ mturkID: r_id }).exec();
            if (participant) {
                const finalfeed = await helpers.getFeed(participant);
                firstPost = finalfeed.length ? finalfeed[0] : null;
            }
        }

        res.render('firstVideoEmbed', { firstPost, participant });
    } catch (err) {
        next(err);
    }
};

/**
 * GET /signup
 * Signup page.
 */
exports.getSignup = (req, res) => {
    if (req.user) {
        return res.redirect('/');
    }
    res.render('account/signup', {
        title: 'Create Account'
    });
};

/**
 * POST /signup
 * Create a new local account.
 */
exports.postSignup = async(req, res, next) => {
    // (1) If given r_id from Qualtrics: If user instance exists, go to profile page. If doens't exist, create a user instance. 
    // (2) If not given r_id from Qualtrics: Generate a random username, not used yet, and save user instance.
    if (req.query.r_id == 'null' || !req.query.r_id || req.query.r_id == 'undefined') {
        req.query.r_id = makeid(10);
    }

    let experimentalCondition = helpers.normalizeExperimentalCondition(req.query.c_id);
    // ---- Conditions: identity manipulation, victimGender:counterspeakerGender ------//
    // victim: male, female
    // counterspeaker: male, female, unknown

    // Identity conditions keep CSV-authored harassment/objection comments as-is.
    const harassmentOrder = [];
    const harassmentToObjectToOrder = [];
    const objectionOrder = [];

    const numComments = [3, 3, 5, 3, 5, 3];
    let commentTimes = [];
    let subcommentTimes = [];

    for (const video in numComments) {
        let video_commentTimes = [];
        for (let i = 1; i <= numComments[video]; i++) {
            video_commentTimes.push(getRandomCommentTime());
        }
        commentTimes.push(video_commentTimes);
    }

    const videoIndexCommentIndex_HarassmentComments = [
        [1, 0],
        [4, 0],
        [4, 3],
        [2, 3],
        [2, 4],
        [3, 2]
    ];

    for (const harassmentComment of videoIndexCommentIndex_HarassmentComments) {
        const video = harassmentComment[0];
        const comment = harassmentComment[1];
        const subcommentTime = getRandomSubCommentTime(commentTimes[video][comment]);
        subcommentTimes.push(subcommentTime);
    }

    const firstVideo_subcommentTime = getRandomSubCommentTime(commentTimes[0][0]);
    subcommentTimes.push(firstVideo_subcommentTime);

    try {
        const usernameCheck = await validateSignupUsername(req.body.username, req.query.r_id);
        if (!usernameCheck.ok) {
            res.set('Content-Type', 'application/json; charset=UTF-8');
            return res.status(400).json({ result: 'error', message: usernameCheck.message });
        }
        const username = usernameCheck.normalized;
        const profileInitials = normalizeProfileInitials(req.body.initials);
        if (!profileInitials) {
            res.set('Content-Type', 'application/json; charset=UTF-8');
            return res.status(400).json({ result: 'error', message: 'Please choose two profile initials.' });
        }
        const profilePictureValue = `Initials (${profileInitials})`;

        const existingUser = await User.findOne({ mturkID: req.query.r_id }).exec();
        let user;
        if (existingUser) {
            // Same r_id reuses this document; clear prior feed interactions so a fresh signup
            // does not show comments and actions from an earlier session.
            existingUser.feedAction = [];
            existingUser.numComments = -1;
            existingUser.username = username;
            existingUser.profile.picture = profilePictureValue;
            existingUser.profile.name = username;
            // Keep condition-dependent fields in sync when reusing an existing r_id.
            existingUser.group = experimentalCondition;
            existingUser.harassmentOrder = harassmentOrder;
            existingUser.harassmentToObjectToOrder = harassmentToObjectToOrder;
            existingUser.objectionOrder = objectionOrder;
            existingUser.commentTimes = commentTimes;
            existingUser.subcommentTimes = subcommentTimes;
            user = existingUser;
        } else {
            user = new User({
                mturkID: req.query.r_id,
                username: username,
                profile: {
                    name: username,
                    color: '#a6a488',
                    picture: profilePictureValue
                },
                group: experimentalCondition,
                harassmentOrder: harassmentOrder,
                harassmentToObjectToOrder: harassmentToObjectToOrder,
                objectionOrder: objectionOrder,
                commentTimes: commentTimes,
                subcommentTimes: subcommentTimes,
                active: true,
                lastNotifyVisit: (Date.now()),
                createdAt: (Date.now())
            });
        }

        await user.save();
        req.logIn(user, (err) => {
            if (err) {
                return next(err);
            }
            const currDate = Date.now();
            const userAgent = req.headers['user-agent'];
            const user_ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
            user.logUser(currDate, userAgent, user_ip);
            res.set('Content-Type', 'application/json; charset=UTF-8');
            res.send({ result: "success" });
        });
    } catch (err) {
        next(err);
    }
};

/**
 * POST /account/interest
 * Update interest information.
 */
exports.postInterestInfo = async(req, res, next) => {
    try {
        const user = await User.findById(req.user.id).exec();
        user.interest = req.body.interest;
        user.consent = true;
        await user.save();
        res.set('Content-Type', 'application/json; charset=UTF-8');
        res.send({ result: "success" });
    } catch (err) {
        next(err);
    }
};

/**
 * POST /pageLog
 * Record user's page visit to pageLog.
 */
exports.postPageLog = async(req, res, next) => {
    try {
        const user = await User.findById(req.user.id).exec();
        user.logPage(Date.now(), req.body.path);
        res.set('Content-Type', 'application/json; charset=UTF-8');
        res.send({ result: "success" });
    } catch (err) {
        next(err);
    }
};

/**
 * POST /pageTimes
 * Record user's time on site to pageTimes.
 */
exports.postPageTime = async(req, res, next) => {
    try {
        const user = await User.findById(req.user.id).exec();
        // What day in the study is the user in? 
        const log = {
            time: req.body.time,
            page: req.body.pathname,
        };
        user.pageTimes.push(log);
        await user.save();
        res.set('Content-Type', 'application/json; charset=UTF-8');
        res.send({ result: "success" });
    } catch (err) {
        next(err);
    }
};

/**
 * GET /forgot
 * Forgot Password page.
 */
exports.getForgot = (req, res) => {
    if (req.isAuthenticated()) {
        return res.redirect('/');
    }
    res.render('account/forgot', {
        title: 'Forgot Password'
    });
};


/**
 * GET /userInfo
 * Get user profile and number of user comments
 */
exports.getUserProfile = async(req, res) => {
    try {
        const user = await User.findById(req.user.id).exec();
        res.set('Content-Type', 'application/json; charset=UTF-8');
        res.send({
            userProfile: user.profile,
            numComments: user.numComments
        });
    } catch (err) {
        next(err);
    }
}