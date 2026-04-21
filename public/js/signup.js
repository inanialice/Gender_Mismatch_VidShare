// Function copied directly from the MDN web docs:
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/random
// The maximum is exclusive and the minimum is inclusive
function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min)) + min;
}

const USERNAME_BUTTONS = '.ui.vertical.basic.buttons button.ui.button';
const DEFAULT_USERNAME_WARNING = "Don't forget to create or choose a username!";
const USERNAME_FORMAT_HINT = 'Use 3–24 characters: letters, numbers, and underscores only.';

function getGeneratedUsername() {
    const $btn = $(USERNAME_BUTTONS + '.green');
    if (!$btn.length) {
        return '';
    }
    return $btn.find('h2').clone().children().remove().end().text().trim();
}

function getResolvedUsername() {
    const custom = $('#customUsername').val().trim();
    if (custom.length) {
        return custom;
    }
    return getGeneratedUsername();
}

function hasChosenUsername() {
    const custom = $('#customUsername').val().trim();
    if (custom.length) {
        return true;
    }
    return $(USERNAME_BUTTONS + '.green').length > 0;
}

function hasValidUsername() {
    const custom = $('#customUsername').val().trim();
    if (custom.length) {
        return /^[a-z0-9_]{3,24}$/i.test(custom);
    }
    return $(USERNAME_BUTTONS + '.green').length > 0;
}

function setUsernameWarning(text) {
    $('#username-warning-header').text(text);
}

function showUsernameWarningMessage(text) {
    setUsernameWarning(text);
    $('.ui.warning.message.username').removeClass('hidden').show();
}

function hideUsernameWarningIfResolved() {
    if (hasValidUsername()) {
        $('.ui.warning.message.username').hide();
    }
}

function canContinue() {
    const hasUsername = hasChosenUsername();
    const hasPicture = $('.image.green').length > 0;
    if (hasUsername && hasPicture) {
        $(".ui.big.labeled.icon.button").addClass("green");
    } else {
        $(".ui.big.labeled.icon.button").removeClass("green");
    }
}

$(window).on("load", async function() {
    let actorUserNames;
    await $.getJSON("/actors", function(json) {
        actorUserNames = json["usernames"];
    });

    let timeout;
    $('.ui.dropdown').dropdown({
        // Choose an initial
        onChange: function(value, text, $selectedItem) {
            // clear any usernames waiting to be loaded
            clearTimeout(timeout);
            $(USERNAME_BUTTONS + " h2.username").empty();
            $(USERNAME_BUTTONS).removeClass("green");

            const firstInitial = $('select[name="firstInitial"]').val();
            const lastInitial = $('select[name="lastInitial"]').val();

            if (firstInitial !== '' && lastInitial !== '') {
                $(USERNAME_BUTTONS).addClass("loading");
                const randomNames = [];
                while (randomNames.length < 3) {
                    const randomNumber = String(getRandomInt(1, 999)).padStart(3, '0');
                    const randomName = `${firstInitial.toLowerCase()}${lastInitial.toLowerCase()}${randomNumber}`;
                    if (!randomNames.includes(randomName) && !actorUserNames.includes(randomName)) {
                        randomNames.push(randomName);
                    }
                }
                timeout = setTimeout(function() {
                    $(USERNAME_BUTTONS).removeClass("loading");
                    for (var i = 0; i < 3; i++) {
                        $(`h2.username_${i+1}`).text(randomNames[i]);
                    }
                }, 750);
            }
            canContinue();
        }
    });

    $('#customUsername').on('input', function() {
        $(USERNAME_BUTTONS).removeClass("green loading");
        $(USERNAME_BUTTONS + ' h2 i.check.icon.green').remove();
        canContinue();
        if ($('#customUsername').val().trim().length) {
            hideUsernameWarningIfResolved();
        }
    });

    // Choose a full username (generated options)
    $(USERNAME_BUTTONS).on('click', function() {
        // only allow selection if there are values loaded into the buttons
        if ($(this).find("h2") && $(this).find("h2").text().trim() == '') {
            return;
        }
        $('#customUsername').val('');
        // clear any usernames selected
        $(USERNAME_BUTTONS).removeClass("green");
        $(USERNAME_BUTTONS + ' h2 i.check.icon.green').remove();

        $(this).addClass("green");
        $(this).find("h2").prepend('<i class="check icon green hidden"></i>');
        $(this).find("h2").append('<i class="check icon green"></i>');

        canContinue();

        if ($('.ui.warning.message.username').is(":visible")) {
            $('.ui.warning.message.username').hide();
        }
    });

    // Click a photo
    $('a.avatar').on('click', function() {
        // clear any photos selected
        $('.image').removeClass("green");
        $(".image i.icon.green.check").addClass("hidden");

        $(this).parent('.image').addClass("green");
        $(this).siblings('i.icon').removeClass("hidden");

        canContinue();

        if ($('.ui.warning.message.photo').is(":visible")) {
            $('.ui.warning.message.photo').hide();
        }
    });

    $(".ui.big.labeled.icon.button").on('click', function() {
        const username = getResolvedUsername();
        const src = $('.image.green a.avatar img').attr('src');
        const custom = $('#customUsername').val().trim();

        if ($(this).hasClass("green")) {
            if (custom.length && !/^([a-z0-9_]{3,24})$/i.test(custom)) {
                showUsernameWarningMessage(USERNAME_FORMAT_HINT);
                $('.ui.warning.message.username')[0].scrollIntoView({
                    behavior: "smooth",
                    block: "center"
                });
                return;
            }
            $(this).addClass('loading disabled');
            $.post(`/signup${window.location.search}`, {
                username: username,
                photo: src,
                _csrf: $('meta[name="csrf-token"]').attr('content')
            }).done(function(json) {
                if (json["result"] === "success") {
                    window.location.href = '/account/interest';
                } else if (json.message) {
                    showUsernameWarningMessage(json.message);
                    $('.ui.warning.message.username')[0].scrollIntoView({
                        behavior: "smooth",
                        block: "center"
                    });
                }
            }).fail(function(xhr) {
                const json = xhr.responseJSON;
                const msg = (json && json.message) ? json.message : 'Could not create account. Please try again.';
                showUsernameWarningMessage(msg);
                $('.ui.warning.message.username')[0].scrollIntoView({
                    behavior: "smooth",
                    block: "center"
                });
            }).always(function() {
                $(".ui.big.labeled.icon.button").removeClass('loading disabled');
            });
        } else {
            if (!hasValidUsername() || username === undefined || username.trim() === '') {
                if ($('.ui.warning.message.username').is(":hidden")) {
                    $('.ui.warning.message.username').show();
                    $('.ui.warning.message.username').removeClass("hidden");
                }
                if (custom.length && !/^([a-z0-9_]{3,24})$/i.test(custom)) {
                    showUsernameWarningMessage(USERNAME_FORMAT_HINT);
                } else {
                    setUsernameWarning(DEFAULT_USERNAME_WARNING);
                }
            }
            if (src === undefined || src.trim() === '') {
                if ($('.ui.warning.message.photo').is(":hidden")) {
                    $('.ui.warning.message.photo').show();
                    $('.ui.warning.message.photo').removeClass("hidden");
                }
            }
            $('.ui.warning.message')[0].scrollIntoView({
                behavior: "smooth",
                block: "center"
            });
        }
    });

    $('.message .close')
        .on('click', function() {
            $(this)
                .closest('.message')
                .transition('fade');
        });
});
